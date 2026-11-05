// Общий Layout продукта (<cc-layout>: нижнее меню и корзина) в кабинете. Это отдельный сервис из coral-club-shop
// (пакет @coral/layout), он подключается по адресу. Работает в прямом режиме (токен в sessionStorage, как на GitHub Pages);
// на стенде со своей серверной сессией Layout токена не видит, там остаётся собственное меню кабинета.
const devSrc = () => {
  try {
    return /^(localhost|127\.0\.0\.1)$/.test(location.hostname) ? sessionStorage.getItem("lk_layout_src") : null; // только для разработки
  } catch {
    return null;
  }
};
const SRC = devSrc() ?? (location.hostname.endsWith("github.io") ? "/coralclub/layout/layout.js" : "https://bogdan787878.github.io/coralclub/layout/layout.js");
const LINKS = { home: "#/", catalog: "#/catalog", fav: "#/fav", me: "#/me", checkout: "#/checkout", login: "./" };

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

/** Кабинет сам изменил корзину (добавил товар и т. п.): пусть Layout перечитает её. */
export const cartChangedHere = () => window.dispatchEvent(new Event("cc:cart:refresh"));
export const openLayoutCart = () => customElements.whenDefined("cc-layout").then(() => window.coralLayout?.cart.open());
