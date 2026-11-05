// Оформление заказа внутри ЛК, без перехода на сайт магазина.
// Порядок как в чек-ауте магазина: корзина магазина → город → способы доставки → способы оплаты → итоги →
// POST /sv-api/order (только по нажатию «Оформить заказ» в окне подтверждения).
// Магазин принимает такие запросы только по своей сессии, поэтому они идут через стенд (npm start): см. server.mjs, /lk/shop/.
// Не поддержано в этой версии: пункты выдачи, бонусы и промокод, выбор времени курьера, оплата картой на этой странице
// (для неё после заказа открывается страница оплаты магазина).

const CASHLIKE = /налич|при получении/i;

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

export function createCheckout(root, { shopRequest, shopReady, shop, who, api, P, money, esc, sheet, toast }) {
  const form = { fio: "", phone: "", email: "", city: "", area: "", street: "", build: "", apartment: "", postindex: "", comment: "", terms: false, data: false };
  const st = { run: 0, groups: [], payments: [], deliveryId: "", paymentId: "", totals: null, ready: false, sending: false, tried: false, warn: "", orderId: "" };

  const sv = (path, params = {}, opts = {}) => shopRequest(`/sv-api${path}?${qs({ ...params, language: "ru" })}`, opts);
  const items = () => st.groups.flatMap((g) => g.ITEMS.map((i) => ({ ...i, group: g.NAME })));
  const active = () => items().find((i) => i.ID === st.deliveryId);
  const payment = () => st.payments.find((p) => p.ID === st.paymentId);
  const rub = (n) => money(n, "RUB");
  const set = (html) => {
    root.innerHTML = html;
  };

  const profileObj = () => ({
    COUNTRY: "RU",
    COUNTRY_NAME: "Россия",
    CITY: form.city,
    AREA: form.area || form.city,
    STREET: form.street,
    BUILD: form.build,
    APARTMENT: form.apartment,
    POSTINDEX: form.postindex,
    DELIVERY_TYPE: active()?.TYPE ?? "COURIER",
    EMAIL: form.email,
    FIO: form.fio,
    PHONE: form.phone.replace(/[^0-9+]/g, ""),
  });

  /* ---------- шаги загрузки ---------- */
  /** Корзина магазина должна совпадать с корзиной участника: у авторизованного это одна корзина; если пуста, наполняем. */
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
    const r = await sv("/delivery", { COUNTRY: "RU", CITY: form.city, AREA: form.area || form.city });
    window.__shopDebug = { ...(window.__shopDebug ?? {}), delivery: r.json };
    const groups = Array.isArray(r.json?.result) ? r.json.result.map((g) => ({ ...g, ITEMS: (Array.isArray(g.ITEMS) ? g.ITEMS : []).filter((i) => i.TYPE !== "PICK_POINT") })) : [];
    st.groups = groups.filter((g) => g.ITEMS.length);
    st.deliveryError = st.groups.length ? "" : r.json?.error || "Для этого города нет способов доставки, которые можно оформить здесь";
    const all = items();
    if (!all.some((i) => i.ID === st.deliveryId)) st.deliveryId = st.groups.find((g) => g.ID === "COURIER")?.ITEMS[0]?.ID ?? all[0]?.ID ?? "";
    paintDelivery();
    if (!st.deliveryId) {
      st.payments = [];
      st.paymentId = "";
      st.totals = null;
      paintPay();
      return paintSum();
    }
    return loadPayments();
  }

  async function loadPayments() {
    const r = await sv("/payments", { deliveryId: st.deliveryId, COUNTRY: "RU", CITY: form.city, AREA: form.area || form.city });
    window.__shopDebug = { ...(window.__shopDebug ?? {}), payments: r.json };
    st.payments = Array.isArray(r.json?.result) ? r.json.result : [];
    if (!st.payments.some((p) => p.ID === st.paymentId)) st.paymentId = st.payments[0]?.ID ?? "";
    paintPay();
    return loadTotals();
  }

  let totalsTimer;
  function loadTotals() {
    clearTimeout(totalsTimer);
    st.totals = null;
    paintSum();
    if (!st.deliveryId || !st.paymentId) return Promise.resolve();
    return new Promise((resolve) => {
      totalsTimer = setTimeout(async () => {
        const key = `${st.deliveryId}|${st.paymentId}|${form.city}`;
        const r = await sv("/order", { bonusUseValue: 0, promo: "", deliveryId: st.deliveryId, paymentId: st.paymentId, pickPoint: false, COUNTRY: "RU", CITY: form.city, AREA: form.area || form.city, PROFILE: profileObj(), dutyEnabled: true });
        if (key !== `${st.deliveryId}|${st.paymentId}|${form.city}`) return resolve();
        window.__shopDebug = { ...(window.__shopDebug ?? {}), totals: r.json };
        st.totals = r.json?.result ?? null;
        st.totalsError = st.totals ? "" : r.json?.error || "Не удалось посчитать итог";
        paintSum();
        resolve();
      }, 250);
    });
  }

  /* ---------- отрисовка ---------- */
  const skel = (n = 3) => `<div class="sk-lines" role="status" aria-label="Загрузка">${Array.from({ length: n }, (_, i) => `<i class="sk" style="width:${[92, 70, 55][i % 3]}%"></i>`).join("")}</div>`;
  const field = (name, label, attrs = "", bad = false) => `<label class="ck-f${bad ? " bad" : ""}" data-field="${name}"><span>${label}</span><input name="${name}" value="${esc(form[name])}" ${attrs} />${bad ? `<em>Заполните поле</em>` : ""}</label>`;
  const radio = (name, id, checked, title, sub, right) => `<label class="ck-opt${checked ? " on" : ""}"><input type="radio" name="${name}" value="${esc(id)}"${checked ? " checked" : ""} /><span class="ck-opt-main"><b>${esc(title)}</b>${sub ? `<small>${esc(sub)}</small>` : ""}</span>${right ? `<span class="ck-opt-r">${esc(right)}</span>` : ""}</label>`;

  function paintDelivery() {
    const box = root.querySelector("#ck-delivery");
    if (!box) return;
    box.innerHTML = st.groups.length
      ? st.groups.map((g) => g.ITEMS.map((i) => radio("delivery", i.ID, i.ID === st.deliveryId, i.NAME, [g.NAME !== i.NAME ? g.NAME : "", i.TRANSIT].filter(Boolean).join(" · "), num(i.PRICE) > 0 ? rub(num(i.PRICE)) : "")).join("")).join("")
      : `<p class="s-warn">${esc(st.deliveryError || "Нет способов доставки")}</p>`;
  }
  function paintPay() {
    const box = root.querySelector("#ck-pay");
    if (!box) return;
    box.innerHTML = st.payments.length ? st.payments.map((p) => radio("payment", p.ID, p.ID === st.paymentId, p.NAME, "", "")).join("") : `<p class="s-note">Способы оплаты появятся после выбора доставки.</p>`;
  }
  function paintSum() {
    const box = root.querySelector("#ck-sum");
    if (!box) return;
    const t = st.totals;
    if (!t) return void (box.innerHTML = st.totalsError ? `<p class="s-warn">${esc(st.totalsError)}</p>` : skel(2));
    const goods = num(t.PRICE);
    const total = num(t.TOTAL_PRICE);
    const ship = total - goods;
    box.innerHTML = `
      <div class="s-sumrow"><span>Товары</span><b>${esc(rub(goods || total))}</b></div>
      <div class="s-sumrow"><span>Доставка</span><b>${ship > 0 ? esc(rub(ship)) : "бесплатно"}</b></div>
      <div class="s-sumrow s-total"><span>Итого</span><b>${esc(rub(total))}</b></div>`;
  }

  function paintForm(lines) {
    const bad = (k) => st.tried && missing().includes(k);
    set(`
      ${st.warn ? `<p class="s-warn">${esc(st.warn)}</p>` : ""}
      <section class="h-card ck-card"><h3>Состав заказа</h3>
        <ul class="ck-items">${lines.map((l) => `<li><span>${esc(l.p?.name ?? `Артикул ${l.code}`)}</span><b>${l.qty} × ${l.p?.price != null ? esc(rub(l.p.price)) : "—"}</b></li>`).join("")}</ul></section>
      <section class="h-card ck-card"><h3>Получатель</h3>
        ${field("fio", "ФИО", 'autocomplete="name"', bad("fio"))}
        ${field("phone", "Телефон", 'type="tel" inputmode="tel" autocomplete="tel"', bad("phone"))}
        ${field("email", "E-mail", 'type="email" inputmode="email" autocomplete="email"', bad("email"))}</section>
      <section class="h-card ck-card"><h3>Доставка</h3>
        ${field("city", "Город", 'autocomplete="address-level2"', bad("city"))}
        <div id="ck-delivery" class="ck-opts">${skel(2)}</div>
        ${field("street", "Улица", 'autocomplete="address-line1"', bad("street"))}
        <div class="ck-row">${field("build", "Дом", "", bad("build"))}${field("apartment", "Квартира", "")}${field("postindex", "Индекс", 'inputmode="numeric" autocomplete="postal-code"', bad("postindex"))}</div>
        <p class="s-note">Самовывоз и пункты выдачи в этой версии недоступны, выберите доставку курьером или почтой.</p></section>
      <section class="h-card ck-card"><h3>Оплата</h3><div id="ck-pay" class="ck-opts">${skel(2)}</div></section>
      <section class="h-card ck-card"><h3>Комментарий к заказу</h3><label class="ck-f"><textarea name="comment" rows="2" placeholder="Необязательно">${esc(form.comment)}</textarea></label></section>
      <section class="s-sum"><div id="ck-sum">${skel(2)}</div>
        <label class="ck-check${bad("terms") ? " bad" : ""}" data-field="terms"><input type="checkbox" name="terms"${form.terms ? " checked" : ""} /><span>Принимаю условия оферты</span></label>
        <label class="ck-check${bad("data") ? " bad" : ""}" data-field="data"><input type="checkbox" name="data"${form.data ? " checked" : ""} /><span>Согласен на обработку персональных данных</span></label>
        <button class="btn s-go" type="button" data-send>Оформить заказ</button>
        <p class="s-note">Заказ создаётся в магазине после подтверждения на следующем шаге.</p></section>`);
    paintDelivery();
    paintPay();
    paintSum();
  }

  /* ---------- проверка и отправка ---------- */
  function missing() {
    const bad = [];
    if (form.fio.trim().length < 3) bad.push("fio");
    if (form.phone.replace(/\D/g, "").length < 10) bad.push("phone");
    if (!/\S+@\S+\.\S+/.test(form.email)) bad.push("email");
    if (!form.city.trim()) bad.push("city");
    if (!form.street.trim()) bad.push("street");
    if (!form.build.trim()) bad.push("build");
    if (form.postindex.trim().length < 5) bad.push("postindex");
    if (!form.terms) bad.push("terms");
    if (!form.data) bad.push("data");
    return bad;
  }

  function review() {
    st.tried = true;
    const bad = missing();
    if (bad.length || !st.deliveryId || !st.paymentId || !st.totals) {
      paintForm(shop.lines());
      root.querySelector(`[data-field="${bad[0]}"]`)?.scrollIntoView({ block: "center", behavior: "smooth" });
      if (!bad.length) toast("Выберите доставку и оплату, дождитесь итога", true);
      return;
    }
    const lines = shop.lines();
    const t = st.totals;
    const box = document.createElement("div");
    box.className = "sheet-form";
    box.innerHTML = `
      <p class="s-warn">Будет создан настоящий заказ в магазине.</p>
      <ul class="ck-items">${lines.map((l) => `<li><span>${esc(l.p?.name ?? l.code)}</span><b>× ${l.qty}</b></li>`).join("")}</ul>
      <p class="s-note"><b>Куда:</b> ${esc([form.city, form.street, form.build && `д. ${form.build}`, form.apartment && `кв. ${form.apartment}`].filter(Boolean).join(", "))}</p>
      <p class="s-note"><b>Доставка:</b> ${esc(active()?.NAME ?? "")} · <b>Оплата:</b> ${esc(payment()?.NAME ?? "")}</p>
      <div class="s-sumrow s-total"><span>Итого</span><b>${esc(rub(num(t.TOTAL_PRICE)))}</b></div>
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
    const body = {
      deliveryId: st.deliveryId,
      paymentId: st.paymentId,
      EMAIL: form.email,
      FIO: form.fio,
      PHONE: form.phone.replace(/[^0-9+]/g, ""),
      PROFILE: { ...profileObj(), MANUAL: 1, ...(form.comment ? { COMMENT: form.comment } : {}) },
      additionalOrderInfo: { orderComment: form.comment, needToContact: false, contactMethod: "", chosenMessenger: "", receiveEmails: false, acceptTerms: form.terms, acceptTerms2: false, agreePersonalData: form.data },
      dutyEnabled: true,
    };
    const r = await sv("/order", {}, { method: "POST", body });
    st.sending = false;
    sheet.close();
    const id = r.json?.result;
    if (!r.ok || !id) return toast(r.json?.error || "Магазин не принял заказ. Проверьте данные.", true);
    st.orderId = String(id);
    shop.refreshCart();
    paintDone();
  }

  /** Страница оплаты магазина открывается по ссылке из API кабинета: у нас нет сессии магазина в браузере. */
  async function openPayPage(btn) {
    const win = window.open("", "_blank");
    btn.disabled = true;
    const r = await api(`${P}/web_views/shop/orders/${st.orderId}`);
    btn.disabled = false;
    const raw = r.json?.data;
    const link = typeof raw === "string" ? raw : pick(raw ?? {}, "url", "link", "href");
    let ok = false;
    try {
      const u = new URL(String(link));
      ok = u.protocol === "https:" && /(^|\.)(coral\.club|coralclub\.[a-z]+)$/i.test(u.hostname);
    } catch {
      ok = false;
    }
    if (!r.ok || !ok) {
      win?.close();
      return toast("Не удалось открыть страницу оплаты. Оплатить можно в разделе «История заказов».", true);
    }
    if (win) win.location.href = link;
    else location.assign(link);
  }

  function paintDone() {
    const pay = payment();
    const online = pay && !CASHLIKE.test(pay.NAME);
    set(`
      <div class="s-emptybox ck-done"><span class="ck-ok" aria-hidden="true">✓</span>
        <h2>Заказ № ${esc(st.orderId)} оформлен</h2>
        <p>${online ? `Способ оплаты: ${esc(pay.NAME)}. Оплатить заказ можно сейчас на странице магазина.` : `Способ оплаты: ${esc(pay?.NAME ?? "")}.`}</p>
        ${online ? `<button class="btn" type="button" data-pay>Оплатить заказ</button>` : ""}
        <a class="btn ghost" href="#/orders">История заказов</a>
        <a class="s-note" href="#/">В магазин</a></div>`);
  }

  /* ---------- события ---------- */
  root.addEventListener("input", (e) => {
    const t = e.target;
    if (!t.name || !(t.name in form)) return;
    form[t.name] = t.type === "checkbox" ? t.checked : t.value;
    t.closest(".ck-f")?.classList.remove("bad");
    t.closest(".ck-check")?.classList.remove("bad");
    if (["fio", "phone", "email", "street", "build", "apartment", "postindex"].includes(t.name)) loadTotals();
  });
  root.addEventListener("change", (e) => {
    const t = e.target;
    if (t.name === "city") {
      form.city = t.value.trim();
      form.area = form.city;
      return void loadDelivery();
    }
    if (t.name === "delivery") {
      st.deliveryId = t.value;
      root.querySelectorAll("#ck-delivery .ck-opt").forEach((l) => l.classList.toggle("on", l.querySelector("input").checked));
      return void loadPayments();
    }
    if (t.name === "payment") {
      st.paymentId = t.value;
      root.querySelectorAll("#ck-pay .ck-opt").forEach((l) => l.classList.toggle("on", l.querySelector("input").checked));
      return void loadTotals();
    }
  });
  root.addEventListener("click", (e) => {
    if (e.target.closest("[data-send]")) return review();
    if (e.target.closest("[data-pay]")) return openPayPage(e.target.closest("[data-pay]"));
  });

  /* ---------- вход на страницу ---------- */
  async function open() {
    const token = ++st.run;
    st.orderId = "";
    st.tried = false;
    st.warn = "";
    const lines = shop.lines();
    if (!lines.length) return set(`<div class="s-emptybox"><p>В корзине пусто</p><a class="btn" href="#/">В магазин</a></div>`);
    if (!shopReady()) {
      return set(`<div class="s-emptybox"><p>Оформление внутри ЛК работает при запуске стенда через <b>npm start</b>: магазин принимает такие запросы только по своей сессии.</p><a class="btn" href="#/cart">Назад в корзину</a></div>`);
    }
    set(skel(5));
    const w = who();
    Object.assign(form, { fio: w.fio ?? "", phone: w.phone ?? "", email: w.email ?? "" });
    const b = await ensureBasket(lines);
    if (token !== st.run) return;
    if (!b.ok) return set(`<div class="s-emptybox"><p>Не удалось подготовить заказ: ${esc(b.error || "магазин не ответил")}.</p><a class="btn ghost" href="#/cart">Назад в корзину</a></div>`);
    // город: из профиля, иначе по определению магазина
    const loc = await shopRequest("/restApi/v4/location/getLocation?language=ru");
    const guess = loc.json && typeof loc.json === "object" ? loc.json : {};
    form.city = w.city || guess.city || "Москва";
    form.area = form.city === guess.city ? guess.area || form.city : form.city;
    const init = await sv("/init");
    window.__shopDebug = { ...(window.__shopDebug ?? {}), init: init.json };
    if (token !== st.run) return;
    st.ready = true;
    paintForm(lines);
    await loadDelivery();
  }

  return { open };
}
