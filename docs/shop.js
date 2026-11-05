// Магазин внутри ЛК: главная с продуктами гидратации, каталог, корзина, избранное.
// Данные только из API кабинета (CC4): каталог, корзина (GET/POST/DELETE /basket), ссылка на оформление.
// Заказ не создаётся из этого файла: «Оформить» открывает страницу оформления магазина (web_views/checkout_new).
// Структуры ответов в описании API не заданы, поэтому поля читаются осторожно (см. normalize) и сырой ответ
// можно посмотреть в консоли: window.__shopDebug.

/** Продукты первой фазы «Гидратация». Артикулы российского магазина; фото и подписи — запасные, если API их не отдал. */
const HYDRATION = [
  { code: 80720, slug: "hydramax-plus", name: "Hydramax Plus", note: "Набор", set: true },
  { code: 80380, slug: "hydramax", name: "Hydramax", note: "Набор", set: true },
  { code: 2220, slug: "coral-mine-silver", name: "Coral-Mine Silver", note: "" },
  { code: 91883, slug: "h-500", name: "H-500", note: "Калий и магний, 120 капсул" },
];
const FALLBACK = new Map(HYDRATION.map((p) => [p.code, p]));
const CATALOG_TABS = [
  { id: "hydration", label: "Гидратация" },
  { id: "hit", label: "Хиты" },
  { id: "new", label: "Новинки" },
  { id: "sale", label: "Распродажа" },
];

const IC = {
  heart: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20.5s-7.5-4.6-9.2-9.4C1.6 7.700 3.700 4.500 7 4.500c2 0 3.400 1 5 3 1.600-2 3-3 5-3 3.300 0 5.400 3.200 4.200 6.600-1.700 4.800-9.200 9.400-9.200 9.400z"/></svg>`,
  plus: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>`,
  minus: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M5 12h14"/></svg>`,
  trash: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 12h10l1-12M9 7V4h6v3"/></svg>`,
  check: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.500l4.500 4.500L19 7.500"/></svg>`,
  bag: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 4h2.500l2.300 10.500h10.400L20.500 7H6.200"/><circle cx="9" cy="19" r="1.400"/><circle cx="17" cy="19" r="1.400"/></svg>`,
};

const FAV_KEY = "lk_fav";
const readFav = () => {
  try {
    const v = JSON.parse(localStorage.getItem(FAV_KEY) ?? "[]");
    return new Set(Array.isArray(v) ? v.map(Number) : []);
  } catch {
    return new Set();
  }
};
const writeFav = (set) => {
  try {
    localStorage.setItem(FAV_KEY, JSON.stringify([...set]));
  } catch {
    /* без хранилища избранное живёт до перезагрузки */
  }
};

/* ---------- разбор ответов API ---------- */
const at = (o, path) => path.split(".").reduce((a, k) => (a == null ? undefined : a[k]), o);
const pick = (o, ...paths) => paths.map((p) => at(o, p)).find((v) => v !== undefined && v !== null && v !== "");
const toNum = (v) => {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v !== "string") return null;
  const x = Number(v.replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(x) ? x : null;
};
/** Список из ответа: массив, либо массив в одном из типичных полей, либо объект «код → запись». */
function listOf(json) {
  const d = json?.data ?? json;
  if (Array.isArray(d)) return d;
  for (const k of ["items", "products", "list", "result", "data"]) if (Array.isArray(d?.[k])) return d[k];
  if (d && typeof d === "object") {
    const v = Object.values(d);
    if (v.length && v.every((x) => x && typeof x === "object")) return v;
  }
  return [];
}
const stripTags = (s) => String(s ?? "").replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();

