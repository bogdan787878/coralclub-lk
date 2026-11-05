// Сессия магазина по токену API кабинета, без пароля.
// API кабинета отдаёт ссылку web_views (data.url, data.access_token); магазин по такой ссылке открывает сессию участника.
// Модуль на стандартном fetch: работает и в Node (стенд), и в Cloudflare Worker. Токен и ссылку нигде не логируем.
export const SHOP = "https://coralclub.ru";

export const cookieHeader = (jar) => [...jar].map(([k, v]) => `${k}=${v}`).join("; ");

/** Set-Cookie ответа → в банк кук (имя → значение, как пришло). */
export function storeCookies(jar, res) {
  const list = res.headers.getSetCookie?.() ?? [];
  for (const c of list) {
    const [pair] = c.split(";");
    const i = pair.indexOf("=");
    if (i < 0) continue;
    const name = pair.slice(0, i).trim();
    const value = pair.slice(i + 1);
    if (/expires=Thu, 01 Jan 1970/i.test(c) || value === "deleted") jar.delete(name);
    else jar.set(name, value);
  }
}

/** GET по ссылке с переходами вручную: куки копятся в jar, заголовок авторизации не уходит на чужие хосты. */
export async function follow(url, jar, { headers = {}, max = 8, trace } = {}) {
  let u = url;
  let h = { ...headers };
  const origin = new URL(url).host;
  for (let i = 0; i < max; i++) {
    const cookie = cookieHeader(jar);
    const res = await fetch(u, { redirect: "manual", headers: { accept: "text/html,application/json,*/*", ...h, ...(cookie ? { cookie } : {}) } });
    storeCookies(jar, res);
    const p = new URL(u);
    trace?.push({ status: res.status, host: p.host, path: p.pathname });
    const loc = res.headers.get("location");
    if (res.status >= 300 && res.status < 400 && loc) {
      u = new URL(loc, u).href;
      if (new URL(u).host !== origin) delete h.authorization;
      continue;
    }
    return { res, finalUrl: u };
  }
  return { res: null, finalUrl: u };
}

/**
 * Как передать токен: проверено на реальной ссылке web_views, из одиннадцати способов сессию участника открывает один:
 * заголовок x-access-token со значением data.access_token на запросе к data.url (Authorization, куки, параметры
 * запроса и тело формы сессию не открывают). Признак успеха: /sv-api/profiles отвечает не 401.
 */
export const VARIANTS = [{ id: "x-access-token", build: (url, token) => ({ url, headers: { "x-access-token": token } }) }];
export const loggedIn = (jar) => jar.has("PHPSESSID");

/**
 * Открывает сессию магазина по ссылке `link` ({ url, access_token }) без пароля.
 * Возвращает { jar, host, trace } или { error, trace }. Успех проверяется самим магазином: /sv-api/profiles не 401.
 */
export async function openShopSession(link) {
  const trace = [];
  const url = link?.url;
  const token = link?.access_token;
  if (typeof url !== "string" || !/^https:\/\//.test(url) || !token) return { error: "нет ссылки или токена", trace };
  const host = new URL(url).origin;
  for (const v of VARIANTS) {
    const jar = new Map();
    const t = [];
    const { url: u, headers } = v.build(url, token);
    await follow(u, jar, { headers, trace: t });
    const { res } = await follow(`${host}/sv-api/profiles?language=ru`, jar, { headers: { accept: "application/json" } });
    const ok = Boolean(res) && res.status !== 401;
    trace.push({ variant: v.id, steps: t.map((s) => `${s.status} ${s.path}`), authorized: ok });
    if (ok) return { jar, host, trace };
  }
  return { error: "магазин не открыл сессию участника", trace };
}
