// Куда вести участника после создания заказа: страница оплаты магазина /order/payment/<номер>/ отвечает редиректом
// (иногда несколькими) на страницу банка либо отдаёт форму/ссылку на банк. Браузер с чужого домена такую страницу
// прочитать не может (нет сессии, а заголовок Location при проксировании терялся), поэтому её проходит посредник
// с сессией участника и возвращает странице готовый адрес банка. Модуль на стандартном fetch: Node (стенд) и Worker.
import { cookieHeader, storeCookies } from "./bootstrap.mjs";

const SHOP_HOST = /(^|\.)(coral\.club|coralclub\.[a-z]+)$/i;
const MAX_HOPS = 8;

/** Что на странице оплаты (без параметров и значений): для разбора, когда банк не найден. */
export function describePage(html, base) {
  const hostPath = (raw) => {
    try {
      const u = new URL(String(raw).replace(/&amp;/g, "&"), base);
      return `${u.host}${u.pathname.replace(/\d{5,}/g, "<номер>")}`;
    } catch {
      return String(raw).slice(0, 40);
    }
  };
  const uniq = (a) => [...new Set(a)].slice(0, 12);
  return {
    title: (html.match(/<title>([^<]*)/i)?.[1] ?? "").trim().slice(0, 80),
    size: html.length,
    forms: uniq([...html.matchAll(/<form([^>]*)>/gi)].map((m) => `${(m[1].match(/method="([^"]*)"/i)?.[1] ?? "GET").toUpperCase()} ${hostPath(m[1].match(/action="([^"]*)"/i)?.[1] ?? "")}`)),
    externalLinks: uniq([...html.matchAll(/href="(https?:\/\/[^"]+)"/gi)].map((m) => hostPath(m[1])).filter((h) => !SHOP_HOST.test(h.split("/")[0]))),
    scripts: uniq([...html.matchAll(/<script[^>]*src="([^"]+)"/gi)].map((m) => hostPath(m[1]))),
    words: uniq([...html.matchAll(/(yookassa|yoomoney|tinkoff|tbank|sberbank|sber|alfabank|cloudpayments|payture|robokassa|widget|checkout|acquiring)/gi)].map((m) => m[1].toLowerCase())),
    shopBlocks: uniq([...html.matchAll(/class="([^"]*(?:pay|order)[^"]*)"/gi)].map((m) => m[1].slice(0, 50))),
  };
}

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

/** Форма на внешний https-адрес где угодно на странице (платёжные страницы магазина не всегда кладут её в блок paysys). */
function anyExternalForm(html, base) {
  for (const f of html.matchAll(/<form([^>]*)>([\s\S]*?)<\/form>/gi)) {
    const action = f[1].match(/action="([^"]*)"/i)?.[1];
    if (!action) continue;
    try {
      const u = new URL(action.replace(/&amp;/g, "&"), base);
      if (!isExternalHttps(u)) continue;
      const fields = {};
      for (const i of f[2].matchAll(/<input[^>]*>/gi)) {
        const name = i[0].match(/name="([^"]*)"/i)?.[1];
        if (name) fields[name] = (i[0].match(/value="([^"]*)"/i)?.[1] ?? "").replace(/&amp;/g, "&");
      }
      return { url: u.href, method: (f[1].match(/method="([^"]*)"/i)?.[1] ?? "POST").toUpperCase() === "GET" ? "GET" : "POST", fields };
    } catch {
      /* не адрес */
    }
  }
  return null;
}

/** Варианты оплаты на странице заказа: [{ name, value: "156:bank_card" }]. */
export function paysystemOptions(html) {
  const raw = html.match(/class="paysystems[^"]*"[^>]*data-select-option='JSON::([^']*)'/i)?.[1];
  try {
    const list = JSON.parse(raw ?? "[]");
    return Array.isArray(list) ? list.filter((o) => o && typeof o.value === "string") : [];
  } catch {
    return [];
  }
}

/** Код способа без номера платёжной службы: "160:bank_card" → "bank_card", "bank_card" → "bank_card". */
const methodKey = (v) => String(v ?? "").split(":").pop().toLowerCase();

/** Кнопка банка в ответе orderSelectPaysystem (как getPayButton на странице: .pay-button, button, a, form). */
export function gatewayFromAction(actionHtml, base) {
  const wrapped = `<div class="paysys-payment">${actionHtml}</div></div>`;
  const direct = gatewayFromHtml(wrapped, base) ?? anyExternalForm(actionHtml, base);
  if (direct) return direct;
  // ссылка или кнопка с адресом банка в атрибуте (href, data-href, onclick location)
  for (const m of actionHtml.matchAll(/(?:href|data-href|data-url|formaction)="([^"]+)"|location(?:\.href)?\s*=\s*['"]([^'"]+)['"]/gi)) {
    try {
      const u = new URL((m[1] ?? m[2]).replace(/&amp;/g, "&"), base);
      if (isExternalHttps(u)) return { url: u.href, method: "GET", fields: {} };
    } catch {
      /* не адрес */
    }
  }
  return null;
}

async function choosePaysystem({ jar, html, url, method }) {
  const options = paysystemOptions(html);
  if (!options.length) return { hops: [] };
  const sessid = html.match(/['"]bitrix_sessid['"]\s*:\s*['"]([a-f0-9]+)['"]/i)?.[1];
  const orderId = html.match(/order_id\s*:\s*['"](\d+)['"]/)?.[1] ?? url.pathname.match(/\/(\d{5,})\//)?.[1];
  const delivery = html.match(/delivery\s*:\s*['"]([^'"]*)['"]/)?.[1] ?? "";
  if (!sessid || !orderId) return { error: "На странице оплаты нет данных для выбора способа", hops: [] };
  const want = methodKey(method) || "bank_card";
  const pick = options.find((o) => methodKey(o.value) === want) ?? options.find((o) => methodKey(o.value) === "bank_card") ?? options[0];
  const ajax = new URL("/ajax/order/orderSelectPaysystem.php", url);
  const cookie = cookieHeader(jar);
  const res = await fetch(ajax.href, {
    method: "POST",
    redirect: "manual",
    headers: { accept: "application/json", "content-type": "application/x-www-form-urlencoded; charset=UTF-8", "x-requested-with": "XMLHttpRequest", referer: url.href, ...(cookie ? { cookie } : {}) },
    body: new URLSearchParams({ sessid, delivery, order_id: orderId, paysystem: pick.value }).toString(),
  });
  storeCookies(jar, res);
  const hops = [`${res.status} ${ajax.host}${ajax.pathname} (${methodKey(pick.value)})`];
  const data = await res.json().catch(() => null);
  const action = typeof data?.paysystems_action === "string" ? data.paysystems_action : "";
  if (!action) return { error: "Магазин не отдал блок банка для выбранного способа оплаты", hops };
  const target = gatewayFromAction(action, url);
  if (target) return { target, hops };
  // блок пришёл, но в нём переход на страницу магазина (например, промежуточная страница оплаты): идём по ней
  const inner = action.match(/(?:href|action)="([^"]+)"/i)?.[1];
  if (inner) {
    try {
      const next = new URL(inner.replace(/&amp;/g, "&"), url);
      if (next.protocol === "https:" && SHOP_HOST.test(next.hostname) && !/^\/order\/payment\//.test(next.pathname)) {
        const r = await resolveFrom({ jar, url: next, method });
        return { target: r.target, error: r.error, hops: [...hops, ...(r.hops ?? [])] };
      }
    } catch {
      /* не адрес */
    }
  }
  return { error: "В блоке банка нет адреса банка", hops, actionShape: describePage(action, url) };
}

/**
 * GET страницы оплаты с сессией участника (jar) и проход по редиректам магазина до первого внешнего адреса.
 * Возвращает { target: { url, method, fields } } либо { error, hops } (hops: только статусы и пути, без параметров).
 */
export async function resolvePayment({ jar, origin, path, method }) {
  return resolveFrom({ jar, url: new URL(path, origin), method });
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
export async function resolveFrom({ jar, url: start, method = "" }) {
  let url = start;
  const hops = [];
  const seen = new Set();
  for (let i = 0; i < MAX_HOPS; i++) {
    // магазин гоняет по кругу (список заказов ↔ index.php), когда у заказа нет онлайн-оплаты: стоп
    const key = url.host + url.pathname;
    if (seen.has(key)) return { error: "У заказа нет онлайн-оплаты (магазин возвращает в список заказов)", hops };
    seen.add(key);
    // чек-аут магазина перед переходом на оплату ставит cookie orderResultId=<номер>: без неё страница оплаты
    // не узнаёт «свой» заказ и уводит в список заказов (короткий адрес РФ/BY) или на вход
    const paying = url.pathname.match(/^\/order\/payment\/(\d+)\//);
    if (paying) jar.set("orderResultId", paying[1]);
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
    const target = gatewayFromHtml(html, url) ?? anyExternalForm(html, url);
    if (target) return { target, hops };
    // страница «Проверьте и оплатите ваш заказ»: блок банка пуст, пока не выбран способ оплаты. Сама страница по выбору
    // шлёт POST /ajax/order/orderSelectPaysystem.php и вставляет ответ (кнопку/форму банка) в .paysys-payment
    const chosen = await choosePaysystem({ jar, html, url, method });
    if (chosen.target) return { target: chosen.target, hops: [...hops, ...chosen.hops] };
    if (chosen.error) return { error: chosen.error, hops: [...hops, ...chosen.hops], page: describePage(html, url), ...(chosen.actionShape ? { action: chosen.actionShape } : {}) };
    return { error: res.ok ? "На странице оплаты нет перехода на банк" : `Страница оплаты ответила ${res.status}`, hops, page: describePage(html, url) };
  }
  return { error: "Слишком много переходов", hops };
}