function normalize(raw) {
  const code = toNum(pick(raw, "code", "productCode", "article", "id"));
  if (code === null) return null;
  const fb = FALLBACK.get(code);
  const club = toNum(pick(raw, "priceClub", "clubPrice", "price.club", "price.member", "price", "cost", "price.value", "prices.club"));
  const regular = toNum(pick(raw, "priceRegular", "regularPrice", "oldPrice", "price.regular", "price.old", "priceOld", "prices.regular"));
  const img = pick(raw, "image", "picture", "img", "preview", "previewImage", "photo", "images.0.url", "images.0.src", "images.0", "photos.0.url", "photos.0.src", "photos.0");
  return {
    code,
    name: String(pick(raw, "name", "title", "productName") ?? fb?.name ?? `Артикул ${code}`),
    note: stripTags(pick(raw, "shortDescription", "subtitle", "form", "releaseForm") ?? fb?.note ?? ""),
    description: stripTags(pick(raw, "description", "fullDescription", "text", "detailText") ?? ""),
    price: club,
    old: regular !== null && club !== null && regular > club ? regular : null,
    bonus: toNum(pick(raw, "bonus", "points", "pv", "volume")),
    image: typeof img === "string" && /^(https?:)?\/\//.test(img) ? img : fb ? `img/shop/${fb.slug}.webp` : "",
    available: pick(raw, "available", "inStock", "isAvailable") !== false,
    set: Boolean(fb?.set),
  };
}

/** Корзина: массив записей или объект «код → количество»; возвращает Map(код → количество). */
function parseCart(json) {
  const d = json?.data ?? json;
  const out = new Map();
  const put = (code, q) => {
    const c = toNum(code);
    const n = toNum(q);
    if (c !== null && n && n > 0) out.set(c, (out.get(c) ?? 0) + n);
  };
  const rows = listOf(json);
  if (rows.length) {
    for (const r of rows) put(pick(r, "code", "productCode", "productId", "article", "id"), pick(r, "quantity", "qty", "count", "amount"));
  } else if (d && typeof d === "object") {
    for (const [k, v] of Object.entries(d)) if (typeof v !== "object") put(k, v);
  }
  return out;
}

