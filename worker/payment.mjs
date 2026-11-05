// Куда вести участника после создания заказа: страница оплаты магазина /order/payment/<номер>/ отвечает редиректом
// (иногда несколькими) на страницу банка либо отдаёт форму/ссылку на банк. Браузер с чужого домена такую страницу
// прочитать не может (нет сессии, а заголовок Location при проксировании терялся), поэтому её проходит посредник
// с сессией участника и возвращает странице готовый адрес банка. Модуль на стандартном fetch: Node (стенд) и Worker.
import { cookieHeader, storeCookies } from "./bootstrap.mjs";

const SHOP_HOST = /(^|\.)(coral\.club|coralclub\.[a-z]+)$/i;
const MAX_HOPS = 8;

const isExternalHttps = (u) => u.protocol === "https:" && !SHOP_HOST.test(u.hostname);

/** Форма или ссылка на банк в блоке оплаты страницы магазина (разбор без DOM: годится и для Worker). */
export function gatewayFromHtml(html, base) {
  const block = html.match(/<[^>]+class="[^"]*paysys-payment[^"]*"[^>]*>([\s\S]*?)<\/(?:div|section)>\s*(?:<\/(?:div|section)>)?/i)?.[1];
  if (!block) return null;
  const decode = (s) => s.replace(/&amp;/g, "&");
  const link = block.match(/<a[^>]+href="([^"]+)"/i)?.[1];
  if (link) {
    try {
      const u = new URL(decode(link), base);
      if (isExternalHttps(u)) return { url: u.href, method: "GET", fields: {} };
    } catch {
      /* не ссылка на банк */
    }
  }
  const form = block.match(/<form([^>]*)>([\s\S]*?)<\/form>/i);
  if (form) {
    const action = form[1].match(/action="([^"]*)"/i)?.[1];
    const method = (form[1].match(/method="([^"]*)"/i)?.[1] ?? "POST").toUpperCase();
    try {
      const u = new URL(decode(action ?? ""), base);
      if (!isExternalHttps(u)) return null;
      const fields = {};
      for (const m of form[2].matchAll(/<input[^>]*>/gi)) {
        const name = m[0].match(/name="([^"]*)"/i)?.[1];
        if (name) fields[name] = decode(m[0].match(/value="([^"]*)"/i)?.[1] ?? "");
      }
      return { url: u.href, method: method === "GET" ? "GET" : "POST", fields };
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * GET страницы оплаты с сессией участника (jar) и проход по редиректам магазина до первого внешнего адреса.
 * Возвращает { target: { url, method, fields } } либо { error, hops } (hops: только статусы и пути, без параметров).
 */
export async function resolvePayment({ jar, origin, path }) {
  return resolveFrom({ jar, url: new URL(path, origin) });
}

/** Ссылка оплаты из API кабинета (paymentLink): только https и только адрес магазина вида /redirect.php. */
export function isPaymentLink(link) {
  try {
    const u = new URL(String(link));
    return u.protocol === "https:" && SHOP_HOST.test(u.hostname) && u.pathname === "/redirect.php";
  } catch {
    return false;
  }
}

/** Проход от абсолютного адреса (ссылки оплаты) до банка: сессия уже в самой ссылке, куки копятся в свежем jar. */
export async function resolveFrom({ jar, url: start }) {
  let url = start;
  const hops = [];
  const seen = new Set();
  for (let i = 0; i < MAX_HOPS; i++) {
    // магазин гоняет по кругу (список заказов ↔ index.php), когда у заказа нет онлайн-оплаты: стоп
    const key = url.host + url.pathname;
    if (seen.has(key)) return { error: "У заказа нет онлайн-оплаты (магазин возвращает в список заказов)", hops };
    seen.add(key);
    const cookie = cookieHeader(jar);
    const res = await fetch(url.href, { redirect: "manual", headers: { accept: "text/html,application/json,*/*", ...(cookie ? { cookie } : {}) } });
    storeCookies(jar, res);
    hops.push(`${res.status} ${url.host}${url.pathname}`);
    const loc = res.headers.get("location");
    if (res.status >= 300 && res.status < 400 && loc) {
      const next = new URL(loc, url);
      if (isExternalHttps(next)) return { target: { url: next.href, method: "GET", fields: {} }, hops };
      url = next;
      continue;
    }
    const html = await res.text();
    const target = gatewayFromHtml(html, url);
    if (target) return { target, hops };
    return { error: res.ok ? "На странице оплаты нет перехода на банк" : `Страница оплаты ответила ${res.status}`, hops };
  }
  return { error: "Слишком много переходов", hops };
}
