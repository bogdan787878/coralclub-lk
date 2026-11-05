#!/usr/bin/env node
/**
 * Стенд личного кабинета Coral Club: вход и страница с данными из API.
 *
 *   npm start        # http://localhost:3300
 *
 * Один маленький сервер без зависимостей. Браузер говорит только с ним:
 *  - /lk/login   — вход (логин и пароль уходят в /restApi/auth/ магазина, нигде не
 *                  сохраняются и не пишутся в лог), затем сессия API (auth/session);
 *  - /api/...    — запросы к /restApi/(proxyCC4|auth|registration)/... магазина с
 *                  куками и токеном этой сессии;
 *  - остальное   — статика из docs/.
 * Сессия живёт в памяти процесса: перезапуск = выход. Слушает только 127.0.0.1.
 */
import http from "node:http";
import os from "node:os";
import https from "node:https";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const CONFIG = JSON.parse(await readFile(path.join(ROOT, "docs", "config.json"), "utf8"));
const PORT = Number(process.env.LK_PORT ?? 3300);
/** По умолчанию только этот компьютер. Для проверки с телефона в той же сети: LK_HOST=0.0.0.0 */
const BIND = process.env.LK_HOST ?? "127.0.0.1";
const HOST = CONFIG.upstreamHost;
/** Пускаем наружу только эти ветки API магазина. */
const ALLOWED = /^\/restApi\/(proxyCC4|auth|registration)\//;

/** sid → { jar: Map<имя, значение>, token?: string, auth?: boolean } */
const sessions = new Map();

const parseCookies = (header = "") =>
  Object.fromEntries(
    header
      .split(/;\s*/)
      .filter(Boolean)
      .map((p) => {
        const i = p.indexOf("=");
        return [p.slice(0, i), decodeURIComponent(p.slice(i + 1))];
      }),
  );

function sessionOf(req, res) {
  const sid = parseCookies(req.headers.cookie).lk_sid;
  let s = sid && sessions.get(sid);
  if (!s) {
    const id = randomUUID();
    s = { jar: new Map() };
    sessions.set(id, s);
    res.setHeader("set-cookie", `lk_sid=${id}; Path=/; HttpOnly; SameSite=Strict`);
    s.id = id;
  } else s.id = sid;
  return s;
}

const readBody = (req, limit = 1_000_000) =>
  new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (c) => {
      size += c.length;
      if (size > limit) {
        reject(new Error("body too large"));
        req.destroy();
      } else chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });

/** Запрос к магазину с куками сессии; Set-Cookie ответа оседают в её банке. */
function upstream(sess, { method, urlPath, headers = {}, body }) {
  return new Promise((resolve, reject) => {
    // магазину нужна кука с часовым поясом, иначе методы личного кабинета дописывают к JSON скрипт
    if (!sess.jar.has("cci_detected_timezone")) sess.jar.set("cci_detected_timezone", encodeURIComponent(sess.tz ?? "Europe/Moscow"));
    const cookie = [...sess.jar].map(([k, v]) => `${k}=${v}`).join("; ");
    const h = {
      accept: "application/json, text/plain, */*",
      "user-agent": "coral-club-lk-test/0.1",
      ...headers,
      ...(cookie ? { cookie } : {}),
    };
    if (body !== undefined) h["content-length"] = Buffer.byteLength(body);
    if (sess.token && !h.authorization) h.authorization = `Bearer ${sess.token}`;
    const r = https.request({ host: HOST, path: urlPath, method, headers: h, timeout: 30000 }, (up) => {
      for (const c of up.headers["set-cookie"] ?? []) {
        const [pair] = c.split(";");
        const i = pair.indexOf("=");
        const name = pair.slice(0, i).trim();
        const value = pair.slice(i + 1); // как пришло, без перекодирования
        if (/expires=Thu, 01 Jan 1970/i.test(c) || value === "deleted") sess.jar.delete(name);
        else sess.jar.set(name, value);
      }
      const chunks = [];
      up.on("data", (c) => chunks.push(c));
      up.on("end", () =>
        resolve({
          status: up.statusCode ?? 0,
          type: up.headers["content-type"] ?? "text/plain",
          text: stripScript(Buffer.concat(chunks).toString("utf8")),
        }),
      );
    });
    r.on("timeout", () => r.destroy(new Error("upstream timeout")));
    r.on("error", reject);
    if (body !== undefined) r.write(body);
    r.end();
  });
}

/** Магазин иногда дописывает перед JSON скрипт установки часового пояса: оставляем один JSON. */
function stripScript(text) {
  if (!text.startsWith("<script>")) return text;
  const end = text.indexOf("</script>");
  const rest = end === -1 ? "" : text.slice(end + 9).trimStart();
  return rest.startsWith("{") || rest.startsWith("[") ? rest : text;
}

const json = (res, status, data) => {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  res.end(JSON.stringify(data));
};
const tryJson = (t) => {
  try {
    return JSON.parse(t);
  } catch {
    return null;
  }
};
/** Токен может лежать на разной глубине ответа. */
const findToken = (o) => {
  if (!o || typeof o !== "object") return undefined;
  if (typeof o.access_token === "string") return o.access_token;
  for (const v of Object.values(o)) {
    const t = findToken(v);
    if (t) return t;
  }
  return undefined;
};