export function createShop(root, { api, P, memberId, money, esc, sheet, onCount }) {
  const products = new Map(); // код → продукт
  let cart = new Map(); // код → количество
  let cartLoaded = false;
  const fav = readFav();
  const state = { tab: "shop", chip: "hydration", lists: {}, token: 0 };

  // то, чего API не вернул, показываем запасными данными, но в кэш не кладём: при следующем заходе спросим снова
  const getP = (c) => products.get(c) ?? (FALLBACK.has(c) ? { ...normalize({ code: c }), unlisted: true } : undefined);
  const price = (n) => (n === null ? "" : money(n, "RUB"));
  const problem = (r) => (r.status === 0 ? "нет связи с сервером" : r.status === 401 ? "нужно войти заново" : `ошибка ${r.status}`);
  const count = () => [...cart.values()].reduce((a, b) => a + b, 0);

  /* ---------- уведомление ---------- */
  let toastTimer;
  function toast(text, bad = false) {
    let t = document.querySelector(".s-toast");
    if (!t) {
      t = document.createElement("div");
      t.className = "s-toast";
      t.setAttribute("role", "status");
      document.body.append(t);
    }
    t.textContent = text;
    t.classList.toggle("bad", bad);
    t.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove("show"), 2600);
  }

  /* ---------- данные ---------- */
  async function fetchProducts(codes) {
    const need = codes.filter((c) => !products.has(c));
    if (!need.length) return { ok: true };
    const qs = need.map((c) => `products[]=${encodeURIComponent(c)}`).join("&");
    const r = await api(`${P}/catalog/products?${qs}`);
    window.__shopDebug = { ...(window.__shopDebug ?? {}), catalog: r.json };
    if (r.ok) for (const raw of listOf(r.json)) {
      const p = normalize(raw);
      if (p) products.set(p.code, p);
    }
    return r;
  }

  async function refreshCart() {
    const r = await api(`${P}/basket/quantities`);
    window.__shopDebug = { ...(window.__shopDebug ?? {}), basket: r.json };
    if (r.ok) {
      cart = parseCart(r.json);
      cartLoaded = true;
    }
    onCount?.(count());
    return r;
  }

  async function addToCart(code, btn) {
    btn && (btn.disabled = true);
    const r = await api(`${P}/basket`, { method: "POST", body: { code, quantity: 1, memberId: memberId() } });
    btn && (btn.disabled = false);
    if (!r.ok) return toast(`Не удалось добавить: ${problem(r)}`, true);
    await refreshCart();
    toast("Добавлено в корзину");
    if (btn) {
      btn.classList.add("done");
      btn.innerHTML = IC.check;
      setTimeout(() => {
        btn.classList.remove("done");
        btn.innerHTML = IC.plus;
      }, 1200);
    }
  }

  async function changeQty(code, delta) {
    const q = cart.get(code) ?? 0;
    const r =
      delta > 0
        ? await api(`${P}/basket`, { method: "POST", body: { code, quantity: 1, memberId: memberId() } })
        : q <= 1
          ? await api(`${P}/basket/${code}/${memberId()}`, { method: "DELETE" })
          : await api(`${P}/basket/decrease`, { method: "POST", body: { code, quantity: 1, memberId: memberId() } });
    if (!r.ok) return toast(`Не получилось изменить корзину: ${problem(r)}`, true);
    await refreshCart();
    if (state.tab === "cart") renderCart();
  }

  async function removeItem(code) {
    const r = await api(`${P}/basket/${code}/${memberId()}`, { method: "DELETE" });
    if (!r.ok) return toast(`Не удалось удалить: ${problem(r)}`, true);
    await refreshCart();
    renderCart();
  }

  /** Оформление на странице магазина: ссылка приходит от API и содержит доступ, поэтому её не показываем и не логируем. */
  async function checkout(btn) {
    const win = window.open("", "_blank"); // открываем сразу, пока жест пользователя не потерян (iOS блокирует отложенные окна)
    btn.disabled = true;
    const r = await api(`${P}/web_views/checkout_new`);
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
      return toast(r.ok ? "API вернул неожиданную ссылку на оформление" : `Оформление недоступно: ${problem(r)}`, true);
    }
    if (win) win.location.href = link;
    else location.assign(link);
  }

  /* ---------- отрисовка ---------- */
  const skeleton = (n = 4) => `<div class="s-grid" role="status" aria-label="Загрузка">${Array.from({ length: n }, () => `<div class="s-card"><i class="sk s-img-sk"></i><div class="s-info"><i class="sk" style="height:14px;width:80%"></i><i class="sk" style="height:12px;width:50%"></i></div></div>`).join("")}</div>`;

  const card = (p) => `
    <article class="s-card" data-code="${p.code}">
      <button class="s-img" type="button" data-open aria-label="${esc(p.name)}: подробнее">${p.image ? `<img src="${esc(p.image)}" alt="" loading="lazy" decoding="async" />` : IC.bag}</button>
      <button class="s-fav${fav.has(p.code) ? " on" : ""}" type="button" data-fav aria-label="В избранное" aria-pressed="${fav.has(p.code)}">${IC.heart}</button>
      <div class="s-info">
        <h3>${esc(p.name)}</h3>
        ${p.note ? `<p class="s-note">${esc(p.note)}</p>` : ""}
        <div class="s-buy">
          <div class="s-price">${p.price !== null ? `<b>${esc(price(p.price))}</b>${p.old ? `<s>${esc(price(p.old))}</s>` : ""}` : `<span class="s-note">Цена в корзине</span>`}</div>
          <button class="s-add" type="button" data-add aria-label="Добавить в корзину"${p.available ? "" : " disabled"}>${IC.plus}</button>
        </div>
      </div>
    </article>`;

  const set = (html) => {
    root.innerHTML = html;
  };

  async function renderHome() {
    const token = ++state.token;
    set(`<section class="s-hero"><p class="s-eyebrow">Магазин</p><h1>Гидратация</h1><p>Продукты для питьевого режима и минерального баланса.</p></section>${skeleton(4)}`);
    const r = await fetchProducts(HYDRATION.map((p) => p.code));
    if (token !== state.token) return;
    const list = HYDRATION.map((h) => getP(h.code)).filter(Boolean);
    const sets = list.filter((p) => p.set);
    const rest = list.filter((p) => !p.set);
    set(`
      <section class="s-hero"><p class="s-eyebrow">Магазин</p><h1>Гидратация</h1><p>Продукты для питьевого режима и минерального баланса.</p></section>
      ${r.ok ? "" : `<p class="s-warn">Каталог не ответил (${esc(problem(r))}), показаны данные по умолчанию.</p>`}
      ${sets.length ? `<h2 class="s-h">Наборы</h2><div class="s-car">${sets.map(card).join("")}</div>` : ""}
      ${rest.length ? `<h2 class="s-h">Добавки</h2><div class="s-grid">${rest.map(card).join("")}</div>` : ""}`);
  }

  async function renderCatalog() {
    const token = ++state.token;
    const chips = `<div class="s-chips" role="tablist">${CATALOG_TABS.map((t) => `<button class="s-chip${t.id === state.chip ? " on" : ""}" type="button" role="tab" data-chip="${t.id}" aria-selected="${t.id === state.chip}">${t.label}</button>`).join("")}</div>`;
    set(`<h1 class="s-title">Каталог</h1>${chips}${skeleton(4)}`);
    let list;
    let err = "";
    if (state.chip === "hydration") {
      const r = await fetchProducts(HYDRATION.map((p) => p.code));
      if (!r.ok) err = problem(r);
      list = HYDRATION.map((h) => getP(h.code)).filter(Boolean);
    } else if (state.lists[state.chip]) {
      list = state.lists[state.chip];
    } else {
      const r = await api(`${P}/personal-new/shop?type=${state.chip}`);
      window.__shopDebug = { ...(window.__shopDebug ?? {}), [state.chip]: r.json };
      if (!r.ok) err = problem(r);
      list = listOf(r.json).map(normalize).filter(Boolean);
      for (const p of list) products.set(p.code, p);
      if (r.ok) state.lists[state.chip] = list;
    }
    if (token !== state.token) return;
    set(`<h1 class="s-title">Каталог</h1>${chips}${err ? `<p class="s-warn">Не удалось загрузить: ${esc(err)}.</p>` : ""}${list.length ? `<div class="s-grid">${list.map(card).join("")}</div>` : err ? "" : `<p class="s-empty">В этом разделе пока ничего нет.</p>`}`);
  }

  async function renderCart() {
    const token = ++state.token;
    set(`<h1 class="s-title">Корзина</h1>${skeleton(2)}`);
    const r = await refreshCart();
    if (token !== state.token) return;
    if (!r.ok) return set(`<h1 class="s-title">Корзина</h1><p class="s-warn">Не удалось получить корзину: ${esc(problem(r))}.</p>`);
    if (!cart.size) {
      return set(`<h1 class="s-title">Корзина</h1><div class="s-emptybox"><span aria-hidden="true">${IC.bag}</span><p>Корзина пуста</p><a class="btn" href="#/">В магазин</a></div>`);
    }
    await fetchProducts([...cart.keys()]);
    if (token !== state.token) return;
    const rows = [...cart].map(([code, qty]) => {
      const p = getP(code) ?? { code, name: `Артикул ${code}`, price: null, image: "" };
      return { p, qty };
    });
    const known = rows.every((x) => x.p.price !== null);
    const total = rows.reduce((a, x) => a + (x.p.price ?? 0) * x.qty, 0);
    set(`
      <h1 class="s-title">Корзина</h1>
      <ul class="s-lines">${rows
        .map(
          ({ p, qty }) => `
        <li class="s-line" data-code="${p.code}">
          <span class="s-lthumb">${p.image ? `<img src="${esc(p.image)}" alt="" loading="lazy" />` : IC.bag}</span>
          <div class="s-lmain"><h3>${esc(p.name)}</h3><p class="s-note">${p.price !== null ? esc(price(p.price)) : "Цена при оформлении"}</p>
            <div class="s-step"><button type="button" data-dec aria-label="Меньше">${qty > 1 ? IC.minus : IC.trash}</button><b>${qty}</b><button type="button" data-inc aria-label="Больше">${IC.plus}</button></div>
          </div>
          <button class="s-del" type="button" data-del aria-label="Удалить из корзины">${IC.trash}</button>
        </li>`,
        )
        .join("")}</ul>
      <section class="s-sum">
        <div class="s-sumrow"><span>Товаров</span><b>${count()}</b></div>
        ${known ? `<div class="s-sumrow s-total"><span>Итого</span><b>${esc(price(total))}</b></div>` : ""}
        <button class="btn s-go" type="button" data-go>Оформить заказ</button>
        <p class="s-note">Доставка, оплата и промокод выбираются на странице оформления магазина. Заказ создаётся там, после вашего подтверждения.</p>
      </section>`);
  }

  async function renderFav() {
    const token = ++state.token;
    const codes = [...fav];
    if (!codes.length) return set(`<h1 class="s-title">Избранное</h1><div class="s-emptybox"><span aria-hidden="true">${IC.heart}</span><p>Здесь появятся товары, которые вы отметили сердечком</p><a class="btn" href="#/">В магазин</a></div>`);
    set(`<h1 class="s-title">Избранное</h1>${skeleton(Math.min(codes.length, 4))}`);
    const r = await fetchProducts(codes);
    if (token !== state.token) return;
    const list = codes.map((c) => getP(c)).filter(Boolean);
    set(`<h1 class="s-title">Избранное</h1>${r.ok ? "" : `<p class="s-warn">Каталог не ответил (${esc(problem(r))}).</p>`}${list.length ? `<div class="s-grid">${list.map(card).join("")}</div>` : `<p class="s-empty">Не нашли эти товары в каталоге.</p>`}`);
  }

  function openProduct(code) {
    const p = getP(code);
    if (!p) return;
    const box = document.createElement("div");
    box.className = "sheet-form s-pdp";
    box.innerHTML = `
      ${p.image ? `<div class="s-pdpimg"><img src="${esc(p.image)}" alt="${esc(p.name)}" /></div>` : ""}
      <div class="s-pdprow"><div>${p.note ? `<p class="s-note">${esc(p.note)}</p>` : ""}</div>
        <div class="s-price">${p.price !== null ? `<b>${esc(price(p.price))}</b>${p.old ? `<s>${esc(price(p.old))}</s>` : ""}` : ""}</div></div>
      ${p.bonus ? `<p class="s-note">Баллы: ${esc(p.bonus)}</p>` : ""}
      ${p.description ? `<p class="s-desc">${esc(p.description.slice(0, 600))}</p>` : ""}
      <div class="row2"><button class="btn ghost s-pfav" type="button">${fav.has(code) ? "В избранном" : "В избранное"}</button><button class="btn s-padd" type="button"${p.available ? "" : " disabled"}>${p.available ? "В корзину" : "Нет в наличии"}</button></div>`;
    box.querySelector(".s-pfav").onclick = (e) => {
      toggleFav(code);
      e.currentTarget.textContent = fav.has(code) ? "В избранном" : "В избранное";
    };
    box.querySelector(".s-padd").onclick = async (e) => {
      await addToCart(code, null);
      e.currentTarget.textContent = "Добавлено";
    };
    sheet.open(p.name, box);
  }

  function toggleFav(code) {
    fav.has(code) ? fav.delete(code) : fav.add(code);
    writeFav(fav);
    root.querySelectorAll(`.s-card[data-code="${code}"] .s-fav`).forEach((b) => {
      b.classList.toggle("on", fav.has(code));
      b.setAttribute("aria-pressed", String(fav.has(code)));
    });
    if (state.tab === "fav" && !fav.has(code)) renderFav();
  }

  /* ---------- события ---------- */
  root.addEventListener("click", (e) => {
    const t = e.target;
    const cardEl = t.closest(".s-card");
    const lineEl = t.closest(".s-line");
    if (t.closest("[data-chip]")) {
      state.chip = t.closest("[data-chip]").dataset.chip;
      return renderCatalog();
    }
    if (cardEl) {
      const code = Number(cardEl.dataset.code);
      if (t.closest("[data-fav]")) return toggleFav(code);
      if (t.closest("[data-add]")) return addToCart(code, t.closest("[data-add]"));
      if (t.closest("[data-open]") || t.closest("h3")) return openProduct(code);
    }
    if (lineEl) {
      const code = Number(lineEl.dataset.code);
      if (t.closest("[data-inc]")) return changeQty(code, 1);
      if (t.closest("[data-dec]")) return changeQty(code, -1);
      if (t.closest("[data-del]")) return removeItem(code);
    }
    if (t.closest("[data-go]")) return checkout(t.closest("[data-go]"));
  });

  function show(tab) {
    state.tab = tab;
    ({ shop: renderHome, catalog: renderCatalog, cart: renderCart, fav: renderFav })[tab]?.();
  }

  return { show, refreshCart, count, loaded: () => cartLoaded };
}
