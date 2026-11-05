// Оформление заказа внутри ЛК, без перехода на сайт магазина. Вид и порядок шагов как в «Друге клуба»
// (стили перенесены в friend.css): доставка (адрес с поиском Google или пункт выдачи) → контакты → способ доставки и время
// курьера → оплата → промокод и бонусы → итог → согласия → «Перейти к оплате».
// Магазин принимает методы чек-аута (/sv-api/*) только по своей сессии, поэтому они идут через стенд (npm start):
// server.mjs, /lk/shop/. Заказ создаётся только по нажатию в окне подтверждения. Оплата картой, как и в «Друге клуба»
// для РФ и Германии: после заказа прямой переход на страницу банка (шлюз магазина), без промежуточной страницы магазина.
import { addressSearchEnabled, newSession, resolveAddress, resolveStreet, setPlacesKey, splitStreet, streetLine, suggestAddresses } from "./address.js";
import { countryName, getCountry, onCountryRequest, rememberCountries, setCountry } from "./country.js";
import { deliverySlots, isMoscow, slotRegion } from "./slots.js";

// В ЛК только онлайн-оплата: наличные и оплата курьером не предлагаются, шлюз оплаты открывается по стране.
const CASHLIKE = /налич|при получении|наложен|cash/i;
const onlineOnly = (list) => (Array.isArray(list) ? list.filter((p) => !CASHLIKE.test(p?.NAME ?? "")) : list);
const CARD = /карт|card/i;