/** Вход: логин и пароль берутся из тела запроса и уходят только в магазин. */
async function login(req, res, sess) {
  const input = tryJson(await readBody(req)) ?? {};
  const { login: user, password, deliveryId, language, timeZone } = input;
  if (!user || !password) return json(res, 400, { ok: false, step: "form", message: "Введите логин и пароль" });
  sess.jar.clear();
  sess.token = undefined;
  sess.auth = false;
  if (typeof timeZone === "string" && /^[A-Za-z_]+\/[A-Za-z_\-/]+$/.test(timeZone)) sess.tz = timeZone;

  const form = new URLSearchParams({ LOGIN: String(user), PASSWORD: String(password) }).toString();
  const a = await upstream(sess, {
    method: "POST",
    urlPath: "/restApi/auth/",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: form,
  });
  const ab = tryJson(a.text);
  const rejected = a.status >= 400 || ab?.status === false || ab?.success === false || ab?.error;
  const authToken = findToken(ab);
  if (authToken) sess.token = authToken;
  console.log(`login: POST /restApi/auth/ → ${a.status}${rejected ? " (отказ)" : ""}`);
  if (rejected) {
    return json(res, 200, {
      ok: false,
      step: "auth",
      status: a.status,
      message: ab?.message || ab?.error || ab?.errorTitle || `Магазин ответил ${a.status}`,
    });
  }

  sess.auth = true; // вход принят магазином

  // сессия API: токен для запросов в CC4
  const s = await upstream(sess, {
    method: "POST",
    urlPath: CONFIG.sessionPath,
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      applicationToken: CONFIG.applicationToken,
      deliveryId: deliveryId || CONFIG.deliveryId,
      language: language || CONFIG.language,
    }),
  });
  const sb = tryJson(s.text);
  const t = findToken(sb);
  if (t) sess.token = t;
  console.log(`login: POST ${CONFIG.sessionPath} → ${s.status}${t ? " (токен получен)" : " (токена нет)"}`);
  return json(res, 200, {
    ok: true,
    authStatus: a.status,
    sessionStatus: s.status,
    token: Boolean(sess.token),
    cookies: [...sess.jar.keys()],
    authKeys: ab && typeof ab === "object" ? Object.keys(ab) : [],
  });
}

async function proxy(req, res, sess, url) {
  const rest = url.pathname.replace(/^\/api/, "/restApi");
  if (!ALLOWED.test(rest)) return json(res, 403, { error: "Этот путь стенд не пропускает", path: rest });
  const method = req.method === "POST" ? "POST" : req.method === "GET" ? "GET" : null;
  if (!method) return json(res, 405, { error: "Только GET и POST" });
  const body = method === "POST" ? await readBody(req) : undefined;
  const headers = {};
  if (req.headers["content-type"]) headers["content-type"] = req.headers["content-type"];
  const started = Date.now();
  const r = await upstream(sess, { method, urlPath: rest + url.search, headers, body });
  console.log(`${method} ${rest} → ${r.status} (${Date.now() - started} мс)`);
  res.writeHead(r.status, { "content-type": r.type, "cache-control": "no-store" });
  res.end(r.text);
}

const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml" };

async function serveStatic(res, pathname) {
  const rel = pathname === "/" ? "/index.html" : pathname;
  const file = path.join(ROOT, "docs", path.normalize(rel).replace(/^(\.\.[/\\])+/, ""));
  if (!file.startsWith(path.join(ROOT, "docs"))) return json(res, 403, { error: "forbidden" });
  try {
    const data = await readFile(file);
    res.writeHead(200, { "content-type": TYPES[path.extname(file)] ?? "application/octet-stream", "cache-control": "no-store" });
    res.end(data);
  } catch {
    json(res, 404, { error: "not found" });
  }
}

http
  .createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);
      const sess = sessionOf(req, res);
      if (url.pathname === "/lk/login" && req.method === "POST") return await login(req, res, sess);
      if (url.pathname === "/lk/logout" && req.method === "POST") {
        sessions.delete(sess.id);
        return json(res, 200, { ok: true });
      }
      if (url.pathname === "/lk/state") return json(res, 200, { loggedIn: Boolean(sess.auth), token: Boolean(sess.token) });
      if (url.pathname === "/lk/config") {
        const { applicationToken, ...open } = CONFIG; // токен приложения наружу не нужен
        return json(res, 200, open);
      }
      if (url.pathname.startsWith("/api/")) return await proxy(req, res, sess, url);
      return await serveStatic(res, url.pathname);
    } catch (e) {
      console.error("ошибка:", e.message);
      json(res, 502, { error: String(e.message ?? e) });
    }
  })
  .listen(PORT, BIND, () => {
    console.log(`Стенд личного кабинета: http://localhost:${PORT}  (магазин: https://${HOST})`);
    if (BIND !== "127.0.0.1" && BIND !== "localhost") {
      console.log("Доступен из локальной сети. Адреса для телефона (та же Wi-Fi сеть):");
      for (const list of Object.values(os.networkInterfaces()))
        for (const i of list ?? []) if (i.family === "IPv4" && !i.internal) console.log(`  http://${i.address}:${PORT}`);
      console.log("Внимание: пароль вводится по http без шифрования; пользуйтесь только в доверенной сети.");
    }
  });

