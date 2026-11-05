// Главная в духе банковского приложения: основной счёт, трансферный счёт тегом,
// быстрые действия и виджеты показателей. Данные из API кабинета (CC4).
import { metricsMessage, rankRu, renderMetrics } from "./metrics.js";
import { PRE, RANKS } from "./ranks.js";
import { attachHints } from "./hint.js";
import { computeTasks, lineLabel, personName, rankName } from "./tasks.js";
import { createShop } from "./shop.js";

const P = "/restApi/proxyCC4";
const tz = String(new Date().getTimezoneOffset()); // как просит API: минуты смещения, например -180

const ICON = {
  tHome: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 11l8-7 8 7v8.500a1.500 1.500 0 0 1-1.500 1.500H15v-6H9v6H5.500A1.500 1.500 0 0 1 4 19.500z"/></svg>`,
  tCat: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h7M3 12h5M3 18h7"/><circle cx="15.500" cy="12" r="4"/><path d="M18.500 15l3 3"/></svg>`,
  tCart: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2.500 4H5l2.200 11h11l2-8H6.200"/><circle cx="9" cy="19.500" r="1.300"/><circle cx="17" cy="19.500" r="1.300"/></svg>`,
  tHeart: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20.500s-7.500-4.600-9.200-9.400C1.600 7.700 3.700 4.500 7 4.500c2 0 3.400 1 5 3 1.600-2 3-3 5-3 3.300 0 5.400 3.200 4.200 6.600-1.700 4.800-9.200 9.400-9.200 9.400z"/></svg>`,
  tUser: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4.500 20c.8-3.600 3.700-5.500 7.500-5.500s6.700 1.900 7.500 5.500"/></svg>`,
  crown: `<svg viewBox="0 0 48 40" fill="currentColor"><path d="M6 12l9 9 9-15 9 15 9-9-4 22H10L6 12z"/></svg>`,
  points: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>`,
  bonus: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8"/><path d="M9 12.5l2 2 4-5"/></svg>`,
  invite: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="10" cy="8" r="3.5"/><path d="M3.5 20c.7-3.6 3.2-5.5 6.5-5.5s5.8 1.9 6.5 5.5M19 8v6M16 11h6"/></svg>`,
  down: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M6 13l6 6 6-6"/></svg>`,
  up: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5M6 11l6-6 6 6"/></svg>`,
  coin: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="12" cy="12" r="8"/><path d="M12 8v8M9.5 10.5c0-1 1-1.6 2.5-1.6s2.5.6 2.5 1.6-1 1.4-2.5 1.6-2.5.6-2.5 1.6 1 1.6 2.5 1.6 2.5-.6 2.5-1.6"/></svg>`,
  bag: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 8h14l-1 12H6L5 8zM9 8a3 3 0 016 0"/></svg>`,
  truck: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h11v10H3zM14 10h4l3 3v3h-7"/><circle cx="7.5" cy="17.5" r="1.8"/><circle cx="17.5" cy="17.5" r="1.8"/></svg>`,
  tick: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7"/></svg>`,
  team: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="8" r="3.2"/><path d="M3 19c.6-3.2 3-4.8 6-4.8s5.4 1.6 6 4.8"/><circle cx="17.5" cy="9" r="2.4"/><path d="M17 14.3c2.2.1 3.7 1.4 4.2 3.7"/></svg>`,
  next: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5l7 7-7 7"/></svg>`,
  card: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="6" width="18" height="13" rx="2.5"/><path d="M3 10.5h18M7 15h3"/></svg>`,
  doc: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 3h7l5 5v13H7z"/><path d="M14 3v5h5M10 13h6M10 17h6"/></svg>`,
  back: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg>`,
  close: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>`,
};

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const money = (amount, currency) => {
  try {
    return new Intl.NumberFormat("ru-RU", { style: "currency", currency, currencyDisplay: "narrowSymbol" }).format(amount);
  } catch {
    return `${amount.toLocaleString("ru-RU", { minimumFractionDigits: 2 })} ${currency}`;
  }
};
const plural = (n, [one, few, many]) => {
  const a = Math.abs(n) % 100;
  const b = a % 10;
  return a > 10 && a < 20 ? many : b === 1 ? one : b >= 2 && b <= 4 ? few : many;
};
// дробное число по-русски: «36,4 балла»
const points = (n) => `${n.toLocaleString("ru-RU", { maximumFractionDigits: 2 })} ${Number.isInteger(n) ? plural(n, ["балл", "балла", "баллов"]) : "балла"}`;
/** Месяц трансфера приходит как «ГГММ» (2611 = ноябрь 2026). */
const MONTHS_RU = ["январь", "февраль", "март", "апрель", "май", "июнь", "июль", "август", "сентябрь", "октябрь", "ноябрь", "декабрь"];
const monthLabel = (m) => {
  const s = String(m);
  return /^\d{4}$/.test(s) ? `${MONTHS_RU[Number(s.slice(2)) - 1] ?? s.slice(2)} 20${s.slice(0, 2)}` : s;
};
const dmy = (iso) => (/^\d{4}-\d{2}-\d{2}/.test(String(iso)) ? `${String(iso).slice(8, 10)}.${String(iso).slice(5, 7)}.${String(iso).slice(0, 4)}` : String(iso ?? ""));
const STATUS = { PAID: ["Оплачен", "ok"], UNPAID: ["Не оплачен", "wait"], CANCELED: ["Отменён", "bad"], CANCELLED: ["Отменён", "bad"], PARTIALLY_PAID: ["Оплачен частично", "wait"] };
const count = (n, forms) => `${n} ${plural(n, forms)}`;
/** «TEST TEST» → «Test Test»: имена, написанные заглавными, приводим к обычному виду. */
const titleCase = (s) => (s && s === s.toUpperCase() ? s.toLowerCase().replace(/(^|[\s-])(\S)/g, (_, a, b) => a + b.toUpperCase()) : s);
/** ФИО: фамилия, имя, отчество; имена капсом приводим к обычному виду. */
const fio = (p) => titleCase([p?.surname, p?.name, p?.patronymic].filter(Boolean).join(" ")) || "Участник";
const avatarHtml = (p) => (p?.avatar ? `<img src="${esc(p.avatar)}" alt="" referrerpolicy="no-referrer" />` : esc(initials(p)));
const initials = (p) => [p?.name, p?.surname].filter(Boolean).map((x) => x[0]).join("").toUpperCase() || "•";

/** Сообщение об ошибке из ответа API. */
function problem(r) {
  const j = r.json;
  if (j?.errors && typeof j.errors === "object") return Object.values(j.errors).flat().join(" ");
  return j?.message || (r.status === 401 ? "Нужно войти заново" : r.status === 403 ? "Нет доступа" : `Ошибка ${r.status || "сети"}`);
}

