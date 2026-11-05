// Связь с API Coral Club. Два режима:
//  - «сервер»: страницу отдаёт server.mjs, запросы идут через него (куки и токен хранит сервер);
//  - «напрямую»: статичная страница (например, GitHub Pages) сама ходит на api.coral.club.
//    Токен хранится только в sessionStorage этой вкладки. API отдаёт CORS для любых сайтов.
// Прямой режим можно включить и локально: добавьте ?direct=1 к адресу.
export const API = "https://api.coral.club/api/v1";
const KEY = "lk_direct_token";

let mode = "server";
let cfg = { applicationToken: "", deliveryId: "RU", language: "ru" };
let token = null;

const read = () => {
  try {
    return sessionStorage.getItem(KEY);
  } catch {
    return null;
  }
};
const save = (t) => {
  try {
    t ? sessionStorage.setItem(KEY, t) : sessionStorage.removeItem(KEY);
  } catch {
    /* без хранилища вход пропадёт после обновления страницы */
  }
};
const find = (o) => {
  if (!o || typeof o !== "object") return undefined;
  if (typeof o.access_token === "string") return o.access_token;
  for (const v of Object.values(o)) {
    const t = find(v);
    if (t) return t;
  }
  return undefined;
};
const parse = (text) => {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
};

async function call(url, { method = "GET", body, bearer } = {}) {
  try {
    const r = await fetch(url, {
      method,
      headers: { ...(body !== undefined ? { "content-type": "application/json" } : {}), ...(bearer ? { authorization: `Bearer ${bearer}` } : {}) },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    const text = await r.text();
    return { status: r.status, ok: r.ok, json: parse(text), text, type: r.headers.get("content-type") ?? "" };
  } catch (err) {
    return { status: 0, ok: false, json: null, text: String(err.message ?? err), type: "" };
  }
}

/** Определяет режим и сообщает, есть ли уже вход. */
export async function init(config) {
  cfg = { ...cfg, ...config };
  const forced = new URLSearchParams(location.search).has("direct");
  if (!forced) {
    try {
      const r = await fetch("lk/state", { cache: "no-store" });
      const j = r.ok ? await r.json() : null;
      if (j && "loggedIn" in j) {
        mode = "server";
        return { mode, loggedIn: j.loggedIn, token: j.token };
      }
    } catch {
      /* сервера нет: статичный хостинг */
    }
  }
  mode = "direct";
  token = read();
  return { mode, loggedIn: Boolean(token), token: Boolean(token) };
}

export const currentMode = () => mode;

/** Запрос в формате путей кабинета: /restApi/proxyCC4/… */
export async function request(path, opts = {}) {
  if (mode === "server") return call(path.replace(/^\/restApi\//, "/api/"), opts);
  if (!path.startsWith("/restApi/proxyCC4/")) return { status: 0, ok: false, json: null, text: "В прямом режиме доступны только адреса /restApi/proxyCC4/…", type: "" };
  return call(API + path.replace("/restApi/proxyCC4", ""), { ...opts, bearer: token });
}

/**
 * Чек-аут магазина (/sv-api/*) для собственной страницы оформления. Магазин принимает такие запросы только по своей
 * сессии, поэтому они идут через стенд (npm start), у которого есть авторизованная сессия магазина.
 * На статичном хостинге (прямой режим) такой сессии нет: shopReady() = false.
 */
export const shopReady = () => mode === "server";
export async function shopRequest(path, opts = {}) {
  if (mode !== "server") return { status: 0, ok: false, json: null, text: "Оформление внутри ЛК работает при запуске стенда (npm start)", type: "" };
  return call(`lk/shop${path}`, opts);
}

/** Вход: логин и пароль уходят только на сервер Coral Club (через стенд или напрямую). */
export async function login({ login: user, password, timeZone }) {
  if (mode === "server") {
    const r = await call("lk/login", { method: "POST", body: { login: user, password, timeZone } });
    return r.json ?? { ok: false, step: "server", message: `Стенд ответил ${r.status}` };
  }
  const s = await call(`${API}/auth/session`, { method: "POST", body: { applicationToken: cfg.applicationToken, country: cfg.deliveryId, language: cfg.language } });
  const sessionToken = find(s.json);
  if (!sessionToken) return { ok: false, step: "session", status: s.status, message: s.json?.message || `Не открыли сессию API (${s.status})` };
  const l = await call(`${API}/auth/login`, { method: "POST", body: { login: user, password }, bearer: sessionToken });
  if (!l.ok || l.json?.success === false) return { ok: false, step: "auth", status: l.status, message: l.json?.message || l.json?.error || `API ответил ${l.status}` };
  token = find(l.json) || sessionToken;
  save(token);
  return { ok: true, token: true, sessionStatus: s.status };
}

export async function logout() {
  if (mode === "server") return void (await call("lk/logout", { method: "POST" }));
  if (token) await call(`${API}/auth/session`, { method: "DELETE", bearer: token });
  token = null;
  save(null);
}
