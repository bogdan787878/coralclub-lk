// Связь с API Coral Club. Два режима:
//  - «сервер»: страницу отдаёт server.mjs, запросы идут через него (куки и токен хранит сервер);
//  - «напрямую»: статичная страница (например, GitHub Pages) сама ходит на api.coral.club.
//    Токен хранится только в sessionStorage этой вкладки. API отдаёт CORS для любых сайтов.
// Прямой режим можно включить и локально: добавьте ?direct=1 к адресу.
export const API = "https://api.coral.club/api/v1";
const KEY = "lk_direct_token";
/** Только для разработки на localhost: адрес мока API (ключ sessionStorage lk_cc4_base, как в @coral/api). */
const apiBase = () => {
  try {
    return (/^(localhost|127\.0\.0\.1)$/.test(location.hostname) && sessionStorage.getItem("lk_cc4_base")) || API;
  } catch {
    return API;
  }
};

let mode = "server";
let cfg = { applicationToken: "", deliveryId: "RU", language: "ru", shopWorker: "" };
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

async function call(url, { method = "GET", body, bearer, headers: extra } = {}) {
  try {
    const r = await fetch(url, {
      method,
      headers: { ...(body !== undefined ? { "content-type": "application/json" } : {}), ...(bearer ? { authorization: `Bearer ${bearer}` } : {}), ...(extra ?? {}) },
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
  return call(apiBase() + path.replace("/restApi/proxyCC4", ""), { ...opts, bearer: token });
}

/**
 * Чек-аут магазина (/sv-api/*) для собственной страницы оформления. Магазин принимает такие запросы только по своей
 * сессии, поэтому они идут через посредника, у которого эта сессия есть:
 *  - режим «сервер»: стенд (npm start), /lk/shop/...;
 *  - режим «напрямую» (GitHub Pages): Cloudflare Worker из config.json (shopWorker), см. worker/. Он открывает сессию
 *    магазина по токену API кабинета, пароль ему не нужен.
 * Без того и другого shopReady() = false, и корзина ведёт на страницу оформления магазина.
 */
const SID_KEY = "lk_shop_sid";
const readSid = () => {
  try {
    return sessionStorage.getItem(SID_KEY);
  } catch {
    return null;
  }
};
const saveSid = (v) => {
  try {
    v ? sessionStorage.setItem(SID_KEY, v) : sessionStorage.removeItem(SID_KEY);
  } catch {
    /* без хранилища сессию магазина откроем заново после обновления страницы */
  }
};
const worker = () => String(cfg.shopWorker || "").replace(/\/+$/, "");
export const shopReady = () => mode === "server" || (mode === "direct" && Boolean(worker()) && Boolean(token));

async function workerSession(force = false) {
  const have = force ? null : readSid();
  if (have) return have;
  const r = await call(`${worker()}/session`, { method: "POST", bearer: token });
  const sid = r.json?.sid;
  if (!sid) throw new Error(r.json?.error || `Посредник ответил ${r.status}`);
  saveSid(sid);
  return sid;
}

export async function shopRequest(path, opts = {}) {
  if (mode === "server") return call(`lk/shop${path}`, opts);
  if (!shopReady()) return { status: 0, ok: false, json: null, text: "Оформление внутри ЛК недоступно: нет посредника (npm start или Worker)", type: "" };
  try {
    let r = await call(`${worker()}/shop${path}`, { ...opts, headers: { "x-lk-sid": await workerSession() } });
    if (r.status === 401 && r.json?.error === "session") {
      // сессия магазина истекла (час без обращений): открываем заново, один раз
      r = await call(`${worker()}/shop${path}`, { ...opts, headers: { "x-lk-sid": await workerSession(true) } });
    }
    return r;
  } catch (e) {
    return { status: 0, ok: false, json: null, text: String(e.message ?? e), type: "" };
  }
}

/** Настройки, которые отдаёт посредник (ключ поиска адреса Google): стенд или Worker. */
export async function shopConfig() {
  try {
    const r = mode === "server" ? await call("lk/config") : worker() ? await call(`${worker()}/config`) : null;
    return r?.json ?? {};
  } catch {
    return {};
  }
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
  saveSid(null);
}
