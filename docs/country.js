// Страна заказа: одна на весь магазин, флаг в хедере (кроме профиля). Магазин считает доставку и оплату по стране,
// поэтому это выбор страницы, а не поле формы. Как в «Друге клуба» (CountryMenu): флаг открывает список со строкой поиска.
const KEY = "lk_country";
const LIST_KEY = "lk_countries";
const DEFAULT = "RU";

const listeners = new Set();
const emit = () => listeners.forEach((l) => l());
const read = (key) => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};
const write = (key, value) => {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* хранилище закрыто: выбор живёт до перезагрузки */
  }
};

let country = /^[A-Z]{2}$/.test(read(KEY) ?? "") ? read(KEY) : DEFAULT;
let countries = (() => {
  try {
    const v = JSON.parse(read(LIST_KEY) ?? "null");
    if (v && typeof v === "object" && Object.keys(v).length) return v;
  } catch {
    /* повреждено: только Россия */
  }
  return { RU: "Россия" };
})();

/** «FR» → 🇫🇷 */
export const flag = (code) => [...String(code).toUpperCase()].map((c) => String.fromCodePoint(127397 + c.charCodeAt(0))).join("");
export const getCountry = () => country;
export const getCountries = () => countries;
export const countryName = (code = country) => countries[code] ?? code;

export function setCountry(code) {
  if (!code || code === country) return;
  country = code;
  write(KEY, code);
  emit();
}
/** Список стран, который прислал магазин в чек-ауте. */
export function rememberCountries(list) {
  if (!list || typeof list !== "object" || !Object.keys(list).length) return;
  if (JSON.stringify(list) === JSON.stringify(countries)) return;
  countries = list;
  write(LIST_KEY, JSON.stringify(list));
  if (!countries[country]) country = DEFAULT;
  emit();
}

/** Страница, которой при смене страны есть что пересчитывать (чек-аут), перехватывает выбор; иначе он просто запоминается. */
let handler = null;
export function onCountryRequest(fn) {
  handler = fn;
  return () => {
    if (handler === fn) handler = null;
  };
}
export const requestCountry = (code) => (handler ? handler(code) : setCountry(code));
export const onCountryChange = (fn) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

/** Рисует флаг-кнопку в host и список стран по клику. Перерисовывается при смене страны. */
export function mountCountryMenu(host) {
  let open = false;
  let query = "";
  const paint = () => {
    const entries = Object.entries(countries).sort((a, b) => a[1].localeCompare(b[1], "ru"));
    const q = query.trim().toLowerCase();
    const shown = q
      ? entries.filter(([, n]) => n.toLowerCase().includes(q)).sort((a, b) => Number(b[1].toLowerCase().startsWith(q)) - Number(a[1].toLowerCase().startsWith(q)))
      : entries;
    host.innerHTML = `
      <div class="cm-root">
        <button class="cm-flagBtn" type="button" aria-haspopup="listbox" aria-expanded="${open}" aria-label="Страна: ${esc(countryName())}. Сменить страну">${flag(country)}</button>
        ${
          open
            ? `<div class="cm-panel">
          ${entries.length > 8 ? `<input class="cm-search" type="search" placeholder="Найти страну" aria-label="Найти страну" value="${esc(query)}" />` : ""}
          ${
            shown.length
              ? `<ul class="cm-list" role="listbox" aria-label="Страны">${shown.map(([c, n]) => `<li role="option" aria-selected="${c === country}"><button type="button" class="cm-option${c === country ? " cm-optionOn" : ""}" data-code="${c}"><span class="cm-optionFlag" aria-hidden="true">${flag(c)}</span>${esc(n)}</button></li>`).join("")}</ul>`
              : `<p class="cm-empty">Ничего не найдено.</p>`
          }</div>`
            : ""
        }
      </div>`;
    if (open) host.querySelector(".cm-search")?.focus();
  };
  host.addEventListener("click", (e) => {
    const opt = e.target.closest("[data-code]");
    if (opt) {
      open = false;
      query = "";
      paint();
      return requestCountry(opt.dataset.code);
    }
    if (e.target.closest(".cm-flagBtn")) {
      open = !open;
      paint();
    }
  });
  host.addEventListener("input", (e) => {
    if (e.target.matches(".cm-search")) {
      query = e.target.value;
      const pos = e.target.selectionStart;
      paint();
      const el = host.querySelector(".cm-search");
      el?.setSelectionRange(pos, pos);
    }
  });
  document.addEventListener("pointerdown", (e) => {
    if (open && !host.contains(e.target)) {
      open = false;
      paint();
    }
  });
  document.addEventListener("keydown", (e) => {
    if (open && e.key === "Escape") {
      open = false;
      paint();
    }
  });
  onCountryChange(paint);
  paint();
}
