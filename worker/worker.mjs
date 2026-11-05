// Cloudflare Worker: посредник между статичным ЛК (GitHub Pages) и чек-аутом магазина.
// Магазин принимает методы чек-аута (/sv-api/*) только по своей сессии (cookie PHPSESSID), которую браузер с другого
// домена не может ни получить, ни передать. Worker держит эту сессию вместо браузера. Пароль не нужен: сессия участника
// открывается по токену API кабинета (ссылка web_views + заголовок x-access-token), см. bootstrap.mjs.
//
//   POST /session          Authorization: Bearer <токен API кабинета>  →  { sid }   (сессия магазина лежит в KV)
//   GET|POST /shop/<путь>  X-Lk-Sid: <sid>                              →  ответ магазина (только разрешённые пути)
//
//   GET /config            →  { placesKey }   (секрет GOOGLE_PLACES_KEY, если задан)
//
// Привязки: SESSIONS (KV), ALLOWED_ORIGINS (через запятую, например https://bogdan787878.github.io), CC4_BASE (по умолчанию
// https://api.coral.club). Токены, ссылки и значения кук нигде не логируются.
import { cookieHeader, openShopSession, storeCookies } from "./bootstrap.mjs";

const TTL = 3600; // сессия магазина живёт час с последнего обращения
const GET_OK = [
  /^\/sv-api\/(init|delivery|payments|pickpoints|profiles|receivers|promo|getOrder|order|checkLocality|getProfilePrice)$/,
  /^\/shop\/shop_basket\.php$/,
  /^\/restApi\/v4\/location\/getLocation$/,
  /^\/order\/payment\/\d+(\/[^/]+)?\/?$/,
];
const POST_OK = [/^\/sv-api\/order$/]; // единственный POST: создание заказа, только по нажатию участника на странице

const origins = (env) => String(env.ALLOWED_ORIGINS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
function cors(request, env) {
  const o = request.headers.get("origin");
  const h = { vary: "Origin", "cache-control": "no-store" };
  if (o && origins(env).includes(o)) {
    h["access-control-allow-origin"] = o;
    h["access-control-allow-headers"] = "authorization, content-type, x-lk-sid";
    h["access-control-allow-methods"] = "GET, POST, OPTIONS";
    h["access-control-max-age"] = "86400";
  }
  return h;
}
const reply = (request, env, status, data, extra = {}) =>
  new Response(typeof data === "string" ? data : JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8", ...cors(request, env), ...extra } });

/** Магазин иногда дописывает перед JSON скрипт часового пояса: оставляем один JSON. */
function stripScript(text) {
  if (!text.startsWith("<script>")) return text;
  const end = text.indexOf("</script>");
  const rest = end === -1 ? "" : text.slice(end + 9).trimStart();
  return rest.startsWith("{") || rest.startsWith("[") ? rest : text;
}

const newSid = () => {
  const b = crypto.getRandomValues(new Uint8Array(24));
  return [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
};

async function createSession(request, env) {
  const auth = request.headers.get("authorization") ?? "";
  if (!/^Bearer \S{10,}$/.test(auth)) return reply(request, env, 401, { error: "Нужен токен API кабинета" });
  const base = env.CC4_BASE ?? "https://api.coral.club";
  const r = await fetch(`${base}/api/v1/web_views/checkout_new`, { headers: { authorization: auth, accept: "application/json" } });
  if (r.status === 401) return reply(request, env, 401, { error: "Токен не принят, войдите заново" });
  const data = (await r.json().catch(() => null))?.data;
  const opened = await openShopSession(data);
  if (!opened.jar) return reply(request, env, 502, { error: opened.error ?? "Магазин не открыл сессию" });
  const sid = newSid();
  await env.SESSIONS.put(sid, JSON.stringify({ jar: [...opened.jar], host: opened.host }), { expirationTtl: TTL });
  return reply(request, env, 200, { sid, expiresIn: TTL });
}

async function shopCall(request, env, rest, url) {
  const sid = request.headers.get("x-lk-sid") ?? "";
  if (!/^[0-9a-f]{48}$/.test(sid)) return reply(request, env, 401, { error: "session" });
  const stored = await env.SESSIONS.get(sid);
  if (!stored) return reply(request, env, 401, { error: "session" });
  const { jar: pairs, host } = JSON.parse(stored);
  const jar = new Map(pairs);
  const allowed = request.method === "POST" ? POST_OK : request.method === "GET" ? GET_OK : [];
  if (!allowed.some((re) => re.test(rest))) return reply(request, env, 403, { error: "Этот путь чек-аута не пропускается", path: rest });
  const init = { method: request.method, redirect: "manual", headers: { accept: "application/json, text/html, */*", cookie: cookieHeader(jar) } };
  if (request.method === "POST") {
    init.body = await request.text();
    const ct = request.headers.get("content-type");
    if (ct) init.headers["content-type"] = ct;
  }
  const up = await fetch(`${host}${rest}${url.search}`, init);
  storeCookies(jar, up);
  await env.SESSIONS.put(sid, JSON.stringify({ jar: [...jar], host }), { expirationTtl: TTL });
  const text = stripScript(await up.text());
  return new Response(text, { status: up.status, headers: { "content-type": up.headers.get("content-type") ?? "text/plain", ...cors(request, env) } });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(request, env) });
    const o = request.headers.get("origin");
    if (o && !origins(env).includes(o)) return reply(request, env, 403, { error: "Источник не разрешён" });
    try {
      // ключ поиска адреса Google: браузерный (с ограничением по HTTP-референту), хранится секретом Worker, а не в репозитории
      if (url.pathname === "/config" && request.method === "GET") return reply(request, env, 200, { placesKey: env.GOOGLE_PLACES_KEY ?? "" });
      if (url.pathname === "/session" && request.method === "POST") return await createSession(request, env);
      if (url.pathname.startsWith("/shop/")) return await shopCall(request, env, url.pathname.slice("/shop".length), url);
      return reply(request, env, 404, { error: "not found" });
    } catch {
      return reply(request, env, 502, { error: "Посредник не смог ответить" });
    }
  },
};