export function createHome(root, api, { onLogout } = {}) {
  const state = { profile: null, currency: "RUB", balance: null, points: null, pointsLoaded: false, months: [], orders: null, bonus: null, bonusMonths: 6, bonusShown: 8, ordersShown: 5, dash: null, member: null, metricsJson: null, transfer: null, transferShown: 8, struct: null, path: [] };

  root.innerHTML = `
    <div id="h-main">
      <section class="h-user-wrap" aria-label="Участник и ранги">
        <a class="h-who" href="#/profile" aria-label="Открыть профиль"><span class="h-avatar sk" id="h-ava"></span><b class="sk" id="h-name">—</b><i aria-hidden="true">${ICON.next}</i></a>
        <ul class="rkslider" id="h-ranks" tabindex="0" aria-label="Ранги"></ul>
        <div class="rkdots" id="h-dots" aria-hidden="true"></div>
      </section>
      <section class="h-balance" aria-label="Баланс">
        <button class="h-tag" id="h-tag" type="button" hidden></button>
        <button class="h-bal" id="h-bal" type="button" aria-label="Открыть Coral Кошелёк">
          <span class="h-amount sk" id="h-amount">—</span>
          <span class="h-caption">Счёт основной<i aria-hidden="true">${ICON.next}</i></span>
        </button>
      </section>
      <nav class="h-actions h-actions-4" aria-label="Быстрые действия">
        <button class="h-act" data-act="points" type="button"><span>${ICON.points}</span>Перевод баллов</button>
        <button class="h-act" data-act="bonus" type="button"><span>${ICON.bonus}</span>Перевод бонусов</button>
        <button class="h-act" data-act="payout" type="button"><span>${ICON.card}</span>Вывести на карту</button>
        <button class="h-act" data-act="invite" type="button"><span>${ICON.invite}</span>Пригласить в клуб</button>
      </nav>
      <a class="h-link" href="#/orders"><span class="h-link-ic" aria-hidden="true">${ICON.bag}</span><span class="h-link-text"><b>История заказов</b><span>Все заказы и их статусы</span></span></a>
      <a class="h-link" href="#/structure"><span class="h-link-ic" aria-hidden="true">${ICON.team}</span><span class="h-link-text"><b>Моя структура</b><span>Кто в вашей команде</span></span></a>
      <section class="home-metrics metrics" id="metrics"></section>
      <section class="home-metrics metrics" id="tasks" hidden></section>
    </div>
    <div id="h-shop" class="shop" hidden></div>
    <div id="h-detail" hidden>
      <header class="h-dhead"><a class="h-back" href="#/me" aria-label="Назад">${ICON.back}<span>Назад</span></a><h2 id="h-dtitle"></h2><span class="h-dside" aria-hidden="true"></span></header>
      <div id="h-wallet" hidden>
        <section class="h-balance" aria-label="Coral Кошелёк">
          <p class="h-amount sk" id="w-amount">—</p>
          <p class="h-caption">Coral Кошелёк</p>
        </section>
        <nav class="h-actions h-actions-4" aria-label="Действия по счёту">
          <button class="h-act" data-wact="pay" type="button"><span>${ICON.bag}</span>Оплатить бонусами</button>
          <button class="h-act" data-wact="payout" type="button"><span>${ICON.card}</span>Вывести на карту</button>
          <button class="h-act" data-wact="points" type="button"><span>${ICON.points}</span>Перевести баллы</button>
          <button class="h-act" data-wact="stmt" type="button"><span>${ICON.doc}</span>Выписка</button>
        </nav>
        <section class="h-card" id="h-bonus" aria-label="История по счету"></section>
      </div>
      <section class="h-card" id="h-orders" hidden aria-label="История заказов"></section>
      <div id="h-structure" hidden></div>
      <div id="h-profile" hidden></div>
      <div id="h-transfer" hidden>
        <section class="h-balance" aria-label="Трансферный счёт">
          <p class="h-amount sk" id="t-amount">—</p>
          <p class="h-caption">Трансферный счёт</p>
        </section>
        <nav class="h-actions h-actions-one" aria-label="Действия">
          <button class="h-act" data-act="points" type="button"><span>${ICON.points}</span>Перевод баллов</button>
        </nav>
        <section class="h-card" id="t-hist" aria-label="История"></section>
      </div>
    </div>
    <nav class="tabbar" id="tabbar" aria-label="Разделы">
      <a href="#/" data-tab="shop">${ICON.tHome}<span>Главная</span></a>
      <a href="#/catalog" data-tab="catalog">${ICON.tCat}<span>Каталог</span></a>
      <a href="#/cart" data-tab="cart">${ICON.tCart}<span>Корзина</span><em class="tb-badge" id="tb-badge" hidden></em></a>
      <a href="#/fav" data-tab="fav">${ICON.tHeart}<span>Избранное</span></a>
      <a href="#/me" data-tab="me">${ICON.tUser}<span>Профиль</span></a>
    </nav>
    <div class="sheet-wrap" id="sheet" hidden></div>`;

  const $ = (s) => root.querySelector(s);
  const metricsRoot = $("#metrics");
  const tasksRoot = $("#tasks");

  /* ---------- шимер: заглушки на время загрузки ---------- */
  const skLines = (n = 3) => `<div class="sk-lines" role="status" aria-label="Загрузка">${Array.from({ length: n }, (_, i) => `<i class="sk" style="width:${[92, 74, 58][i % 3]}%"></i>`).join("")}</div>`;
  const skRows = (n = 3) => `<ul class="sk-rows" role="status" aria-label="Загрузка">${Array.from({ length: n }, () => `<li><i class="sk sk-dot"></i><span><i class="sk" style="width:62%"></i><i class="sk" style="width:38%"></i></span><i class="sk sk-sum"></i></li>`).join("")}</ul>`;
  const skTiles = (title, n = 4, cls = "") => `<div class="mtop"><h2 class="mtitle">${title}</h2></div><div class="mgrid ${cls}" role="status" aria-label="Загрузка">${Array.from({ length: n }, () => `<div class="mcard sk-card"><i class="sk" style="width:70%"></i><i class="sk sk-big"></i><i class="sk" style="width:50%"></i></div>`).join("")}</div>`;

  /* ---------- нижний лист ---------- */
  const sheet = $("#sheet");
  function openSheet(title, node) {
    sheet.replaceChildren();
    const back = document.createElement("div");
    back.className = "sheet-back";
    back.onclick = closeSheet;
    const box = document.createElement("div");
    box.className = "sheet";
    box.setAttribute("role", "dialog");
    box.setAttribute("aria-label", title);
    const head = document.createElement("div");
    head.className = "sheet-head";
    head.innerHTML = `<h2>${esc(title)}</h2><button class="sheet-x" type="button" aria-label="Закрыть">${ICON.close}</button>`;
    head.querySelector("button").onclick = closeSheet;
    box.append(head, node);
    sheet.append(back, box);
    sheet.hidden = false;
  }
  function closeSheet() {
    sheet.hidden = true;
    sheet.replaceChildren();
  }
  document.addEventListener("keydown", (e) => e.key === "Escape" && closeSheet());

  const form = (html) => {
    const f = document.createElement("form");
    f.className = "sheet-form";
    f.innerHTML = html;
    return f;
  };
  const note = (f, text, kind = "") => {
    const n = f.querySelector(".note");
    n.textContent = text;
    n.className = `note ${kind}${!kind && /…$/.test(text) ? " busy" : ""}`;
  };

  /* ---------- перевод баллов ---------- */
  function sheetPoints() {
    const months = state.months.filter((m) => Number(m.balanceMonth) > 0);
    if (!months.length) return openSheet("Перевод баллов", Object.assign(document.createElement("p"), { className: "sheet-empty", textContent: "На трансферном счёте нет баллов для перевода." }));
    const f = form(`
      <label>Месяц
        <select name="month">${months.map((m) => `<option value="${esc(m.month)}">${esc(monthLabel(m.month))}: ${esc(points(Number(m.balanceMonth)))}</option>`).join("")}</select>
      </label>
      <label>Coral ID получателя
        <span class="inline"><input name="member" inputmode="numeric" pattern="[0-9]*" required /><button class="btn small ghost" type="button" id="check">Проверить</button></span>
      </label>
      <div class="person" hidden></div>
      <label>Сколько баллов
        <input name="amount" inputmode="decimal" required />
      </label>
      <button class="btn" type="submit" id="go">Перевести</button>
      <p class="note" role="status"></p>`);
    let person = null;
    const personBox = f.querySelector(".person");
    const check = async () => {
      const month = f.elements.month.value;
      const id = f.elements.member.value.trim();
      if (!id) return note(f, "Введите Coral ID", "bad");
      note(f, "Проверяем…");
      const r = await api(`${P}/personal-new/transfer/check-person?month=${encodeURIComponent(month)}&memberId=${encodeURIComponent(id)}&timeZone=${encodeURIComponent(tz)}`);
      const d = r.json?.data;
      if (!r.ok || !d) {
        person = null;
        personBox.hidden = true;
        return note(f, problem(r), "bad");
      }
      person = d.recipient ? d : null;
      personBox.hidden = false;
      personBox.innerHTML = `${d.avatar ? `<img src="${esc(d.avatar)}" alt="" />` : `<span class="h-avatar">${esc(initials(d))}</span>`}<div><b>${esc([d.surname, d.name].filter(Boolean).join(" "))}</b><span>${d.recipient ? "Может получить перевод" : "Не может получить перевод"}</span></div>`;
      note(f, d.recipient ? "" : "Этому участнику перевести нельзя", d.recipient ? "" : "bad");
    };
    f.querySelector("#check").onclick = check;
    f.onsubmit = async (e) => {
      e.preventDefault();
      if (!person) await check();
      if (!person) return;
      const amount = Number(String(f.elements.amount.value).replace(",", "."));
      const month = f.elements.month.value;
      const have = Number(months.find((m) => String(m.month) === month)?.balanceMonth ?? 0);
      if (!(amount > 0) || amount > have) return note(f, `Сумма от 0 до ${points(have)}`, "bad");
      if (!confirm(`Перевести ${points(amount)} участнику ${person.surname ?? ""} ${person.name ?? ""} (${person.id})?`)) return;
      f.querySelector("#go").disabled = true;
      note(f, "Отправляем…");
      const r = await api(`${P}/personal-new/transfer/create`, { method: "POST", body: { month: Number(month) || month, timeZone: tz, members: [{ member: Number(person.id), amount }] } });
      f.querySelector("#go").disabled = false;
      if (r.ok && r.json?.success !== false) {
        note(f, "Перевод выполнен", "ok");
        load();
        loadTransfer();
      } else note(f, problem(r), "bad");
    };
    openSheet("Перевод баллов", f);
  }

  /* ---------- перевод бонусов ---------- */
  function sheetBonus() {
    const f = form(`
      <p class="muted">Доступно: <b>${state.balance === null ? "—" : esc(money(state.balance, state.currency))}</b></p>
      <label>Coral ID получателя
        <input name="recipient" inputmode="numeric" pattern="[0-9]*" required />
      </label>
      <label>Сумма, ${esc(state.currency)}
        <input name="amount" inputmode="decimal" required />
      </label>
      <button class="btn" type="submit" id="go">Перевести</button>
      <p class="note" role="status"></p>`);
    f.onsubmit = async (e) => {
      e.preventDefault();
      const amount = Number(String(f.elements.amount.value).replace(",", "."));
      const recipientId = Number(f.elements.recipient.value);
      if (!(amount > 0) || (state.balance !== null && amount > state.balance)) return note(f, "Сумма больше нуля и не больше доступной", "bad");
      if (!confirm(`Перевести ${money(amount, state.currency)} участнику ${recipientId}?`)) return;
      f.querySelector("#go").disabled = true;
      note(f, "Отправляем…");
      const r = await api(`${P}/personal-new/transfer/bonus`, { method: "POST", body: { recipientId, amount, currency: state.currency } });
      f.querySelector("#go").disabled = false;
      if (r.ok && r.json?.success !== false) {
        note(f, "Перевод выполнен", "ok");
        load();
      } else note(f, problem(r), "bad");
    };
    openSheet("Перевод бонусов", f);
  }

  /* ---------- пригласить в клуб ---------- */
  async function sheetInvite() {
    const box = document.createElement("div");
    box.className = "sheet-form";
    box.innerHTML = skLines(2);
    openSheet("Пригласить в клуб", box);
    const r = await api(`${P}/account/ref_link`);
    // API может вернуть пустую ссылку: тогда личная страница участника (так её показывает «Рабочий стол»)
    const apiLink = r.json?.data?.link;
    const fallback = state.profile?.id ? `https://coral.club/${state.profile.id}.html` : "";
    const link = apiLink || fallback;
    if (!link) {
      box.textContent = r.ok ? "Ссылка для этого аккаунта пока не выдана." : problem(r);
      return;
    }
    box.innerHTML = `<p class="muted">${apiLink ? "Ваша личная ссылка: по ней человек регистрируется в клубе под вами." : "Ваша личная страница в клубе. Именной реферальной ссылки в API для этого аккаунта нет."}</p><input class="linkbox" readonly value="${esc(link)}" aria-label="Реферальная ссылка" /><div class="row2"><button class="btn" type="button" id="copy">Скопировать</button><button class="btn ghost" type="button" id="share" hidden>Поделиться</button></div><p class="note" role="status"></p>`;
    const nt = box.querySelector(".note");
    box.querySelector("#copy").onclick = async () => {
      try {
        await navigator.clipboard.writeText(link);
        nt.textContent = "Ссылка скопирована";
        nt.className = "note ok";
      } catch {
        box.querySelector(".linkbox").select();
        nt.textContent = "Выделил ссылку: скопируйте вручную";
      }
    };
    if (navigator.share) {
      const s = box.querySelector("#share");
      s.hidden = false;
      s.onclick = () => navigator.share({ title: "Приглашение в клуб", url: link }).catch(() => {});
    }
  }

  root.querySelectorAll(".h-act").forEach((b) => {
    b.onclick = () => ({ points: sheetPoints, bonus: sheetBonus, payout: sheetPayout, invite: sheetInvite })[b.dataset.act]();
  });

  $("#h-tag").onclick = () => {
    location.hash = "#/transfer";
  };
  $("#h-bal").onclick = () => {
    location.hash = "#/wallet";
  };

  /* ---------- Coral Кошелёк: действия по счёту ---------- */
  const textBox = (html) => Object.assign(document.createElement("div"), { className: "sheet-form", innerHTML: html });
  const shopUrl = () => `https://${state.shopHost || "coralclub.ru"}/`;

  /** Бонусами заказ оплачивается при оформлении в магазине: отдельного метода «оплатить заказ бонусами» в API нет. */
  function sheetPay() {
    const have = state.balance === null ? "—" : money(state.balance, state.currency);
    openSheet("Оплатить заказ бонусами", textBox(`<p class="muted">Доступно: <b>${esc(have)}</b></p><p>Бонусы списываются при оформлении заказа: на шаге оплаты в магазине выберите оплату бонусами.</p><a class="btn" href="${esc(shopUrl())}" target="_blank" rel="noopener">Перейти в магазин</a>`));
  }

  /** Выплата на карту: проверяем доступность и показываем заявки; саму заявку оформляет страница кабинета (ссылка из API). */
  async function sheetPayout() {
    const box = textBox(skRows(3));
    openSheet("Вывести на карту", box);
    const [avail, list, link] = await Promise.all([
      api(`${P}/personal-new/wallet/assetDistributor/is-available`),
      api(`${P}/personal-new/wallet/bonus-payouts/list`),
      api(`${P}/web_views/wallet/assetDistributor`),
    ]);
    const have = state.balance === null ? "—" : money(state.balance, state.currency);
    const ok = avail.ok ? avail.json?.data : null;
    const available = ok === true || ok?.available === true || ok?.isAvailable === true;
    const url = typeof link.json?.data === "string" ? link.json.data : link.json?.data?.url || link.json?.data?.link || "";
    const raw = list.json?.data;
    const items = Array.isArray(raw) ? raw : Array.isArray(raw?.items) ? raw.items : [];
    const PAY_STATUS = { cancel: "Отменена", canceled: "Отменена", cancelled: "Отменена", rejected: "Отклонена", new: "Создана", processing: "В обработке", approved: "Одобрена", paid: "Выплачена", done: "Выплачена" };
    const day = (v) => (/^\d{8}$/.test(String(v)) ? `${String(v).slice(6, 8)}.${String(v).slice(4, 6)}.${String(v).slice(0, 4)}` : dmy(String(v ?? "").slice(0, 10)));
    const rows = items.slice(0, 5).map((i) => {
      const sum = Number(i.payableAmount ?? i.amount ?? i.sum ?? i.total ?? NaN);
      const st = PAY_STATUS[String(i.status ?? "").toLowerCase()] ?? i.statusName ?? i.status ?? "";
      return `<li class="h-row"><div class="h-main"><b>Заявка${i.id ? ` № ${esc(i.id)}` : ""}</b><span>${esc([day(i.date ?? i.createdAt), st, i.name].filter(Boolean).join(" · "))}</span></div>${Number.isFinite(sum) ? `<span class="h-sum">${esc(money(sum, i.currency || state.currency))}</span>` : ""}</li>`;
    });
    const status = !avail.ok ? `<p class="note bad">Не удалось проверить доступность выплат: ${esc(problem(avail))}</p>` : available ? "" : `<p class="note">Выплата бонусов для этого аккаунта недоступна: раздел работает только для участников из России, при выполнении условий.</p>`;
    box.innerHTML = `<p class="muted">Доступно: <b>${esc(have)}</b></p>${status}${url && (available || !avail.ok) ? `<a class="btn" href="${esc(url)}" target="_blank" rel="noopener">Оформить заявку в кабинете</a>` : ""}${rows.length ? `<h3 class="sheet-sub">Мои заявки</h3><ul class="h-list">${rows.join("")}</ul>` : list.ok ? `<p class="muted">Заявок на выплату пока нет.</p>` : ""}`;
  }

  /** Выписка: файл для Excel из отчёта «Движение бонусов» за выбранный период. */
  function sheetStatement() {
    let months = 3;
    const f = form(`
      <p class="muted">Операции по Coral Кошельку: приход, расход, комментарии.</p>
      <div class="seg" role="group" aria-label="Период">${[1, 3, 6].map((n) => `<button type="button" data-m="${n}" class="${n === months ? "on" : ""}">${n} мес.</button>`).join("")}</div>
      <button class="btn" type="submit" id="go">Скачать для Excel</button>
      <p class="note" role="status"></p>`);
    f.querySelectorAll(".seg button").forEach((b) => {
      b.onclick = () => {
        months = Number(b.dataset.m);
        f.querySelectorAll(".seg button").forEach((x) => x.classList.toggle("on", x === b));
      };
    });
    f.onsubmit = async (e) => {
      e.preventDefault();
      note(f, "Готовим выписку…");
      const r = await api(`${P}/personal-new/wallet/baRep?monthReport=${months}`);
      const items = r.json?.data?.items;
      if (!r.ok || !Array.isArray(items)) return note(f, problem(r), "bad");
      const num = (v) => (v === null || v === undefined || v === "" ? "" : String(Number(v)).replace(".", ","));
      const cell = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
      const lines = [["Дата", "Операция", "Комментарий", "Приход", "Расход", "Валюта"].map(cell).join(";")];
      items.forEach((i) => lines.push([dmy(i.date), i.typeName, i.comment || i.eventId || "", num(i.income), num(i.expense), i.currency || state.currency].map(cell).join(";")));
      const url = URL.createObjectURL(new Blob(["\ufeff" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" }));
      const a = Object.assign(document.createElement("a"), { href: url, download: `coral-koshelek-${months}m.csv` });
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      note(f, `Выписка скачана: ${count(items.length, ["операция", "операции", "операций"])}`, "ok");
    };
    openSheet("Выписка", f);
  }

  root.querySelectorAll("[data-wact]").forEach((b) => {
    b.onclick = () => ({ pay: sheetPay, payout: sheetPayout, points: sheetPoints, stmt: sheetStatement })[b.dataset.wact]();
  });

  /* ---------- профиль участника (только чтение) ---------- */
  const POSITIONS = { DISTRIBUTOR: "Дистрибьютор", CONSUMER: "Потребитель", CANDIDATE: "Кандидат", FRIEND: "Друг клуба" };
  const rankLine = (code) => (code ? RANKS.find((r) => r.codes.includes(code))?.name ?? rankRu(code) : "");
  function paintProfile() {
    const p = state.profile;
    const root2 = $("#h-profile");
    if (!p) return void (root2.innerHTML = skRows(4));
    const rank = rankLine(p.fullRank || p.rank);
    // порядок кодов — снизу вверх, как в документации API; «максимальный» показываем, только если он выше текущего
    const LADDER = ["5*", "M", "PM", "jA", "A", "D", "SD", "GD", "ED", "DD", "DD+", "E", "SE", "SE1", "GE", "GE1", "PE", "PE1", "PE2", "PE3", "2SE", "StE"];
    const maxCode = String(p.maxRank ?? "").split("/")[0];
    const max = maxCode && LADDER.indexOf(maxCode) > LADDER.indexOf(p.fullRank || p.rank) ? rankLine(maxCode) : "";
    const row = (k, v, extra = "") => (v ? `<li><span>${esc(k)}</span><b>${esc(v)}${extra}</b></li>` : "");
    const mail = p.email ? `${esc(p.email)}${p.emailNeedConfirm || p.confirmedEmail === false ? ` <em class="pill wait">не подтверждён</em>` : ""}` : "";
    const where = [p.address?.city, p.address?.country].filter(Boolean).join(", ");
    const adviser = p.consultant ? titleCase([p.consultant.surname, p.consultant.name, p.consultant.patronymic].filter(Boolean).join(" ")) : "";
    const block = (title, rows) => (rows.join("") ? `<section class="h-card"><h3>${title}</h3><ul class="pf-list">${rows.join("")}</ul></section>` : "");
    root2.innerHTML = `
      <section class="pf-head"><span class="h-avatar pf-ava">${avatarHtml(p)}</span><h2>${esc(fio(p))}</h2><p>Coral ID ${esc(p.id)}</p></section>
      ${block("В клубе", [row("Статус", POSITIONS[p.position] ?? p.position), row("Ранг", rank), row("Максимальный ранг", max), row("Наставник", adviser)])}
      ${block("Контакты", [row("Телефон", p.phone), p.email ? `<li><span>E-mail</span><b>${mail}</b></li>` : "", row("Telegram", p.telegram), row("WhatsApp", p.whatsApp), row("Viber", p.viber)])}
      ${block("Личное", [row("Дата рождения", dmy(p.birthday)), row("Город", where)])}
      <p class="muted pf-note">Профиль только для просмотра: менять данные нужно в кабинете на сайте.</p>
      <button class="pf-logout" type="button">Выйти</button>`;
    root2.querySelector(".pf-logout").onclick = sheetLogout;
  }

  /** Подтверждение выхода: по iOS-привычке красная кнопка и «Отмена». */
  function sheetLogout() {
    const box = textBox(`<p class="muted">Чтобы снова войти, понадобятся логин и пароль.</p><div class="row2"><button class="btn ghost" type="button" data-no>Отмена</button><button class="btn pf-out" type="button" data-ok>Выйти</button></div>`);
    box.querySelector("[data-no]").onclick = closeSheet;
    box.querySelector("[data-ok]").onclick = async (e) => {
      e.currentTarget.disabled = true;
      await onLogout?.();
    };
    openSheet("Выйти из кабинета?", box);
  }

  /* ---------- данные ---------- */
  function paint() {
    const p = state.profile;
    $("#h-name").textContent = p ? fio(p) : "—";
    $("#h-name").classList.toggle("sk", !p);
    $("#h-ava").classList.toggle("sk", !p);
    $("#h-ava").innerHTML = avatarHtml(p);
    paintProfile();
    paintUser();
    $("#h-amount").textContent = state.balance === null ? "—" : money(state.balance, state.currency);
    $("#w-amount").textContent = $("#h-amount").textContent;
    for (const id of ["#h-amount", "#w-amount"]) $(id).classList.toggle("sk", state.balance === null && !state.balanceLoaded);
    const tag = $("#h-tag");
    tag.hidden = !state.pointsLoaded;
    if (state.pointsLoaded) {
      tag.innerHTML = `${ICON.crown}<span>Трансферный счёт · ${state.points === null ? "нет данных" : esc(points(state.points))}</span>`;
      tag.title = state.points === null ? "Метод трансферного счёта не вернул баллы" : "Баллы трансферного счёта за текущий месяц";
    }
    paintTransfer();
  }

  /* ---------- движение бонусов ---------- */
  const bonusRoot = $("#h-bonus");
  function paintBonus() {
    if (!state.bonus) return;
    if (state.bonus.error) {
      bonusRoot.innerHTML = `<h3>История по счету</h3><p class="muted">${esc(state.bonus.error)}</p>`;
      return;
    }
    const all = state.bonus.items.filter((i) => !i.currency || i.currency === state.currency);
    const income = all.reduce((a, i) => a + Number(i.income ?? 0), 0);
    const expense = all.reduce((a, i) => a + Number(i.expense ?? 0), 0);
    const rows = all.slice(0, state.bonusShown).map((i) => {
      const inc = i.income !== null && i.income !== undefined && Number(i.income) !== 0;
      const sum = inc ? Number(i.income) : Number(i.expense ?? 0);
      const sub = [dmy(i.date), i.comment || i.eventId || ""].filter(Boolean).join(" · ");
      return `<li class="h-row"><span class="h-ico ${inc ? "in" : "out"}">${inc ? "↓" : "↑"}</span><div class="h-main"><b>${esc(i.typeName || "Операция")}</b><span>${esc(sub)}</span></div><span class="h-sum ${inc ? "in" : ""}">${inc ? "+" : "−"}${esc(money(sum, i.currency || state.currency))}</span></li>`;
    });
    bonusRoot.innerHTML = `
      <div class="h-head"><h3>История по счету</h3>
        <div class="seg" role="group" aria-label="Период">${[1, 3, 6].map((n) => `<button type="button" data-m="${n}" class="${n === state.bonusMonths ? "on" : ""}">${n} мес.</button>`).join("")}</div></div>
      <div class="h-stats"><div><span>Приход</span><b class="in">+${esc(money(income, state.currency))}</b></div><div><span>Расход</span><b>−${esc(money(expense, state.currency))}</b></div></div>
      ${rows.length ? `<ul class="h-list">${rows.join("")}</ul>` : `<p class="muted">Операций за период нет.</p>`}
      ${all.length > state.bonusShown ? `<button class="h-more" type="button" id="bonus-more">Показать ещё</button>` : ""}`;
    bonusRoot.querySelectorAll(".seg button").forEach((b) => {
      b.onclick = () => {
        state.bonusMonths = Number(b.dataset.m);
        state.bonusShown = 8;
        loadBonus();
      };
    });
    bonusRoot.querySelector("#bonus-more")?.addEventListener("click", () => {
      state.bonusShown += 20;
      paintBonus();
    });
  }
  async function loadBonus() {
    bonusRoot.innerHTML = `<h3>История по счету</h3>${skRows(4)}`;
    const r = await api(`${P}/personal-new/wallet/baRep?monthReport=${state.bonusMonths}`);
    const items = r.json?.data?.items;
    state.bonus = r.ok && Array.isArray(items) ? { items } : { error: problem(r) };
    paintBonus();
    return r;
  }

  /* ---------- трансферный счёт: баланс, перевод баллов, история ---------- */
  const histRoot = $("#t-hist");
  const TRANSFER_TYPES = { TRANSFER_ORDER: "Заказ по трансферу" };
  function paintTransfer() {
    $("#t-amount").textContent = state.points === null ? "—" : points(state.points);
    $("#t-amount").classList.toggle("sk", state.points === null && !state.pointsLoaded);
    const t = state.transfer;
    if (!t) return;
    if (t.error) {
      histRoot.innerHTML = `<h3>История</h3><p class="muted">${esc(t.error)}</p>`;
      return;
    }
    const all = t.orders;
    const rows = all.slice(0, state.transferShown).map((o) => {
      const amount = Number(o.amount ?? 0);
      const inc = amount > 0;
      const who = [o.client?.surname, o.client?.name].filter(Boolean).join(" ");
      const sub = [dmy(o.date), who, o.branch?.city].filter(Boolean).join(" · ");
      return `<li class="h-row"><span class="h-ico ${inc ? "in" : "out"}">${inc ? "↓" : "↑"}</span><div class="h-main"><b>${o.orderId ? `Заказ № ${esc(o.orderId)}` : esc(TRANSFER_TYPES[o.type] || "Операция")}</b><span>${esc(sub)}</span></div><span class="h-sum ${inc ? "in" : ""}">${inc ? "+" : "−"}${esc(points(Math.abs(amount)))}</span></li>`;
    });
    histRoot.innerHTML = `<div class="h-head"><h3>История</h3></div>
      ${rows.length ? `<ul class="h-list">${rows.join("")}</ul>` : `<p class="muted">Операций пока нет.</p>`}
      ${all.length > state.transferShown ? `<button class="h-more" type="button" id="transfer-more">Показать ещё</button>` : ""}`;
    histRoot.querySelector("#transfer-more")?.addEventListener("click", () => {
      state.transferShown += 20;
      paintTransfer();
    });
  }
  async function loadTransfer() {
    if (!state.transfer) histRoot.innerHTML = `<h3>История</h3>${skRows(3)}`;
    const r = await api(`${P}/personal-new/transfer/reports/branches?displayBalance=true&displayOrders=true`);
    const orders = r.json?.data?.orders;
    state.transfer = r.ok && Array.isArray(orders) ? { orders: [...orders].sort((a, b) => String(b.date).localeCompare(String(a.date)) || Number(b.orderId) - Number(a.orderId)) } : { error: problem(r) };
    paintTransfer();
    return r;
  }

  /* ---------- моя структура: уровни, как в оргсхеме ---------- */
  const structRoot = $("#h-structure");
  const POS = { CONSUMER: "Потребитель", DISTRIBUTOR: "Дистрибьютор", CANDIDATE: "Кандидат", FRIEND: "Друг клуба" };
  /** Глубина из поля level: «.0» → 0, «.2» → 2, «.1.2» → 2, «..3» → 3. */
  const depthOf = (level) => {
    const nums = String(level ?? "").match(/-?\d+/g);
    if (nums?.length === 1) return Number(nums[0]);
    if (nums?.length > 1) return nums.length;
    const dots = String(level ?? "").match(/\./g);
    return dots ? dots.length : null;
  };
  const roleOf = (n) => RANKS.find((r) => r.codes.includes(n.rank))?.name || POS[n.position] || (n.rank ? `Ранг ${rankRu(n.rank)}` : "Участник");
  const avatar = (n, cls = "") => {
    const hue = (Number(n.id) * 47) % 360;
    const ini = String(n.name || "").split(/\s+/).filter(Boolean).slice(0, 2).map((x) => x[0]).join("").toUpperCase() || "•";
    return `<span class="st-av ${cls}" style="--h:${hue}">${n.avatar ? `<img src="${esc(n.avatar)}" alt="" referrerpolicy="no-referrer" />` : esc(ini)}</span>`;
  };

  /** Дерево из плоского отчёта: отчёт идёт в порядке обхода, родитель = ближайшая запись с глубиной на 1 меньше. */
  function buildTree(items) {
    const nodes = items.map((it) => ({ id: String(it.memberId), name: titleCase(it.fullName || [it.surname, it.name].filter(Boolean).join(" ")) || `ID ${it.memberId}`, rank: it.rank, position: it.position, lo: it.volumePersonal, go: it.volumeGroup, depth: depthOf(it.level), children: [] }));
    const hasDepth = nodes.some((n) => n.depth !== null);
    if (!hasDepth) return { flat: true, root: { id: "root", name: "Моя структура", children: nodes }, byId: new Map(nodes.map((n) => [n.id, n])) };
    const stack = [];
    let root = null;
    for (const n of nodes) {
      while (stack.length && stack[stack.length - 1].depth >= n.depth) stack.pop();
      if (stack.length) stack[stack.length - 1].children.push(n);
      else if (!root) root = n;
      stack.push(n);
    }
    const byId = new Map();
    const walk = (n) => (byId.set(n.id, n), n.children.forEach(walk));
    walk(root);
    return { flat: false, root, byId };
  }

  /* --- разметка (маркетинг-план): уровни подгружаются по клику, фильтры хранит кабинет --- */
  const VOL = [["PersonalVolume", "ЛО"], ["GroupVolume", "ГО"], ["QualifyingVolume", "СОП"], ["QualifyingStarVolume", "СОП*"]];
  const volKeys = () => VOL.flatMap(([b]) => ["", "Plan"].flatMap((k) => [`min${b}${k}`, `max${b}${k}`]));
  const TYPES = [["ALL", "Все"], ["CONSUMER", "Потребители"], ["DIRECTOR", "Директора"]];
  const rankCodes2 = ["D", "SD", "GD", "ED", "DD", "DD+", "E", "SE", "SE1", "GE", "GE1", "PE", "PE1", "PE2", "PE3", "2SE", "StE", "A", "jA", "PM", "M", "5*"];
  const rankLabel = (c) => RANKS.find((r) => r.codes.includes(c))?.name ?? (c === "DD+" ? "Бриллиантовый+" : rankRu(c));
  const mpNode = (it) => ({
    id: String(it.memberId),
    name: titleCase([it.surname, it.name].filter(Boolean).join(" ")) || `ID ${it.memberId}`,
    avatar: it.avatar || null,
    rank: it.rank,
    position: it.position,
    go: it.volumeGroup,
    children: it.hasReferredMembers === false ? [] : undefined,
  });
  /** Сколько условий фильтра включено: бейдж на кнопке. */
  function filterCount(f) {
    if (!f) return 0;
    let n = 0;
    if (f.type && f.type !== "ALL") n++;
    if (f.openRanks?.length) n++;
    if (f.newbies) n++;
    if (f.minRegistrationDate || f.maxRegistrationDate) n++;
    for (const k of volKeys()) if (Number(f[k]) > 0) n++;
    return n;
  }
  async function loadKids(node) {
    const s = state.struct;
    if (!s?.mp || node.children !== undefined) return;
    const r = await api(`${P}/marketing-plans/levels/children?number=${s.number}&memberId=${encodeURIComponent(node.id)}`);
    const list = r.json?.data;
    node.children = r.ok && Array.isArray(list) ? list.map(mpNode).filter((n) => n.id !== node.id) : [];
    if (!r.ok) node.error = problem(r);
  }

  function paintStructure() {
    const s = state.struct;
    if (!s) return;
    if (s.error) {
      structRoot.innerHTML = `<section class="h-card"><p class="muted">${esc(s.error)}</p></section>`;
      return;
    }
    const { root } = s;
    // путь: выбранные участники сверху вниз (корень первым)
    const path = [root];
    for (const id of state.path) {
      const n = path[path.length - 1].children?.find((c) => c.id === id);
      if (!n) break;
      path.push(n);
    }
    const nf = s.mp ? filterCount(s.filter) : 0;
    const bar = s.mp
      ? `<div class="st-bar"><span class="muted">${nf ? `Фильтры включены: ${nf}` : "Фильтры не заданы"}</span><button type="button" class="st-filter" id="st-filter">Фильтры${nf ? `<em>${nf}</em>` : ""}</button></div>`
      : `<p class="muted st-note">${esc(s.note ?? "")}</p>`;
    const parts = [bar, `<div class="st-me">${avatar(root, "big")}<div><b>${esc(root.name)}</b><span>${s.flat ? "Все участники" : esc(roleOf(root))}</span></div></div>`];
    path.forEach((node, i) => {
      const kids = node.children;
      const next = path[i + 1];
      if (kids === undefined) return void parts.push(skRows(2));
      const label = `<p class="st-label">Подчинённых: ${kids.length}</p>`;
      if (!kids.length) return void parts.push(`${label}<p class="muted st-empty">${node.error ? esc(node.error) : nf ? "Никого нет по выбранным фильтрам." : "У этого участника пока нет подчинённых."}</p>`);
      if (next) {
        parts.push(`<section class="st-level">${label}<div class="st-row">${kids.map((k) => `<button type="button" class="st-chip ${k === next ? "on" : ""}" data-id="${esc(k.id)}" aria-label="${esc(k.name)}">${avatar(k, k === next ? "sel" : "")}</button>`).join("")}</div><div class="st-pick"><b>${esc(next.name)}</b><span>${esc(roleOf(next))}</span></div></section>`);
      } else {
        parts.push(`<section class="st-level">${label}<div class="st-grid">${kids.map((k) => `<button type="button" class="st-card" data-id="${esc(k.id)}">${avatar(k)}<b>${esc(k.name)}</b><span>${esc(roleOf(k))}</span>${k.go ? `<em>ГО ${esc(fmt(Number(k.go)))}</em>` : ""}</button>`).join("")}</div></section>`);
      }
    });
    structRoot.innerHTML = `<section class="h-card st-wrap">${parts.join("")}</section>`;
    structRoot.querySelector("#st-filter")?.addEventListener("click", sheetFilter);
    structRoot.querySelectorAll("[data-id]").forEach((b) => {
      b.onclick = async () => {
        const id = b.dataset.id;
        const i = path.findIndex((n) => n.children?.some((k) => k.id === id));
        state.path = [...state.path.slice(0, Math.max(i, 0)), id];
        const node = path[i]?.children?.find((k) => k.id === id);
        paintStructure();
        if (node) {
          await loadKids(node);
          paintStructure();
        }
      };
    });
  }

  /** Окно «Фильтры»: те же поля, что в разметке кабинета; применяются к аккаунту, как на сайте. */
  function sheetFilter() {
    const s = state.struct;
    const f0 = s.filter;
    if (!f0) return openSheet("Фильтры", Object.assign(document.createElement("p"), { className: "sheet-empty", textContent: s.filterError || "Фильтры не загрузились." }));
    const num = (k) => (Number(f0[k]) > 0 ? Number(f0[k]) : "");
    const volTable = (kind, title) => `<details class="fl-det"><summary>${title}</summary><div class="fl-vol">${VOL.map(([b, name]) => `<span class="fl-name">${name}</span><input name="min${b}${kind}" inputmode="decimal" placeholder="от" value="${num(`min${b}${kind}`)}" /><input name="max${b}${kind}" inputmode="decimal" placeholder="до" value="${num(`max${b}${kind}`)}" />`).join("")}</div></details>`;
    const f = form(`
      <fieldset class="fl-set"><legend>Кого показывать</legend>
        <div class="seg fl-seg" role="group">${TYPES.map(([v, t]) => `<button type="button" data-type="${v}" class="${(f0.type || "ALL") === v ? "on" : ""}">${t}</button>`).join("")}</div>
      </fieldset>
      <label>Поколений директоров<input name="directorGenerations" inputmode="numeric" value="${Number(f0.directorGenerations) || 0}" /></label>
      <fieldset class="fl-set"><legend>Ранги</legend>
        <div class="fl-chips">${rankCodes2.map((c) => `<label class="fl-chip"><input type="checkbox" name="rank" value="${esc(c)}" ${f0.openRanks?.includes(c) ? "checked" : ""} /><span>${esc(rankLabel(c))}</span></label>`).join("")}</div>
      </fieldset>
      <label class="fl-check"><input type="checkbox" name="newbies" ${f0.newbies ? "checked" : ""} /> Новички</label>
      <fieldset class="fl-set"><legend>Дата регистрации</legend>
        <div class="fl-two"><input type="date" name="minRegistrationDate" value="${esc(f0.minRegistrationDate ?? "")}" /><input type="date" name="maxRegistrationDate" value="${esc(f0.maxRegistrationDate ?? "")}" /></div>
      </fieldset>
      ${volTable("", "Объёмы: факт")}
      ${volTable("Plan", "Объёмы: план")}
      <button class="btn" type="submit" id="go">Применить</button>
      <button class="btn ghost" type="button" id="reset">Сбросить</button>
      <p class="note" role="status"></p>`);
    let type = f0.type || "ALL";
    f.querySelectorAll("[data-type]").forEach((b) => {
      b.onclick = () => {
        type = b.dataset.type;
        f.querySelectorAll("[data-type]").forEach((x) => x.classList.toggle("on", x === b));
      };
    });
    const nz = (v) => {
      const x = Number(String(v ?? "").replace(/\s/g, "").replace(",", "."));
      return Number.isFinite(x) && x > 0 ? x : 0;
    };
    const save = async (body, okText) => {
      f.querySelector("#go").disabled = true;
      note(f, "Сохраняем…");
      const r = await api(`${P}/marketing-plans/calculations/filter`, { method: "PUT", body });
      f.querySelector("#go").disabled = false;
      if (!(r.ok && r.json?.success !== false)) return note(f, problem(r), "bad");
      s.filter = { ...s.filter, ...body };
      closeSheet();
      state.path = [];
      loadStructure(true);
    };
    f.onsubmit = (e) => {
      e.preventDefault();
      const body = {
        type,
        directorGenerations: Math.max(0, Math.floor(nz(f.elements.directorGenerations.value))),
        openRanks: [...f.querySelectorAll('input[name="rank"]:checked')].map((i) => i.value),
        newbies: f.elements.newbies.checked,
        minRegistrationDate: f.elements.minRegistrationDate.value || undefined,
        maxRegistrationDate: f.elements.maxRegistrationDate.value || null,
      };
      for (const k of volKeys()) body[k] = nz(f.elements[k].value);
      save(body);
    };
    f.querySelector("#reset").onclick = () => {
      if (!confirm("Сбросить фильтры структуры? Они сохранены в вашем аккаунте и на сайте тоже сбросятся.")) return;
      const body = { type: "ALL", directorGenerations: Number(f0.directorGenerations) || 0, openRanks: [], newbies: false, maxRegistrationDate: null };
      for (const k of volKeys()) body[k] = 0;
      save(body);
    };
    openSheet("Фильтры", f);
  }

  async function loadStructurePRep(note) {
    const now = new Date();
    const month = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const months = [month(now), month(new Date(now.getFullYear(), now.getMonth() - 1, 1))];
    let rep = null;
    let lastErr = "";
    for (const m of months) {
      const r = await api(`${P}/personal-new/structure/reports?month=${m}&type=PRep`);
      const list = r.json?.data?.structure;
      if (r.ok && Array.isArray(list) && list.length) {
        rep = list;
        break;
      }
      if (!r.ok) lastErr = problem(r);
    }
    if (!rep) {
      state.struct = { error: lastErr || "В отчёте нет данных по структуре." };
      return paintStructure();
    }
    state.struct = { ...buildTree(rep), note };
    state.path = [];
    paintStructure();
    // фото участников: из отчёта по контактам, по возможности
    const c = await api(`${P}/personal-new/structure/reports/contact?showInactive=false`);
    const people = c.json?.data?.structure;
    if (c.ok && Array.isArray(people)) {
      const photo = new Map(people.filter((p) => p.avatar).map((p) => [String(p.memberId), p.avatar]));
      state.struct.byId.forEach((n) => (n.avatar = photo.get(n.id) ?? null));
      paintStructure();
    }
  }

  async function loadStructure(force = false) {
    if (state.struct && !state.struct.error && !force) return;
    structRoot.innerHTML = `<section class="h-card">${skRows(5)}</section>`;
    const [calc, flt] = await Promise.all([api(`${P}/marketing-plans/calculations`), api(`${P}/marketing-plans/calculations/filter`)]);
    const list = calc.json?.data;
    if (!(calc.ok && Array.isArray(list) && list.length)) return loadStructurePRep(`Разметка недоступна (${calc.ok ? "нет расчётов" : problem(calc)}): показан отчёт по структуре без фильтров.`);
    const number = [...list].sort((a, b) => String(b.month).localeCompare(String(a.month)) || String(b.date).localeCompare(String(a.date)))[0].number;
    const top = await api(`${P}/marketing-plans/levels/children?number=${number}`);
    const items = top.json?.data;
    if (!(top.ok && Array.isArray(items))) return loadStructurePRep(`Разметка недоступна (${problem(top)}): показан отчёт по структуре без фильтров.`);
    const p = state.profile;
    const meId = String(p?.id ?? "");
    const mine = items.find((it) => String(it.memberId) === meId);
    const root = mine ? mpNode(mine) : { id: meId || "root", name: titleCase([p?.surname, p?.name].filter(Boolean).join(" ")) || "Моя структура", rank: state.member?.rank, position: p?.position, children: items.map(mpNode) };
    root.name = titleCase(root.name);
    if (mine) root.children = undefined;
    state.struct = { mp: true, number, root, byId: new Map([[root.id, root]]), filter: flt.ok ? (flt.json?.data ?? null) : null, filterError: flt.ok ? "" : problem(flt) };
    state.path = [];
    paintStructure();
    if (mine) {
      await loadKids(root);
      paintStructure();
    }
  }

  /* ---------- история заказов ---------- */
  const ordersRoot = $("#h-orders");
  function paintOrders() {
    if (!state.orders) return;
    if (state.orders.error) {
      ordersRoot.innerHTML = `<h3>История заказов</h3><p class="muted">${esc(state.orders.error)}</p>`;
      return;
    }
    const all = state.orders.items;
    const rows = all.slice(0, state.ordersShown).map((o) => {
      const [label, kind] = STATUS[o.status] ?? [o.status || "—", "wait"];
      const tags = [o.isPersonal && "Личный", o.isTransfer && "Трансфер", o.isGroup && "Групповой"].filter(Boolean);
      const sub = [dmy(o.createdAt), o.productsCount ? count(o.productsCount, ["товар", "товара", "товаров"]) : "", o.bonus?.total ? points(Number(o.bonus.total)) : ""].filter(Boolean).join(" · ");
      return `<li class="h-row"><div class="h-main"><b>Заказ № ${esc(o.id)}</b><span>${esc(sub)}</span>${tags.length ? `<span class="h-tags">${tags.map((t) => `<i>${esc(t)}</i>`).join("")}</span>` : ""}</div><div class="h-side"><span class="h-sum">${o.totalPrice ? esc(money(Number(o.totalPrice.amount), o.totalPrice.currency || state.currency)) : "—"}</span><em class="pill ${kind}">${esc(label)}</em></div></li>`;
    });
    ordersRoot.innerHTML = `<div class="h-head"><h3>История заказов</h3><span class="muted">${esc(count(all.length, ["заказ", "заказа", "заказов"]))}</span></div>
      ${rows.length ? `<ul class="h-list">${rows.join("")}</ul>` : `<p class="muted">Заказов пока нет.</p>`}
      ${all.length > state.ordersShown ? `<button class="h-more" type="button" id="orders-more">Показать все</button>` : ""}`;
    ordersRoot.querySelector("#orders-more")?.addEventListener("click", () => {
      state.ordersShown = all.length;
      paintOrders();
    });
  }
  async function loadOrders() {
    ordersRoot.innerHTML = `<h3>История заказов</h3>${skRows(4)}`;
    const r = await api(`${P}/personal-new/shop/orders`);
    const items = r.json?.data;
    state.orders = r.ok && Array.isArray(items) ? { items: [...items].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)) || Number(b.id) - Number(a.id)) } : { error: problem(r) };
    paintOrders();
    return r;
  }

  /* ---------- карточка участника: ранг и условия ---------- */
  const numOf = (v) => Number(String(v ?? "").replace(/\s/g, "").replace(",", "."));
  const fmt = (n) => n.toLocaleString("ru-RU", { maximumFractionDigits: 1 });
  const LOCK = `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="11" width="14" height="9" rx="2.5"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>`;
  const CHECK = `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>`;

  /** Код ранга участника: из отчёта по структуре, иначе из показателей (последний месяц). */
  function rankCodes() {
    const star = [...(state.metricsJson?.data?.volumeQualifyingStar ?? [])].sort((a, b) => (a.date < b.date ? 1 : -1))[0];
    return [state.member?.rank, state.member?.fullNameRank, star?.rank, star?.fullRank].filter(Boolean);
  }

  /** Позиция в таблице условий: номер, -1 если ранг ниже директора, null если код неизвестен. */
  function rankIndexNow() {
    for (const t of rankCodes()) {
      const i = RANKS.findIndex((r) => r.codes.includes(t));
      if (i >= 0) return i;
      if (PRE.includes(t)) return -1;
    }
    return null;
  }

  const INFO = `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 11v5.5M12 7.8v.1"/></svg>`;

  /** Условия ранга: что нужно и сколько есть (h = null, если своих цифр нет). */
  function rankRows(r, f) {
    return [
      ["ЛО", r.lo, f?.lo, "Личный объём"],
      ["ГО", r.go, f?.go, "Групповой объём"],
      r.branches && ["Ветви", r.branches, f?.branches, "Директорские ветви"],
      r.directors && ["Дир.", r.directors, f?.directors, `Директоров в ${r.gens} поколениях`],
      r.sop && [r.sopStar ? "СОП*" : "СОП", r.sop, f?.sop, "Сетевой объём поколений"],
    ]
      .filter(Boolean)
      .map(([k, n, h, t]) => ({ k, n, t, h: h === undefined || h === null || Number.isNaN(h) ? null : h }));
  }

  /** Прогресс к рангу: сколько условий выполнено из скольких. */
  function progressTo(r, f) {
    if (!f) return null;
    const rows = rankRows(r, f);
    const done = rows.filter((x) => x.h !== null && x.h >= x.n).length;
    return { rows, done, total: rows.length, pct: Math.round((done / rows.length) * 100) };
  }

  /** Строка «До «…» 60% • 3 из 5» и шкала. */
  const goalHtml = (r, p, label = `До «${r.gen}»`) =>
    `<p class="rk-goal"><span>${esc(label)}</span><b>${p.pct}% • ${p.done} из ${p.total}</b></p><div class="rk-bar" role="progressbar" aria-valuenow="${p.pct}" aria-valuemin="0" aria-valuemax="100"><i style="width:${p.pct}%"></i></div>`;

  const infoBtn = (i) => `<button class="rk-info" type="button" data-info="${i}" aria-label="Что нужно сделать">${INFO}</button>`;

  /** Одна карточка ранга. Выполнено у нас только по текущему и следующему рангу: цифры дашборда относятся к ним. */
  function rankCard(r, i, cur, f) {
    const st = cur === null ? "plain" : i < cur ? "past" : i === cur ? "now" : i === cur + 1 ? "next" : "ahead";
    const target = st === "now" ? RANKS[i + 1] ?? r : r; // у текущего шкала ведёт к следующему рангу
    const ti = st === "now" && RANKS[i + 1] ? i + 1 : i;
    let body = "";
    let side = "";
    if (st === "past") {
      side = `<i aria-hidden="true">${CHECK}</i>`;
      body = `<p class="rk-phrase">Ранг пройден</p>`;
    } else if (st === "ahead") {
      side = infoBtn(i);
      body = `<p class="rk-phrase"><span class="rk-lock" aria-hidden="true">${LOCK}</span>Откроется после ранга «${esc(RANKS[i - 1].name)}»</p>`;
    } else if (st === "plain") {
      side = infoBtn(i);
      body = `<p class="rk-phrase">Что нужно для этого ранга</p>`;
    } else if (st === "now" && !RANKS[i + 1]) {
      body = `<p class="rk-phrase">Высший ранг в таблице условий</p>`;
      side = infoBtn(i);
    } else {
      const p = progressTo(target, f);
      body = p ? goalHtml(target, p, st === "next" ? "Условия ранга" : undefined) : `<p class="rk-phrase rk-sk"><i class="sk"></i></p>`;
      side = infoBtn(ti);
    }
    return `<li class="rk rk-${r.tone} rk-${st}" title="${esc(r.perk)}: ${esc(r.opens)}"><h2 class="rk-name"><span>${esc(r.name)}</span>${side}</h2>${body}</li>`;
  }

  /** Карточка текущего ранга, когда его нет в таблице условий (ниже директора или код неизвестен). */
  function ownCard(f, pre) {
    const code = rankCodes()[0];
    const p = pre ? progressTo(RANKS[0], f) : null;
    const body = pre ? (p ? goalHtml(RANKS[0], p) : `<p class="rk-phrase rk-sk"><i class="sk"></i></p>`) : `<p class="rk-phrase">Ваш ранг</p>`;
    return `<li class="rk rk-x rk-now" title="Код ранга из API: ${esc(code ?? "нет")}"><h2 class="rk-name"><span>${code ? esc(rankRu(code)) : "&nbsp;"}</span>${pre ? infoBtn(0) : ""}</h2>${body}</li>`;
  }

  /** Окно «Что нужно сделать»: чек-лист условий ранга. */
  function sheetRank(i) {
    const r = RANKS[i];
    const cur = rankIndexNow();
    const f = state.dash ? { lo: numOf(state.dash.volumePersonal), go: numOf(state.dash.volumeGroup), branches: numOf(state.dash.directorBranchesCount), directors: numOf(state.dash.generationDirectorsCount), sop: numOf(state.dash.volumeQualifyingStar) } : null;
    const mine = cur === null ? i === 0 : i === cur || i === cur + 1 || (cur === -1 && i === 0);
    const rows = rankRows(r, mine ? f : null);
    const box = document.createElement("div");
    box.className = "sheet-form";
    box.innerHTML = `<ul class="rk-list">${rows
      .map((x) => {
        const ok = x.h !== null && x.h >= x.n;
        return `<li class="${ok ? "ok" : ""}"><span class="rk-box" aria-hidden="true">${ok ? "✓" : ""}</span><div><b>${esc(x.t)}</b><span>${x.h !== null ? `${fmt(x.h)} из ${fmt(x.n)}` : `нужно ${fmt(x.n)}`}</span></div></li>`;
      })
      .join("")}</ul><p class="muted">Условия считаются за ${count(r.months, ["месяц", "месяца", "месяцев"])} подряд. ${esc(r.opens)}.</p>`;
    openSheet(`До «${r.gen}»`, box);
  }
  $("#h-ranks").addEventListener("click", (e) => {
    const b = e.target.closest(".rk-info");
    if (b) sheetRank(Number(b.dataset.info));
  });

  function paintUser() {
    const list = $("#h-ranks");
    const dots = $("#h-dots");
    const d = state.dash;
    const f = d ? { lo: numOf(d.volumePersonal), go: numOf(d.volumeGroup), branches: numOf(d.directorBranchesCount), directors: numOf(d.generationDirectorsCount), sop: numOf(d.volumeQualifyingStar) } : null;
    const cur = rankIndexNow();
    if (cur === null) console.info("Ранг из API не найден в ranks.js:", rankCodes());
    const keep = list.scrollLeft;
    const key = `${cur}|${rankCodes()[0]}`;
    const firstTime = state.rkKey !== key;
    const hasOwn = cur === null || cur < 0;
    list.innerHTML = (hasOwn ? ownCard(f, cur === -1) : "") + RANKS.map((r, i) => rankCard(r, i, cur, f)).join("");
    const items = [...list.children];
    dots.innerHTML = items.map(() => "<i></i>").join("");
    const mark = () => {
      const x = list.getBoundingClientRect().left;
      let best = 0;
      items.forEach((el, i) => {
        if (Math.abs(el.getBoundingClientRect().left - x) < Math.abs(items[best].getBoundingClientRect().left - x)) best = i;
      });
      [...dots.children].forEach((e, i) => e.classList.toggle("on", i === best));
    };
    list.onscroll = () => requestAnimationFrame(mark);
    const start = hasOwn ? 0 : cur;
    list.scrollLeft = firstTime ? items[start].getBoundingClientRect().left - list.getBoundingClientRect().left + list.scrollLeft : keep;
    state.rkKey = key;
    mark();
  }


  /* ---------- задачи: новые, уходящие, директора, дни рождения ---------- */
  const SHORT_MONTHS = ["янв.", "февр.", "марта", "апр.", "мая", "июня", "июля", "авг.", "сент.", "окт.", "нояб.", "дек."];
  const dayWord = (n) => count(n, ["день", "дня", "дней"]);

  function sheetPeople(title, groups, empty, hint = "") {
    const box = document.createElement("div");
    box.className = "sheet-form";
    const row = (r) => `<li class="h-row"><div class="h-main"><b>${esc(r.name)}</b><span>${esc(r.sub)}</span></div>${r.side ? `<span class="h-sum">${esc(r.side)}</span>` : ""}</li>`;
    let cur = 0;
    const paint = () => {
      const g = groups[cur];
      box.innerHTML = `${hint ? `<p class="muted">${esc(hint)}</p>` : ""}${groups.length > 1 ? `<div class="seg" role="group">${groups.map((x, i) => `<button type="button" data-i="${i}" class="${i === cur ? "on" : ""}">${esc(x.label)} · ${x.rows.length}</button>`).join("")}</div>` : ""}${g.rows.length ? `<ul class="h-list">${g.rows.map(row).join("")}</ul>` : `<p class="muted">${esc(empty)}</p>`}`;
      box.querySelectorAll(".seg button").forEach((b) => {
        b.onclick = () => {
          cur = Number(b.dataset.i);
          paint();
        };
      });
    };
    paint();
    openSheet(title, box);
  }

  function paintTasks() {
    const t = state.tasks;
    if (!t) return;
    if (t.error) {
      tasksRoot.hidden = false;
      tasksRoot.innerHTML = `<div class="mtop"><h2 class="mtitle">ЗАДАЧИ</h2></div><p class="muted">${esc(t.error)}</p>`;
      return;
    }
    const mon = MONTHS_RU[new Date().getMonth()];
    const gen1 = t.directors.filter((d) => d.gen === 1).length;
    // подписи без слэшей (кастдев Карины: «4 / 18» читали как «4 в этом месяце, 18 в прошлом»); у каждой цифры «относительно чего» и пояснение по «?»
    const INFO_T = {
      fresh: "Люди, зарегистрировавшиеся в этом месяце. Крупная цифра — ваша первая линия, в подписи — вся структура. Пока человек не сделал первый заказ, он кандидат.",
      leaving: "Кандидаты без первого заказа: на заказ осталось не больше 7 дней или срок уже вышел, потом их удалят. Крупная цифра — ваша первая линия, в подписи — вся структура.",
      dirs: "Директора в ваших поколениях. К 1-му поколению относятся директора, над которыми нет других директоров. «Всего» — во всех поколениях.",
      bd: "Дни рождения участников вашей структуры в ближайшие 7 дней. Дата видна только у тех, кто разрешил её показывать.",
      stale: "Участники, которые не делали заказов от 3 до 11 месяцев: их ещё можно вернуть. Крупная цифра — ваша первая линия, в подписи — вся структура. Кандидатов здесь нет.",
      near: "Дистрибьюторы с групповым объёмом ниже 500 (порог директора) или от 500 до 750 (порог экстрабонуса). Крупная цифра — ваша первая линия, в подписи — вся структура.",
    };
    const tile = (key, title, big, sub) => `<article class="mcard mtap" data-k="${key}" role="button" tabindex="0"><div class="mhead"><h3>${esc(title)}</h3><button class="mi" type="button" aria-label="Что это за показатель" aria-expanded="false" data-hint="${esc(INFO_T[key])}">?</button></div><div class="mval"><p class="mbig">${esc(big)}</p><p class="msub">${esc(sub)}</p></div></article>`;
    tasksRoot.hidden = false;
    tasksRoot.innerHTML = `<div class="mtop"><h2 class="mtitle">ЗАДАЧИ</h2></div><div class="mgrid tcar">${[
      tile("fresh", "Новые участники", String(t.mine(t.fresh).length), `в 1-й линии за ${mon} · в структуре ${t.fresh.length}`),
      tile("leaving", "Уходящие участники", String(t.mine(t.leaving).length), `в 1-й линии · в структуре ${t.leaving.length}`),
      tile("dirs", "Директора", String(gen1), `в 1-м поколении · во всех ${t.directors.length}`),
      tile("stale", "Давно не заказывали", String(t.mine(t.stale).length), `в 1-й линии · в структуре ${t.stale.length}`),
      tile("near", "Не хватает до порога", String(t.mine([...t.to500, ...t.to750]).length), `в 1-й линии · в структуре ${t.to500.length + t.to750.length}`),
      tile("bd", "Дни рождения", String(t.birthdays.length), "в ближайшие 7 дней"),
    ].join("")}</div>`;
    attachHints(tasksRoot);
    const sub = (m, tail) => [lineLabel(m), tail].filter(Boolean).join(" · ");
    const open = {
      fresh: () =>
        sheetPeople(
          "Новые участники",
          [
            { label: "Мои", rows: t.mine(t.fresh) },
            { label: "В структуре", rows: t.fresh },
          ].map((g) => ({ label: g.label, rows: g.rows.map((m) => ({ name: personName(m), sub: sub(m, m.status === "CANDIDATE" ? "кандидат" : "с заказом"), side: m.registrationDays != null ? `рег. ${dayWord(m.registrationDays)} назад` : "" })) })),
          "Новых участников в этом месяце нет.",
          `Зарегистрировались в этом месяце (${mon}). Пока без заказа они кандидаты.`,
        ),
      leaving: () =>
        sheetPeople(
          "Уходящие участники",
          [
            { label: "Мои", rows: t.mine(t.leaving) },
            { label: "В структуре", rows: t.leaving },
          ].map((g) => ({ label: g.label, rows: g.rows.map((m) => ({ name: personName(m), sub: sub(m, "кандидат"), side: m.left > 0 ? `до удаления ${dayWord(m.left)}` : m.left === 0 ? "последний день" : "срок вышел" })) })),
          "Сейчас никто не уходит.",
          "Кандидаты без первого заказа: до удаления осталось не больше 7 дней или срок уже вышел.",
        ),
      dirs: () => sheetPeople("Директора", [{ label: "В ваших поколениях", rows: t.directors.map((m) => ({ name: personName(m), sub: sub(m, rankName(m.rank)), side: `${m.gen}-е пок.` })) }], "Директоров в ваших поколениях пока нет."),
      stale: () =>
        sheetPeople(
          "Давно не заказывали",
          [
            { label: "Мои", rows: t.mine(t.stale) },
            { label: "В структуре", rows: t.stale },
          ].map((g) => ({ label: g.label, rows: g.rows.map((m) => ({ name: personName(m), sub: sub(m, m.position === "CONSUMER" ? "потребитель" : "дистрибьютор"), side: `${count(m.monthsWithoutPoints, ["месяц", "месяца", "месяцев"])} без заказа` })) })),
          "Сейчас таких участников нет.",
          "Не заказывали от 3 до 11 месяцев. Сверху те, кого проще вернуть.",
        ),
      near: () => {
        const row = (th) => (m) => ({ name: personName(m), sub: sub(m, `ГО ${fmt(Number(m.volumeGroup))}`), side: `не хватает ${fmt(th - Number(m.volumeGroup))}` });
        sheetPeople(
          "Не хватает до порога",
          [
            { label: "До 500", rows: t.to500.map(row(500)) },
            { label: "До 750", rows: t.to750.map(row(750)) },
          ],
          "Сейчас ни у кого нет объёма в этом диапазоне.",
          "Групповой объём (ГО) за текущий месяц: 500 — порог директора, 750 — порог экстрабонуса.",
        );
      },
      bd: () => sheetPeople("Дни рождения", [{ label: "На этой неделе", rows: t.birthdays.map((m) => ({ name: personName(m), sub: lineLabel(m), side: m.in === 0 ? "сегодня" : `${m.when.getDate()} ${SHORT_MONTHS[m.when.getMonth()]}` })) }], "На этой неделе дней рождения нет."),
    };
    tasksRoot.querySelectorAll(".mtap").forEach((el) => {
      el.onclick = () => open[el.dataset.k]();
      el.onkeydown = (e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), open[el.dataset.k]());
    });
  }
  async function loadTasks() {
    const now = new Date();
    const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const [c, p] = await Promise.all([api(`${P}/personal-new/structure/reports/contact?showInactive=false`), api(`${P}/personal-new/structure/reports?month=${ym}&type=PRep`)]);
    const contact = c.json?.data?.structure;
    const prep = p.json?.data?.structure;
    state.tasks = c.ok && p.ok && Array.isArray(contact) && Array.isArray(prep) ? computeTasks(contact, prep, now) : { error: `Задачи недоступны: ${problem(c.ok ? p : c)}` };
    paintTasks();
  }

  /** Показатели: ответ метрик и дашборд приходят в любом порядке, плитки перерисовываются по обоим. */
  function paintMetrics() {
    if (state.metricsJson) renderMetrics(metricsRoot, state.metricsJson, state.dash, state.metricsAt ?? new Date());
  }

  /** Каждый кусок экрана рисуется, как только пришёл его ответ: один медленный запрос не прячет остальное. */
  async function load() {
    state.ready = true;
    route(); // перерисовать открытую вкладку: до входа магазин не запрашивает данные
    shop.refreshCart();
    // пока данные едут, показываем шимер; при повторной загрузке не мигаем уже нарисованным
    if (!state.metricsJson) metricsRoot.innerHTML = skTiles("МОИ ПОКАЗАТЕЛИ", 3, "mcar");
    if (!state.tasks) {
      tasksRoot.hidden = false;
      tasksRoot.innerHTML = skTiles("ЗАДАЧИ", 2);
    }
    if (!$("#h-ranks").children.length) $("#h-ranks").innerHTML = `<li class="rk rk-load" role="status" aria-label="Загрузка"><h2 class="rk-name"><i class="sk"></i></h2><p class="rk-phrase rk-sk"><i class="sk"></i></p><p class="rk-phrase rk-sk"><i class="sk"></i></p></li>`;
    const acc = await api(`${P}/account`);
    state.profile = acc.json?.data ?? null;
    state.currency = state.profile?.currency || state.currency;
    paint();
    const chkJob = api(`${P}/account/checking_accounts?currency=${encodeURIComponent(state.currency)}`).then((chk) => {
      const row = Array.isArray(chk.json?.data) ? chk.json.data[0] : chk.json?.data;
      state.balance = chk.ok && row && row.balance !== undefined ? Number(row.balance) : null;
      state.balanceLoaded = true;
      paint();
      return chk;
    });
    const monJob = api(`${P}/personal-new/transfer/month?timeZone=${encodeURIComponent(tz)}`).then((mon) => {
      const items = mon.json?.data?.item ?? [];
      state.months = [...items].sort((a, b) => (String(a.month) < String(b.month) ? 1 : -1));
      // на трансферном счёте: баллы текущего (последнего) месяца
      state.points = mon.ok && state.months.length ? Number(state.months[0].balanceMonth ?? 0) : null;
      state.pointsLoaded = true;
      paint();
      return mon;
    });
    const dashJob = api(`${P}/account/dashboard`).then((r) => {
      state.dash = r.ok ? (r.json?.data ?? null) : null;
      paintUser();
      paintMetrics();
      return r;
    });
    const now = new Date();
    const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const memJob = api(`${P}/personal-new/structure/current/member?month=${ym}&type=PRep`).then((r) => {
      state.member = r.ok ? (r.json?.data ?? null) : null;
      paintUser();
      return r;
    });
    const metJob = api(`${P}/account/metrics`).then((met) => {
      if (met.ok) {
        state.metricsJson = met.json;
        state.metricsAt = new Date();
      }
      paintUser();
      if (met.ok) paintMetrics();
      else metricsMessage(metricsRoot, met.status === 403 ? "Показатели недоступны для этого аккаунта (403)." : `Не удалось получить показатели: ${problem(met)}`);
      return met;
    });
    const taskJob = loadTasks();
    const [chk, mon, met] = await Promise.all([chkJob, monJob, metJob, dashJob, memJob, taskJob]);
    return { chk, mon, met };
  }

  // как в iOS: под закреплённой шапкой появляется тонкая линия, когда контент уходит под неё
  window.addEventListener("scroll", () => $(".h-dhead").classList.toggle("scrolled", window.scrollY > 4), { passive: true });

  /* ---------- переходы: главная ↔ экраны «Движение бонусов» и «История заказов» ---------- */
  function route() {
    const page = { "#/wallet": "bonus", "#/bonus": "bonus", "#/profile": "profile", "#/orders": "orders", "#/transfer": "transfer", "#/structure": "structure" }[location.hash] ?? "";
    // нижнее меню: главная (магазин), каталог, корзина, избранное, профиль (кабинет)
    const tab = page ? "" : { "#/catalog": "catalog", "#/cart": "cart", "#/fav": "fav", "#/me": "me" }[location.hash] ?? "shop";
    $("#h-main").hidden = tab !== "me";
    $("#h-shop").hidden = !["shop", "catalog", "cart", "fav"].includes(tab);
    $("#tabbar").hidden = Boolean(page);
    document.body.classList.toggle("has-tabbar", !page);
    root.querySelectorAll("#tabbar a").forEach((a) => a.classList.toggle("on", a.dataset.tab === tab));
    if (state.ready && !$("#h-shop").hidden) shop.show(tab);
    $("#h-detail").hidden = !page;
    $("#h-wallet").hidden = page !== "bonus";
    $("#h-orders").hidden = page !== "orders";
    $("#h-transfer").hidden = page !== "transfer";
    $("#h-structure").hidden = page !== "structure";
    $("#h-profile").hidden = page !== "profile";
    $("#h-dtitle").textContent = { bonus: "Coral Кошелёк", transfer: "Трансферный счёт", orders: "История заказов", structure: "Моя структура", profile: "Профиль" }[page] ?? "";
    if (page === "bonus" && !state.bonus) loadBonus();
    if (page === "orders" && !state.orders) loadOrders();
    if (page === "structure") loadStructure();
    if (page === "transfer") {
      paintTransfer();
      loadTransfer();
    }
    window.scrollTo(0, 0);
  }
  const shop = createShop($("#h-shop"), {
    api,
    P,
    memberId: () => state.profile?.id ?? -1,
    money,
    esc,
    sheet: { open: openSheet, close: closeSheet },
    onCount: (n) => {
      const b = $("#tb-badge");
      b.textContent = n > 99 ? "99+" : String(n);
      b.hidden = n === 0;
    },
  });
  window.addEventListener("hashchange", route);
  route();

  return { load, paint };
}