/** Вложенные параметры в виде a[b]=c: так их шлёт сам чек-аут магазина. */
function qs(params) {
  const out = [];
  const add = (key, value) => {
    if (value === undefined || value === null) return;
    if (typeof value === "object") for (const [k, v] of Object.entries(value)) add(`${key}[${k}]`, v);
    else out.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
  };
  for (const [k, v] of Object.entries(params)) add(k, v);
  return out.join("&");
}
const num = (v) => parseFloat(String(v ?? "").replace(/\s/g, "").replace(",", ".")) || 0;
const pick = (o, ...keys) => keys.map((k) => o?.[k]).find((v) => v !== undefined && v !== null && v !== "");
const hoursText = (html) => String(html ?? "").replace(/<br\s*\/?>/gi, " · ").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
const CHECK = `<svg class="oc-check" viewBox="0 0 28 28" aria-hidden="true"><circle cx="14" cy="14" r="14"/>CHK</svg>`;
const TICK = `<path d="M8.5 14.5l3.8 3.8 7.2-7.6" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>`;
const CHEV = `<svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M2.5 4.5L6 8l3.5-3.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

export function createCheckout(root, { shopRequest, shopReady, shopConfig, shop, who, api, P, money: lkMoney, esc, sheet, toast }) {
  const form = { fio: "", phone: "", email: "", searchText: "", picked: false, manual: false, street: "", build: "", apartment: "", zip: "", city: "", region: "", comment: "", terms: false, data: false };
  const st = {
    run: 0, mode: "courier", groups: [], payments: [], deliveryChoice: "", paymentId: "", totals: null, points: [], pointCode: "", pointsFor: "",
    slotCfg: {}, slotDate: "", slotTime: "", promo: "", promoOpen: false, promoDraft: "", promoMsg: "", bonus: 0, bonusOpen: false, bonusDraft: "",
    deliveryFor: "", paymentsFor: "", totalsFor: "", ready: false, sending: false, attempted: false, error: "", warn: "", orderId: "", currency: "RUB", pointsQuery: "", pointsTypes: [],
  };

  const sv = (path, params = {}, opts = {}) => shopRequest(`/sv-api${path}?${qs({ ...params, language: "ru" })}`, opts);
  const set = (html) => {
    root.innerHTML = html;
  };
  const $ = (s) => root.querySelector(s);
  const money = (n) => lkMoney(n, st.currency);
  const country = () => getCountry();

  /* ---------- производные величины (как в «Друге клуба») ---------- */
  const place = () => (form.city.trim() ? `${country()}|${form.city.trim()}|${form.region.trim()}` : "");
  const deliveryKey = () => `${shop.lines().map((l) => `${l.code}:${l.qty}`).join(",")}|${place()}`;
  const slotsOf = (key) => (key === "moscow" ? st.slotCfg.moscow : st.slotCfg.spb);
  const expressOff = () => country() === "RU" && isMoscow(form.city) && !!st.slotCfg.moscow && deliverySlots(st.slotCfg.moscow, { express: true }).length === 0;
  const courierItems = () => st.groups.filter((g) => g.ID !== "PICK_POINT").flatMap((g) => g.ITEMS).filter((i) => !(expressOff() && i.ID === "I_COURIER_1DAY")).sort((a, b) => (a.PRICE ?? 0) - (b.PRICE ?? 0));
  const pickupItems = () => st.groups.filter((g) => g.ID === "PICK_POINT").flatMap((g) => g.ITEMS);
  const pickupNone = () => st.deliveryFor === deliveryKey() && pickupItems().length === 0;
  const isPickup = () => !pickupNone() && (st.mode === "pickup" || (courierItems().length === 0 && pickupItems().length > 0));
  const point = () => (isPickup() ? st.points.find((p) => p.CODE === st.pointCode) : undefined);
  const deliveryId = () => {
    if (isPickup()) {
      const p = point();
      return pickupItems().some((i) => i.ID === p?.TYPE) ? p.TYPE : (pickupItems()[0]?.ID ?? "");
    }
    return courierItems().some((i) => i.ID === st.deliveryChoice) ? st.deliveryChoice : (courierItems()[0]?.ID ?? "");
  };
  const items = () => (isPickup() ? pickupItems() : courierItems());
  const active = () => items().find((i) => i.ID === deliveryId());
  const payment = () => st.payments.find((p) => p.ID === st.paymentId);
  const slotArea = () => (country() === "RU" && !isPickup() ? slotRegion(form.city, deliveryId()) : null);
  const slotDays = () => (slotArea() ? deliverySlots(slotsOf(slotArea()), { express: deliveryId() === "I_COURIER_1DAY" }) : []);
  const slotDay = () => slotDays().find((d) => d.date === st.slotDate) ?? slotDays()[0];
  const slotHours = () => (slotDay()?.times.includes(st.slotTime) ? st.slotTime : slotDay()?.times[0]);

  const profileObj = () => {
    const base = { COUNTRY: country(), COUNTRY_NAME: countryName(), EMAIL: form.email.trim(), FIO: form.fio.trim(), PHONE: form.phone.replace(/[^0-9+]/g, "") };
    if (isPickup()) {
      const p = point();
      return { ...base, CITY: form.city.trim(), AREA: form.region.trim() || form.city.trim(), STREET: p?.ADDRESS ?? "", DELIVERY_TYPE: active()?.TYPE ?? "PICK_POINT", PICK_POINT_SERVICE: p?.TYPE ?? "", PICK_POINT_CODE: p?.CODE ?? "" };
    }
    return { ...base, CITY: form.city.trim(), AREA: form.region.trim() || form.city.trim(), STREET: form.street, BUILD: form.build, APARTMENT: form.apartment.trim(), POSTINDEX: form.zip.trim(), DELIVERY_TYPE: active()?.TYPE ?? "COURIER" };
  };

  /* ---------- загрузка ---------- */
  async function ensureBasket(lines) {
    const read = async () => {
      const r = await sv("/order");
      window.__shopDebug = { ...(window.__shopDebug ?? {}), order0: r.json };
      return { r, qty: Number(r.json?.result?.QUANTITY ?? 0) || 0 };
    };
    let { r, qty } = await read();
    if (r.status === 401 || r.status === 0) return { ok: false, error: r.json?.error || r.text };
    if (!qty) {
      const pairs = lines.map((l) => `${encodeURIComponent(l.code)}=${l.qty}`).join("&");
      await shopRequest(`/shop/shop_basket.php?${pairs}`);
      ({ r, qty } = await read());
    }
    if (!qty) return { ok: false, error: r.json?.error || "Магазин не принял корзину" };
    const mine = lines.reduce((a, l) => a + l.qty, 0);
    if (qty !== mine && qty !== lines.length) st.warn = `В корзине магазина ${qty} шт., у вас в списке ${mine}. Проверьте состав перед оформлением.`;
    return { ok: true };
  }

  async function loadDelivery() {
    const key = deliveryKey();
    st.deliveryFor = "";
    paintShip();
    if (!place()) return;
    const r = await sv("/delivery", { COUNTRY: country(), CITY: form.city.trim(), AREA: form.region.trim() || form.city.trim() });
    if (key !== deliveryKey()) return;
    window.__shopDebug = { ...(window.__shopDebug ?? {}), delivery: r.json };
    // магазин сам сообщает допустимые оплаты у способа доставки (PAYSYSTEMS): убираем те, где только наличные
    const hasOnline = (i) => !Array.isArray(i.PAYSYSTEMS) || i.PAYSYSTEMS.length === 0 || onlineOnly(i.PAYSYSTEMS).length > 0;
    st.groups = (Array.isArray(r.json?.result) ? r.json.result : []).map((g) => ({ ...g, ITEMS: (Array.isArray(g.ITEMS) ? g.ITEMS : []).filter(hasOnline) })).filter((g) => g.ITEMS.length);
    st.deliveryErr = st.groups.length ? "" : r.json?.error || "Для этого адреса нет способов доставки.";
    st.deliveryFor = key;
    if (!items().length && !st.groups.length) {
      st.payments = [];
      st.paymentId = "";
      st.totals = null;
    }
    paintDelivery();
    paintShip();
    await loadPayments();
    if (isPickup()) loadPoints();
  }

  async function loadPayments() {
    const id = deliveryId();
    if (!id || !place()) {
      paintPay();
      return paintTotals();
    }
    const key = `${id}|${place()}`;
    st.paymentsFor = "";
    paintPay();
    const r = await sv("/payments", { deliveryId: id, COUNTRY: country(), CITY: form.city.trim(), AREA: form.region.trim() || form.city.trim() });
    if (key !== `${deliveryId()}|${place()}`) return;
    window.__shopDebug = { ...(window.__shopDebug ?? {}), payments: r.json };
    st.payments = onlineOnly(Array.isArray(r.json?.result) ? r.json.result : []);
    // как у чек-аута магазина: способ, которым участник платил в прошлый раз (из /init), иначе первый в списке
    if (!st.payments.some((p) => p.ID === st.paymentId)) st.paymentId = st.payments.find((p) => p.ID === st.lastPayment)?.ID ?? st.payments[0]?.ID ?? "";
    st.paymentsFor = key;
    paintPay();
    return loadTotals();
  }

  async function loadPoints() {
    if (!isPickup() || !form.city.trim()) return;
    const key = `${form.region}|${form.city}`;
    st.pointsFor = "";
    paintDelivery();
    const r = await sv("/pickpoints", { COUNTRY: country(), CITY: form.city.trim(), AREA: form.region.trim() || form.city.trim() });
    if (key !== `${form.region}|${form.city}`) return;
    window.__shopDebug = { ...(window.__shopDebug ?? {}), pickpoints: r.json };
    st.points = Array.isArray(r.json?.result) ? r.json.result : [];
    st.pointsFor = key;
    paintDelivery();
  }

  let totalsTimer;
  function loadTotals() {
    clearTimeout(totalsTimer);
    const id = deliveryId();
    st.totalsFor = "";
    paintTotals();
    if (!id || !st.paymentId || !place()) return;
    const key = `${id}|${st.paymentId}|${place()}|${st.promo}|${st.bonus}|${point()?.CODE ?? ""}`;
    totalsTimer = setTimeout(async () => {
      const r = await sv("/order", { bonusUseValue: st.bonus, promo: st.promo, deliveryId: id, paymentId: st.paymentId, pickPoint: point() ? point().CODE : false, COUNTRY: country(), CITY: form.city.trim(), AREA: form.region.trim() || form.city.trim(), PROFILE: profileObj(), dutyEnabled: true });
      if (key !== `${deliveryId()}|${st.paymentId}|${place()}|${st.promo}|${st.bonus}|${point()?.CODE ?? ""}`) return;
      window.__shopDebug = { ...(window.__shopDebug ?? {}), totals: r.json };
      if (r.json?.result) {
        st.totals = r.json.result;
        st.currency = String(st.totals.CURRENCY || st.currency || "RUB");
      }
      st.totalsFor = key;
      paintTotals();
      paintExtras();
    }, 250);
  }

  async function applyPromo() {
    const code = st.promoDraft.trim();
    if (!code || !deliveryId()) return;
    st.promoMsg = "";
    // расчёт заказа отвечает 500 на неизвестный код, поэтому сначала спрашиваем отдельным методом
    const r = await sv("/promo", { promo: code, deliveryId: deliveryId(), COUNTRY: country(), CITY: form.city.trim(), AREA: form.region.trim() || form.city.trim() });
    const discount = r.json?.result && typeof r.json.result === "object" ? num(r.json.result.DISCOUNT) : 0;
    if (discount > 0) {
      st.promo = code;
      st.promoMsg = "";
    } else {
      st.promo = "";
      st.promoMsg = "Этот промокод не подходит.";
    }
    paintExtras();
    loadTotals();
  }

  /* ---------- отрисовка: мелкие блоки ---------- */
  const spinner = (text) => `<p class="ck-loader" role="status"><span class="ck-spinner" aria-hidden="true"></span>${esc(text)}</p>`;
  const float = (name, label, o = {}) => `
    <div class="lc-float" data-field="${name}">
      <div class="lc-floatBox${o.attention ? " lc-floatBoxActive" : ""}${o.error ? " ck-errorBox" : ""}${o.combo ? " ck-combo" : ""}">
        <input class="lc-floatInput" name="${name}" value="${esc(o.value ?? form[name] ?? "")}" placeholder="${esc(o.placeholder ?? " ")}"${o.type ? ` type="${o.type}"` : ""}${o.inputMode ? ` inputmode="${o.inputMode}"` : ""}${o.autoComplete ? ` autocomplete="${o.autoComplete}"` : ""}${o.combo ? ` role="combobox" aria-autocomplete="list" autocomplete="off"` : ""} />
        <label class="lc-floatLabel">${esc(label)}</label>${o.combo ? `<ul class="ck-comboList" role="listbox" hidden></ul>` : ""}
      </div>
      ${o.hint ? `<p class="ck-floatHint${o.error ? " ck-floatHintError" : ""}"${o.error ? ' role="alert"' : ""}>${esc(o.hint)}</p>` : ""}
    </div>`;
  const optionCard = (name, id, checked, title, lines, good) => `<label class="oc-card${checked ? " oc-on" : ""}"><input class="oc-input" type="radio" name="${name}" value="${esc(id)}"${checked ? " checked" : ""} /><span class="oc-title">${esc(title)}</span><span class="oc-foot"><span class="oc-lines${good ? " oc-good" : ""}">${lines}</span>${CHECK.replace("CHK", checked ? TICK : "")}</span></label>`;
  const optionInfo = (title, detail, aside, good) => `<div class="oc-info"><div class="oc-infoText"><span class="oc-infoTitle">${esc(title)}</span>${detail ? `<span class="oc-infoDetail">${esc(detail)}</span>` : ""}</div>${aside ? `<span class="oc-infoAside${good ? " oc-infoGood" : ""}">${esc(aside)}</span>` : ""}</div>`;

  const missingList = () => {
    const pickup = isPickup();
    return [
      ...(pickup
        ? [{ key: "city", bad: !form.city.trim() }, { key: "point", bad: !point() }]
        : [{ key: "address", bad: form.manual || !addressSearchEnabled() ? !form.street.trim() || !form.build.trim() : !form.picked }, { key: "zip", bad: form.zip.trim().length < 5 }, { key: "city", bad: !form.city.trim() }]),
      { key: "fio", bad: form.fio.trim().length < 3 },
      { key: "phone", bad: form.phone.replace(/\D/g, "").length < 10 },
      { key: "email", bad: !/\S+@\S+\.\S+/.test(form.email) },
      { key: "terms", bad: !form.terms },
      { key: "data", bad: !form.data },
    ];
  };
  const isBad = (key) => st.attempted && missingList().find((m) => m.key === key)?.bad;

  function paintMode() {
    const box = $("#ck-mode");
    if (!box) return;
    if (pickupNone()) return void (box.innerHTML = "");
    box.innerHTML = `<div class="ex-switch" role="radiogroup" aria-label="Как получить заказ">${[["courier", "Доставка"], ["pickup", "Самовывоз"]].map(([id, label]) => `<button type="button" role="radio" aria-checked="${(id === "pickup") === isPickup()}" class="ex-switchBtn${(id === "pickup") === isPickup() ? " ex-switchOn" : ""}" data-mode="${id}">${label}</button>`).join("")}</div>`;
  }

  function paintDelivery() {
    const box = $("#ck-delivery");
    if (!box) return;
    paintMode();
    const pickup = isPickup();
    const loadedHere = st.deliveryFor === deliveryKey();
    let html = "";
    if (pickup && pickupItems().length === 0 && place()) {
      html = `<p class="ck-hint">${loadedHere ? `Пунктов выдачи в стране «${esc(countryName())}» пока нет. Выберите доставку.` : "Ищем пункты выдачи…"}</p>`;
    } else if (!pickup) {
      const useSearch = addressSearchEnabled() && !form.manual;
      html += useSearch
        ? float("searchText", "Найти адрес", { placeholder: "Улица, дом, город", combo: true, autoComplete: "off", error: st.attempted && !form.picked && form.searchText.trim() !== "", hint: st.attempted && !form.picked && form.searchText.trim() !== "" ? "Выберите адрес из списка" : "" })
        : float("address", "Улица и дом", { value: streetLine(country(), form.street, form.build), placeholder: "Баумана 12", autoComplete: "address-line1", error: isBad("address"), hint: isBad("address") ? "Укажите улицу и номер дома" : "" });
      html += `<div class="ck-addLines">${addressSearchEnabled() ? (form.manual ? `<button type="button" class="ck-addLine" data-act="search-mode">Искать адрес</button>` : `<button type="button" class="ck-addLine" data-act="manual-mode">Ввести адрес вручную</button>`) : ""}</div>`;
      if (form.manual || !addressSearchEnabled() || form.apartment) html += float("apartment", "Квартира, подъезд (необязательно)", { autoComplete: "address-line2" });
      if (form.manual || !addressSearchEnabled()) {
        html += `<div class="ck-row">${float("zip", "Индекс", { inputMode: "numeric", autoComplete: "postal-code", error: isBad("zip") })}${float("city", "Город", { autoComplete: "address-level2", error: isBad("city") })}</div>${float("region", "Регион (необязательно)", { autoComplete: "address-level1" })}`;
      }
    } else {
      html += float("city", "Город", { autoComplete: "address-level2", error: isBad("city") });
      const p = point();
      const svc = pickupItems().find((i) => i.ID === p?.TYPE);
      const loadingPoints = form.city.trim() && st.pointsFor !== `${form.region}|${form.city}`;
      html += `<div class="ck-pickup" data-field="point">`;
      if (!form.city.trim()) html += `<p class="ck-hint">Введите город, чтобы найти пункты выдачи рядом.</p>`;
      else if (loadingPoints) html += spinner("Ищем пункты выдачи…");
      else if (!st.points.length) html += `<p class="ck-hint">Пунктов выдачи рядом с «${esc(form.city)}» нет. Попробуйте соседний город или выберите доставку по адресу.</p>`;
      else {
        html += `<button type="button" class="ex-pointBtn${isBad("point") ? " ex-pointBtnError" : ""}" data-act="points"><span class="ex-pointText">${p ? `<strong>${esc(svc?.NAME ?? p.NAME)}</strong><small>${esc([p.ADDRESS, p.CITY].filter(Boolean).join(", "))}</small>` : "<strong>Выбрать пункт выдачи</strong>"}</span><span class="ex-pointAction">${p ? "Изменить" : `${st.points.length} рядом`}</span></button>`;
        if (isBad("point")) html += `<p class="ck-floatHint ck-floatHintError" role="alert">Выберите пункт выдачи</p>`;
      }
      html += `</div>`;
    }
    box.innerHTML = html;
    wireAddress();
  }

  function paintShip() {
    const box = $("#ck-ship");
    if (!box) return;
    const slotsHtml = () => {
      const day = slotDay();
      const hours = slotHours();
      if (!day || !hours) return "";
      return `<div class="sl-slots"><p class="sl-slotsTitle">Дата и время доставки</p>
        <div class="sl-chips" role="radiogroup" aria-label="День доставки">${slotDays().map((d) => `<button type="button" role="radio" aria-checked="${d.date === day.date}" class="sl-chip${d.date === day.date ? " sl-chipOn" : ""}" data-slotdate="${d.date}">${esc(d.label)}</button>`).join("")}</div>
        <div class="sl-chips" role="radiogroup" aria-label="Часы доставки">${day.times.map((t) => `<button type="button" role="radio" aria-checked="${t === hours}" class="sl-chip${t === hours ? " sl-chipOn" : ""}" data-slottime="${t}">${esc(t.replace("-", " – "))}</button>`).join("")}</div></div>`;
    };
    const its = items();
    const loading = place() && st.deliveryFor !== deliveryKey();
    let html;
    if (!place()) html = `<p class="ck-hint">Укажите адрес, чтобы увидеть способы доставки.</p>`;
    else if (loading) html = spinner("Загружаем способы доставки…");
    else if (its.length === 1) html = optionInfo(its[0].NAME, [its[0].TRANSIT, its[0].FREE_DELIVERY && its[0].PRICE ? `бесплатно от ${money(its[0].FREE_DELIVERY)}` : ""].filter(Boolean).join(" · "), its[0].PRICE ? money(its[0].PRICE) : "Бесплатно", !its[0].PRICE);
    else if (its.length) {
      html = `<div class="oc-row" role="radiogroup" aria-label="Способ доставки">${its.map((it) => optionCard("delivery", it.ID, deliveryId() === it.ID, it.NAME, `${it.TRANSIT ? `<span>${esc(it.TRANSIT)}</span>` : ""}${it.FREE_DELIVERY && it.PRICE ? `<span>бесплатно от ${esc(money(it.FREE_DELIVERY))}</span>` : ""}<span>${it.PRICE ? esc(money(it.PRICE)) : "Бесплатно"}</span>`, !it.PRICE)).join("")}</div>`;
    } else html = `<p class="ck-hint">${esc(st.deliveryErr || "Для этого адреса нет способов доставки.")}</p>`;
    box.innerHTML = html + slotsHtml();
  }

  function paintPay() {
    const box = $("#ck-pay");
    if (!box) return;
    const loading = place() && deliveryId() && st.paymentsFor !== `${deliveryId()}|${place()}`;
    const ps = st.payments;
    const title = (p) => (/^bank card$/i.test(p.NAME) ? "Банковская карта" : p.NAME);
    let html;
    if (!place()) html = `<p class="ck-hint">Способы оплаты появятся после выбора адреса.</p>`;
    else if (loading) html = spinner("Загружаем способы оплаты…");
    else if (ps.length === 1) html = optionInfo(title(ps[0]), "", "", false);
    else if (ps.length) html = `<div class="oc-row" role="radiogroup" aria-label="Способ оплаты">${ps.map((p) => optionCard("payment", p.ID, st.paymentId === p.ID, title(p), p.IMAGE ? `<img src="${esc(p.IMAGE)}" alt="" style="width:32px;height:32px;object-fit:contain;object-position:left" />` : "<span></span>", false)).join("")}</div>`;
    else html = `<p class="ck-hint">Нет доступных способов оплаты.</p>`;
    box.innerHTML = html;
  }

  /** Промокод и бонусы (бонусы есть у участника с балансом Coral Кошелька). */
  function paintExtras() {
    const box = $("#ck-extras");
    if (!box) return;
    const t = st.totals;
    const have = num(t?.CW_VALUE);
    const limit = num(t?.CW_VALUE_LIMIT);
    const promo = !st.promoOpen && !st.promo
      ? `<button type="button" class="ck-discountToggle" data-act="promo-open"${deliveryId() ? "" : " disabled"}>Добавить промокод</button>`
      : `<div class="ck-discountRow"><input name="promoDraft" value="${esc(st.promoDraft || st.promo)}" placeholder="Промокод" aria-label="Промокод" autocapitalize="characters" /><button type="button" class="ck-apply" data-act="promo-apply"${st.promoDraft.trim() && deliveryId() ? "" : " disabled"}>Применить</button></div>${st.promoMsg ? `<p class="ck-fieldHint">${esc(st.promoMsg)}</p>` : ""}${st.promo ? `<p class="ck-fieldHint">Промокод ${esc(st.promo)} применён.</p>` : ""}`;
    const bonus = have > 0
      ? (!st.bonusOpen && !st.bonus
          ? `<button type="button" class="ck-discountToggle" data-act="bonus-open">Списать бонусы (доступно ${esc(money(have))})</button>`
          : `<div class="ck-discountRow"><input name="bonusDraft" inputmode="numeric" value="${esc(st.bonusDraft || (st.bonus ? String(st.bonus) : ""))}" placeholder="До ${Math.floor(limit || have)}" aria-label="Сколько бонусов списать" /><button type="button" class="ck-apply" data-act="bonus-apply">Списать</button></div><p class="ck-fieldHint">${st.bonus ? `Списывается ${esc(money(st.bonus))}. ` : ""}Можно списать до ${esc(money(limit || have))} из ${esc(money(have))}. <button type="button" class="ck-addLine" data-act="bonus-max">Максимум</button>${st.bonus ? ` <button type="button" class="ck-addLine" data-act="bonus-off">Не списывать</button>` : ""}</p>`)
      : "";
    box.innerHTML = `<div class="ck-discount">${promo}</div>${bonus ? `<div class="ck-discount">${bonus}</div>` : ""}`;
  }

  function summaryHtml() {
    const lines = shop.lines();
    return `<ul class="ck-sumLines">${lines.map((l) => `<li class="ck-sumLine"><span class="ck-thumb">${l.p?.image ? `<img class="ck-thumbImg" src="${esc(l.p.image)}" alt="" />` : ""}<span class="ck-badge">${l.qty}</span></span><span class="ck-lineName">${esc(l.p?.name ?? `Артикул ${l.code}`)}${l.p?.note ? `<small class="ck-lineSub">${esc(l.p.note)}</small>` : ""}</span><span class="ck-lineSum">${l.p?.price != null ? esc(money(l.p.price * l.qty)) : ""}</span></li>`).join("")}</ul>`;
  }

  function totalsFigures() {
    const t = st.totals;
    const lines = shop.lines();
    const goods = t ? num(t.PRICE) : lines.reduce((a, l) => a + (l.p?.price ?? 0) * l.qty, 0);
    const memberSaving = lines.reduce((a, l) => a + (l.p?.old && l.p?.price != null ? (l.p.old - l.p.price) * l.qty : 0), 0);
    const total = t && t.TOTAL_PRICE !== undefined ? num(t.TOTAL_PRICE) : null;
    const delivery = t && t.TOTAL_PRICE !== undefined && t.PRICE !== undefined ? num(t.TOTAL_PRICE) - num(t.PRICE) : null;
    return { goods, memberSaving, total, delivery };
  }

  function paintTotals() {
    const { goods, memberSaving, total, delivery } = totalsFigures();
    const loading = st.totalsFor === "" && place() && st.paymentId;
    const rows = `<dl class="ck-rows">
      ${memberSaving > 0 ? `<div class="ck-rowGood"><dt>Скидка участника</dt><dd>−${esc(money(memberSaving))}</dd></div>` : ""}
      <div><dt>Товары</dt><dd>${esc(money(goods))}</dd></div>
      <div><dt>Доставка</dt><dd>${delivery === null ? "—" : delivery > 0 ? esc(money(delivery)) : "Бесплатно"}</dd></div>
      <div class="ck-rowTotal"><dt>Итого</dt><dd>${total !== null ? esc(money(total)) : "—"}</dd></div></dl>`;
    const box = $("#ck-total");
    if (box) box.innerHTML = `<h2 class="ck-h2">Итого</h2>${loading ? spinner("Считаем…") : ""}<div${loading ? ' class="ck-dim"' : ""}>${rows}</div>${memberSaving > 0 ? `<p class="ck-saved">Общая экономия ${esc(money(memberSaving))}</p>` : ""}`;
    const head = $("#ck-sumprice");
    if (head) head.innerHTML = `<strong>${esc(money(total ?? goods))}</strong>`;
    const body = $("#ck-sumbody");
    if (body) body.innerHTML = summaryHtml();
    const pay = $("#ck-pay-btn");
    if (pay) pay.disabled = st.sending || !st.ready || Boolean(loading) || !(deliveryId() && st.paymentId && st.totals);
  }

  function paintForm() {
    const e = (k) => isBad(k);
    set(`
      <div class="ck-page"><div class="ck-layout">
        <details class="ck-sumMobile"><summary class="ck-sumHead"><span>Состав заказа ${CHEV}</span><span class="ck-sumHeadPrice" id="ck-sumprice"></span></summary><div class="ck-sumBodyMobile" id="ck-sumbody"></div></details>
        <div class="ck-main">
          ${st.warn ? `<p class="ck-error">${esc(st.warn)}</p>` : ""}
          ${st.error ? `<p class="ck-error" role="alert">${esc(st.error)}</p>` : ""}
          <div id="ck-mode"></div>
          <section class="ck-section"><h2 class="ck-h2">Доставка</h2><div id="ck-delivery"></div></section>
          <section class="ck-section"><h2 class="ck-h2">Контакты</h2>
            ${float("email", "E-mail", { type: "email", inputMode: "email", autoComplete: "email", error: e("email"), hint: e("email") ? "Проверьте адрес почты" : "" })}
            ${float("fio", "Имя и фамилия", { autoComplete: "name", error: e("fio"), hint: e("fio") ? "Укажите имя и фамилию" : "" })}
            ${float("phone", "Телефон", { type: "tel", inputMode: "tel", autoComplete: "tel", error: e("phone"), hint: e("phone") ? "Укажите телефон с кодом" : "" })}</section>
          <section class="ck-section"><h2 class="ck-h2">Способ доставки</h2><div id="ck-ship"></div></section>
          <section class="ck-section" id="payment-method"><h2 class="ck-h2">Оплата</h2><div id="ck-pay"></div></section>
          <div id="ck-extras"></div>
          <section class="ck-section"><h2 class="ck-h2">Комментарий к заказу</h2>${float("comment", "Необязательно", {})}</section>
          <section class="ck-totalCard" id="ck-total"></section>
          <div class="ck-consents">
            <label class="lc-check${e("terms") ? " lc-checkActive" : ""}" data-field="terms"><input type="checkbox" name="terms"${form.terms ? " checked" : ""} /><span>Принимаю <a href="https://coralclub.ru/faq/terms/" target="_blank" rel="noopener noreferrer">условия оферты</a> и ознакомлен с <a href="https://coralclub.ru/faq/privacy/" target="_blank" rel="noopener noreferrer">политикой конфиденциальности</a></span></label>
            <label class="lc-check${e("data") ? " lc-checkActive" : ""}" data-field="data"><input type="checkbox" name="data"${form.data ? " checked" : ""} /><span>Согласен на обработку персональных данных</span></label>
          </div>
          <button type="button" class="ck-pay" id="ck-pay-btn" data-act="send">${st.sending ? "Оформляем заказ…" : "Перейти к оплате"}</button>
        </div></div></div>`);
    paintDelivery();
    paintShip();
    paintPay();
    paintExtras();
    paintTotals();
  }

  /* ---------- адрес: подсказки Google ---------- */
  let anchor = null; // выбранная улица ждёт номер дома: город идёт в запрос, чтобы нашлась нужная улица
  let session = null;
  let seq = 0;
  let items0 = [];
  let activeIdx = 0;

  function paintCombo() {
    const list = $(".ck-comboList");
    if (!list) return;
    const input = $('[name="searchText"]');
    const shown = items0.length > 0 && document.activeElement === input;
    list.hidden = !shown;
    list.innerHTML = items0.map((s, i) => `<li role="option" aria-selected="${i === activeIdx}" class="ck-comboOption${i === activeIdx ? " ck-comboActive" : ""}" data-sug="${i}">${esc(s.main)}${s.secondary ? `<span class="ck-suggestSecondary">${esc(s.secondary)}</span>` : ""}</li>`).join("") + (shown ? `<li class="ck-poweredBy" aria-hidden="true">powered by Google</li>` : "");
  }

  async function onSearchInput(value) {
    form.searchText = value;
    if (form.picked) {
      form.picked = false;
      Object.assign(form, { street: "", build: "", apartment: "", zip: "", city: "", region: "" });
    }
    if (anchor && !value.startsWith(anchor.text)) anchor = null;
    const waiting = anchor?.text === value;
    const q = anchor ? `${value.trim()}, ${anchor.city}` : value.trim();
    const mine = ++seq;
    await new Promise((r) => setTimeout(r, q.length < 3 ? 0 : 250));
    if (mine !== seq) return;
    if (q.length < 3 || waiting) {
      items0 = [];
      return paintCombo();
    }
    try {
      session ??= newSession();
      const found = await suggestAddresses(q, await session, country());
      if (mine === seq) {
        items0 = found;
        activeIdx = 0;
        paintCombo();
      }
    } catch {
      if (mine === seq) {
        items0 = [];
        paintCombo();
      }
    }
  }

  async function pickSuggestion(s) {
    const input = $('[name="searchText"]');
    if (s.street) {
      items0 = [];
      paintCombo();
      try {
        const { route, city } = await resolveStreet(s);
        anchor = { text: `${route} `, city };
        form.searchText = `${route} `;
      } catch {
        form.searchText = `${s.main} `;
      }
      if (input) {
        input.value = form.searchText;
        input.focus();
      }
      return;
    }
    items0 = [];
    paintCombo();
    try {
      applyAddress(await resolveAddress(s));
    } catch {
      form.searchText = s.main;
      if (input) input.value = s.main;
    }
    session = null; // выбор завершает сессию оплаты Google
  }

  function applyAddress(a) {
    const line = streetLine(country(), a.street, a.houseNumber);
    Object.assign(form, { street: a.street, build: a.houseNumber, apartment: a.unit || "", city: a.city, region: a.state, zip: a.zip });
    if (a.street && a.houseNumber && a.zip && a.city) {
      form.searchText = [line, a.zip, a.city].filter(Boolean).join(", ");
      form.picked = true;
      form.manual = false;
    } else {
      form.manual = true; // чего-то не хватает: пусть участник допишет
      form.picked = false;
    }
    paintDelivery();
    loadDelivery();
  }

  function wireAddress() {
    const input = $('[name="searchText"]');
    if (!input) return;
    input.addEventListener("focus", paintCombo);
    input.addEventListener("blur", () => setTimeout(() => ($(".ck-comboList") ? ($(".ck-comboList").hidden = true) : 0), 150));
    input.addEventListener("keydown", (e) => {
      if (!items0.length) return;
      if (e.key === "ArrowDown") (e.preventDefault(), (activeIdx = Math.min(activeIdx + 1, items0.length - 1)), paintCombo());
      else if (e.key === "ArrowUp") (e.preventDefault(), (activeIdx = Math.max(activeIdx - 1, 0)), paintCombo());
      else if (e.key === "Enter") (e.preventDefault(), pickSuggestion(items0[activeIdx]));
      else if (e.key === "Escape") ((items0 = []), paintCombo());
    });
  }

  /* ---------- пункты выдачи ---------- */
  function openPoints() {
    const svcs = pickupItems();
    const box = document.createElement("div");
    box.className = "sheet-form ps-sheet";
    const draw = () => {
      const q = st.pointsQuery.trim().toLowerCase();
      const list = st.points.filter((p) => (!st.pointsTypes.length || st.pointsTypes.includes(p.TYPE)) && (!q || `${p.NAME} ${p.ADDRESS}`.toLowerCase().includes(q)));
      box.innerHTML = `
        <div class="lc-floatBox"><input class="lc-floatInput" name="pq" value="${esc(st.pointsQuery)}" placeholder=" " /><label class="lc-floatLabel">Поиск по адресу</label></div>
        ${svcs.length > 1 ? `<div class="ps-chips">${svcs.map((s) => `<button type="button" class="ps-chip${st.pointsTypes.includes(s.ID) ? " ps-chipOn" : ""}" data-svc="${esc(s.ID)}">${esc(s.NAME)}</button>`).join("")}</div>` : ""}
        <div class="ps-list">${list.length ? list.slice(0, 80).map((p) => {
          const svc = svcs.find((s) => s.ID === p.TYPE);
          return `<div class="ps-row"><div class="ps-cardBody"><p class="ps-cardName">${esc(svc?.NAME ?? p.NAME)}</p><p class="ps-cardLine">${esc([p.ADDRESS, p.CITY].filter(Boolean).join(", "))}</p>${p.WORKTIME ? `<p class="ps-cardMuted">${esc(hoursText(p.WORKTIME))}</p>` : ""}${svc?.PRICE ? `<p class="ps-cardMuted">${esc(money(svc.PRICE))}</p>` : ""}</div><button type="button" class="ps-pick" data-code="${esc(p.CODE)}">Выбрать</button></div>`;
        }).join("") : `<p class="ps-empty">Подходящих пунктов нет.</p>`}</div>`;
      const pq = box.querySelector('[name="pq"]');
      pq.focus();
      pq.setSelectionRange(pq.value.length, pq.value.length);
    };
    box.addEventListener("input", (e) => {
      if (e.target.name === "pq") {
        st.pointsQuery = e.target.value;
        draw();
      }
    });
    box.addEventListener("click", (e) => {
      const svc = e.target.closest("[data-svc]");
      if (svc) {
        const id = svc.dataset.svc;
        st.pointsTypes = st.pointsTypes.includes(id) ? st.pointsTypes.filter((x) => x !== id) : [...st.pointsTypes, id];
        return draw();
      }
      const pick1 = e.target.closest("[data-code]");
      if (pick1) {
        st.pointCode = pick1.dataset.code;
        sheet.close();
        paintDelivery();
        paintShip();
        loadPayments();
      }
    });
    draw();
    sheet.open(`Пункты выдачи: ${form.city}`, box);
  }

  /* ---------- проверка и отправка ---------- */
  function review() {
    st.attempted = true;
    const bad = missingList().filter((m) => m.bad);
    if (bad.length || !deliveryId() || !st.paymentId || !st.totals) {
      paintForm();
      const el = bad.length ? root.querySelector(`[data-field="${bad[0].key}"]`) : null;
      el?.scrollIntoView({ block: "center", behavior: "smooth" });
      el?.classList.add("lc-shake");
      if (!bad.length) toast("Выберите доставку и оплату, дождитесь итога", true);
      return;
    }
    const lines = shop.lines();
    const { total } = totalsFigures();
    const where = isPickup() ? [point()?.ADDRESS, point()?.CITY].filter(Boolean).join(", ") : [form.city, form.street, form.build && `д. ${form.build}`, form.apartment && `кв. ${form.apartment}`].filter(Boolean).join(", ");
    const box = document.createElement("div");
    box.className = "sheet-form";
    box.innerHTML = `
      <p class="ck-note">Будет создан настоящий заказ в магазине.</p>
      <ul class="ck-sumLines">${lines.map((l) => `<li class="ck-sumLine"><span class="ck-lineName">${esc(l.p?.name ?? l.code)}</span><span class="ck-lineSum">× ${l.qty}</span></li>`).join("")}</ul>
      <p class="ck-host"><b>${isPickup() ? "Пункт выдачи" : "Адрес"}:</b> ${esc(where)}</p>
      <p class="ck-host"><b>Доставка:</b> ${esc(active()?.NAME ?? "")}${slotDay() && slotHours() ? `, ${esc(slotDay().label)}, ${esc(slotHours().replace("-", " – "))}` : ""}<br><b>Оплата:</b> ${esc(payment()?.NAME ?? "")}</p>
      <dl class="ck-rows"><div class="ck-rowTotal"><dt>Итого</dt><dd>${esc(money(total ?? 0))}</dd></div></dl>
      <div class="row2"><button class="btn ghost" type="button" data-no>Отмена</button><button class="btn" type="button" data-ok>Оформить заказ</button></div>`;
    box.querySelector("[data-no]").onclick = sheet.close;
    box.querySelector("[data-ok]").onclick = (e) => {
      e.currentTarget.disabled = true;
      submit();
    };
    sheet.open("Подтвердите заказ", box);
  }

  /** Единственное место, где создаётся настоящий заказ: вызывается по нажатию в окне подтверждения. */
  async function submit() {
    if (st.sending) return;
    st.sending = true;
    paintTotals();
    const day = slotDay();
    const hours = slotHours();
    const body = {
      deliveryId: deliveryId(),
      paymentId: st.paymentId,
      EMAIL: form.email.trim(),
      FIO: form.fio.trim(),
      PHONE: form.phone.replace(/[^0-9+]/g, ""),
      PROFILE: { ...profileObj(), MANUAL: 1, ...(form.comment ? { COMMENT: form.comment } : {}) },
      additionalOrderInfo: { orderComment: [form.comment, day && hours ? `Доставка: ${day.label}, ${hours}` : ""].filter(Boolean).join(". "), needToContact: false, contactMethod: "", chosenMessenger: "", receiveEmails: false, acceptTerms: form.terms, acceptTerms2: false, agreePersonalData: form.data },
      memberId: who().id,
      bonusUse: !(st.bonus > 0), // так шлёт сам чек-аут магазина: признак «не списывать» наоборот
      bonusUseValue: st.bonus,
      promo: st.promo,
      dutyEnabled: true,
      ...(day && hours ? { DELIVERY_DATE: day.date, DELIVERY_FROM: hours.split("-")[0], DELIVERY_TO: hours.split("-")[1] } : {}),
    };
    const r = await sv("/order", {}, { method: "POST", body });
    st.sending = false;
    sheet.close();
    const id = r.json?.result;
    if (!r.ok || !id) {
      st.error = r.json?.error || "Магазин не принял заказ. Проверьте данные.";
      paintForm();
      return window.scrollTo({ top: 0, behavior: "smooth" });
    }
    st.orderId = String(id);
    shop.refreshCart();
    afterOrder();
  }

  /**
   * Куда платить. У заказа в API кабинета есть готовая ссылка оплаты (paymentLink, адрес магазина /redirect.php с сессией в
   * самой ссылке). Посредник проходит её до банка и отдаёт адрес банка: { target: { url, method, fields } }.
   * Если посредник банк не нашёл, ссылку открывает сам браузер: магазин ведёт на оплату сам.
   */
  async function gatewayTarget() {
    st.gatewayError = "";
    st.payLink = "";
    const o = await api(`${P}/personal-new/shop/orders/${st.orderId}`);
    const raw = o.json?.data?.paymentLink;
    if (typeof raw !== "string" || !raw) {
      st.gatewayError = "у заказа нет ссылки оплаты";
      return null;
    }
    // шлюз зависит от страны: РФ и Беларусь открывают /order/payment/<номер>/, остальные страны несут способ оплаты в адресе
    // (так переходит сам чек-аут магазина). Сессия участника лежит в ссылке оплаты; относительный url обязателен.
    const u = new URL(raw);
    const sid = u.searchParams.get("session_id");
    const short = country() === "RU" || country().startsWith("BY");
    const rel = short ? `/order/payment/${st.orderId}/?new_checkout=1` : `/order/payment/${st.orderId}/${st.paymentId}/?new_checkout=1`;
    st.payLink = sid ? `${u.origin}/redirect.php?session_id=${sid}&url=${encodeURIComponent(rel)}` : raw;
    const r = await shopRequest("/pay", { method: "POST", body: { link: st.payLink } });
    st.gatewayError = r.json?.error || (r.ok ? "" : `посредник ответил ${r.status}`);
    const t = r.json?.target;
    try {
      const u = new URL(String(t?.url));
      if (u.protocol !== "https:" || /(^|\.)(coral\.club|coralclub\.[a-z]+)$/i.test(u.hostname)) return null; // только внешний банк
      return { url: u.href, method: t.method === "POST" ? "POST" : "GET", fields: t.fields && typeof t.fields === "object" ? t.fields : {} };
    } catch {
      return null;
    }
  }
  function goToGateway(t) {
    if (t.method === "GET" && !Object.keys(t.fields).length) return void location.assign(t.url);
    const f = document.createElement("form");
    f.method = t.method;
    f.action = t.url;
    for (const [name, value] of Object.entries(t.fields)) {
      const i = document.createElement("input");
      i.type = "hidden";
      i.name = name;
      i.value = value;
      f.appendChild(i);
    }
    document.body.appendChild(f);
    f.submit();
  }

  async function afterOrder() {
    const pay = payment();
    const online = pay && !CASHLIKE.test(pay.NAME); // карта, СБП, SberPay, ЮMoney: открывается шлюз по стране
    if (online) {
      set(`<div class="ck-page ck-empty">${spinner("Заказ оформлен. Переходим к оплате…")}</div>`);
      const t = await gatewayTarget();
      if (t) return goToGateway(t);
      // банк напрямую не нашли: ссылка оплаты магазина сама приведёт к оплате
      if (st.payLink) return void location.assign(st.payLink);
    }
    paintDone();
  }

  function paintDone() {
    const pay = payment();
    const online = pay && !CASHLIKE.test(pay.NAME);
    set(`
      <div class="ck-page"><div class="ck-main">
        <section class="ck-section"><p class="ck-doneMark" aria-hidden="true">✓</p><h1 class="ck-title">Заказ № ${esc(st.orderId)} оформлен</h1>
        <p class="ck-sub">${online ? `Способ оплаты: ${esc(pay.NAME)}. Страницу банка открыть не удалось${st.gatewayError ? ` (${esc(st.gatewayError)})` : ""}. Заказ создан и ждёт оплаты, можно повторить переход.` : `Способ оплаты: ${esc(pay?.NAME ?? "")}.`}</p></section>
        ${online ? `<button class="ck-pay" type="button" data-act="pay-retry">Повторить переход к оплате</button>` : ""}
        <a class="ck-backLink" href="#/orders">История заказов</a>
        <a class="ck-backLink" href="#/">В магазин</a>
      </div></div>`);
  }

  /* ---------- события ---------- */
  root.addEventListener("input", (e) => {
    const t = e.target;
    if (t.name === "searchText") return void onSearchInput(t.value);
    if (t.name === "promoDraft") {
      st.promoDraft = t.value;
      const b = root.querySelector('[data-act="promo-apply"]');
      if (b) b.disabled = !t.value.trim() || !deliveryId();
      return;
    }
    if (t.name === "bonusDraft") return void (st.bonusDraft = t.value);
    if (!t.name || !(t.name in form)) return;
    if (t.name === "address") {
      const { street, build } = splitStreet(t.value);
      form.street = street;
      form.build = build;
    } else form[t.name] = t.type === "checkbox" ? t.checked : t.value;
    t.closest(".lc-floatBox")?.classList.remove("ck-errorBox");
    t.closest(".lc-check")?.classList.remove("lc-checkActive");
    if (["fio", "phone", "email", "street", "build", "apartment", "zip"].includes(t.name) || t.name === "address") loadTotals();
  });
  root.addEventListener("change", (e) => {
    const t = e.target;
    if (t.name === "city" || t.name === "region") {
      form[t.name] = t.value.trim();
      if (t.name === "city") {
        // регион остался от прежнего города: сбрасываем, пока участник не укажет его сам
        form.region = "";
        st.pointCode = "";
        st.points = [];
        st.pointsFor = "";
        form.picked = false;
        paintDelivery();
      }
      return void loadDelivery();
    }
    if (t.name === "delivery") {
      st.deliveryChoice = t.value;
      paintShip();
      return void loadPayments();
    }
    if (t.name === "payment") {
      st.paymentId = t.value;
      paintPay();
      return void loadTotals();
    }
  });
  root.addEventListener("click", (e) => {
    const sug = e.target.closest("[data-sug]");
    if (sug) return void pickSuggestion(items0[Number(sug.dataset.sug)]);
    const slotDate = e.target.closest("[data-slotdate]");
    if (slotDate) return ((st.slotDate = slotDate.dataset.slotdate), (st.slotTime = ""), paintShip());
    const slotTime = e.target.closest("[data-slottime]");
    if (slotTime) return ((st.slotTime = slotTime.dataset.slottime), paintShip());
    const mode = e.target.closest("[data-mode]");
    if (mode) {
      st.mode = mode.dataset.mode;
      paintDelivery();
      paintShip();
      loadPayments();
      if (st.mode === "pickup") loadPoints().then(() => st.points.length && isPickup() && openPoints());
      return;
    }
    const act = e.target.closest("[data-act]")?.dataset.act;
    if (!act) return;
    if (act === "send") return review();
    if (act === "pay-retry") return afterOrder();
    if (act === "points") return openPoints();
    if (act === "manual-mode") return ((form.manual = true), paintDelivery());
    if (act === "search-mode") {
      form.manual = false;
      form.picked = Boolean(form.street && form.build && form.zip.trim() && form.city);
      form.searchText = form.picked ? [streetLine(country(), form.street, form.build), form.zip.trim(), form.city].join(", ") : "";
      return paintDelivery();
    }
    if (act === "promo-open") return ((st.promoOpen = true), paintExtras());
    if (act === "promo-apply") return applyPromo();
    if (act === "bonus-open") return ((st.bonusOpen = true), paintExtras());
    const have = num(st.totals?.CW_VALUE);
    const limit = Math.floor(num(st.totals?.CW_VALUE_LIMIT) || have);
    if (act === "bonus-max" || act === "bonus-apply" || act === "bonus-off") {
      const typed = Math.floor(num(st.bonusDraft));
      st.bonus = act === "bonus-off" ? 0 : Math.max(0, Math.min(limit, act === "bonus-max" ? limit : typed));
      st.bonusDraft = st.bonus ? String(st.bonus) : "";
      if (!st.bonus) st.bonusOpen = false;
      paintExtras();
      loadTotals();
    }
  });

  /** Другая страна: адрес был для старой, магазин пересчитывает доставку и оплату (как в «Друге клуба»). */
  function changeCountry(code) {
    if (!code || code === country()) return;
    setCountry(code);
    toast?.(`Страна заказа: ${countryName()}`);
    Object.assign(st, { groups: [], payments: [], paymentId: "", deliveryChoice: "", totals: null, points: [], pointsFor: "", pointCode: "", deliveryFor: "", paymentsFor: "", totalsFor: "" });
    Object.assign(form, { street: "", build: "", apartment: "", zip: "", city: "", region: "", searchText: "", picked: false, manual: false });
    if (st.ready) {
      paintForm();
    }
  }

  /* ---------- вход на страницу ---------- */
  async function open() {
    const token = ++st.run;
    Object.assign(st, { orderId: "", attempted: false, warn: "", error: "", sending: false, ready: false });
    const lines = shop.lines();
    if (!lines.length) return set(`<div class="ck-page ck-empty"><h1 class="ck-title">Оформление</h1><p class="ck-host">В корзине пусто.</p><a class="ck-backLink" href="#/">В магазин</a></div>`);
    if (!shopReady()) {
      return set(`<div class="ck-page ck-empty"><p class="ck-host">Оформление внутри ЛК работает при запуске стенда через <b>npm start</b>: магазин принимает такие запросы только по своей сессии.</p><a class="ck-backLink" href="#/cart">Назад в корзину</a></div>`);
    }
    set(`<div class="ck-page">${spinner("Готовим заказ…")}</div>`);
    // ключ поиска адреса Google отдаёт стенд (из GOOGLE_PLACES_KEY / .env.local), в репозитории его нет
    setPlacesKey((await shopConfig()).placesKey);
    const w = who();
    Object.assign(form, { fio: w.fio ?? "", phone: w.phone ?? "", email: w.email ?? "" });
    const b = await ensureBasket(lines);
    if (token !== st.run) return;
    if (!b.ok) return set(`<div class="ck-page ck-empty"><p class="ck-host">Не удалось подготовить заказ: ${esc(b.error || "магазин не ответил")}.</p><a class="ck-backLink" href="#/cart">Назад в корзину</a></div>`);
    const loc = await shopRequest("/restApi/v4/location/getLocation?language=ru");
    const guess = loc.json && typeof loc.json === "object" ? loc.json : {};
    const init = await sv("/init");
    window.__shopDebug = { ...(window.__shopDebug ?? {}), init: init.json };
    if (token !== st.run) return;
    const opts = init.json?.result?.CHECKOUT_OPTIONS ?? {};
    rememberCountries(opts.countries);
    st.lastPayment = init.json?.result?.PROFILE_LAST?.LAST_CHOICES?.LAST_PAYMENT_TYPE?.ID ?? "";
    st.slotCfg = { moscow: opts.moscowDeliveryTimes, spb: opts.spbDeliveryTimes };
    if (!form.city) {
      form.city = (country() === "RU" && (w.city || guess.city)) || "";
      form.region = form.city === guess.city ? guess.area || "" : "";
    }
    st.ready = true;
    paintForm();
    await loadDelivery();
  }

  onCountryRequest(changeCountry);
  return { open };
}
