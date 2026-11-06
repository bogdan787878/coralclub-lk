// Общие микрофронтенды продукта в кабинете: Layout (<cc-layout>: нижнее меню с бейджем корзины) и приложение корзины
// (<cc-cart>: отдельная страница корзины). Оба из coral-club-shop (пакеты @coral/layout и @coral/cart), подключаются по адресу. Работает в прямом режиме (токен в sessionStorage, как на GitHub Pages);
// на стенде со своей серверной сессией Layout токена не видит, там остаётся собственное меню кабинета.
const devSrc = () => {
  try {
    return /^(localhost|127\.0\.0\.1)$/.test(location.hostname) ? sessionStorage.getItem("lk_layout_src") : null; // только для разработки
  } catch {
    return null;
  }
};
const BASE = location.hostname.endsWith("github.io") ? "/coralclub" : "https://bogdan787878.github.io/coralclub";
const SRC = devSrc() ?? `${BASE}/layout/layout.js`;
const CART_SRC = (devSrc() ?? "").replace(/layout\/layout\.js$/, "cart/cart.js") || `${BASE}/cart/cart.js`;
// «Главная» — главная участника в интерфейсе «Друга клуба» (страница магазина /coralclub/lk/), остальное — разделы кабинета
const LINKS = { home: `${BASE}/lk/`, catalog: "#/catalog", cart: "#/cart", fav: "#/fav", me: `${BASE}/lk/me/` }; // профиль перенесён в кабинет на Next
const CART_LINKS = { checkout: "#/checkout", shop: "#/catalog", login: "./" };

let el = null;
let failed = false;

/** Layout на странице или null, если он не нужен (стенд) или не загрузился. onCartChanged: корзину поменяли в Layout. */
export function ensureLayout({ enabled, onCartChanged }) {
  if (failed || !enabled()) return null;
  if (el) return el;
  el = document.createElement("cc-layout");
  el.setAttribute("parts", "tabbar");
  el.setAttribute("links", JSON.stringify(LINKS));
  document.body.appendChild(el);
  const s = document.createElement("script");
  s.src = SRC;
  s.defer = true;
  s.onerror = () => {
    failed = true;
    el.remove();
    el = null;
    window.dispatchEvent(new HashChangeEvent("hashchange")); // перерисовать с собственным меню
  };
  document.head.appendChild(s);
  window.addEventListener("cc:cart:changed", () => onCartChanged());
  return el;
}

let cartEl = null;
/** Приложение корзины в контейнере страницы корзины (один раз; cart.js грузится по адресу). */
export function mountCartApp(box) {
  if (cartEl) return cartEl;
  cartEl = document.createElement("cc-cart");
  cartEl.setAttribute("links", JSON.stringify(CART_LINKS));
  box.appendChild(cartEl);
  const s = document.createElement("script");
  s.src = CART_SRC;
  s.defer = true;
  document.head.appendChild(s);
  return cartEl;
}

/** Кабинет сам изменил корзину (добавил товар и т. п.): пусть Layout перечитает её. */
export const cartChangedHere = () => window.dispatchEvent(new Event("cc:cart:refresh"));
