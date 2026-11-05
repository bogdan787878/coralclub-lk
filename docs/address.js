// Поиск адреса Google Places («Autocomplete» нового Places API) и разбор адреса для формы, как в «Друге клуба».
// Ключ браузерный, с ограничением по HTTP-референту в консоли Google, и в репозиторий не кладётся: стенд (npm start)
// отдаёт его из GOOGLE_PLACES_KEY / .env.local через /lk/config. Без ключа поле адреса работает как обычное.
// Наружу уходят только набранный адрес и сессионный токен Google, и только после нескольких набранных символов.

let KEY = "";
export const setPlacesKey = (k) => {
  KEY = typeof k === "string" ? k : "";
};
export const addressSearchEnabled = () => KEY !== "";

const NUMBER_FIRST = new Set(["US", "CA", "GB", "IE", "AU", "NZ"]);
const PLACES_LANG = { RU: "ru", BY: "ru", KZ: "ru", UZ: "ru", AM: "ru", GE: "ru", UA: "uk" };

let lib = null;
function load() {
  lib ??= new Promise((resolve, reject) => {
    const done = async () => {
      try {
        resolve(await window.google.maps.importLibrary("places"));
      } catch (e) {
        lib = null;
        reject(e);
      }
    };
    if (window.google?.maps?.importLibrary) return void done();
    window.__placesReady = () => void done();
    const el = document.createElement("script");
    el.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(KEY)}&loading=async&v=weekly&callback=__placesReady`;
    el.async = true;
    el.onerror = () => {
      lib = null;
      reject(new Error("Не загрузился скрипт Google Maps"));
    };
    document.head.appendChild(el);
  });
  return lib;
}

/** Одна сессия набора = один токен: Google считает сессию, а не каждую букву. */
export async function newSession() {
  const { AutocompleteSessionToken } = await load();
  return new AutocompleteSessionToken();
}

/** Пока нет цифры, предлагаем улицы; с номером дома — адреса целиком. */
export async function suggestAddresses(input, session, country = "RU") {
  const streets = !/\d/.test(input);
  const { AutocompleteSuggestion } = await load();
  const { suggestions } = await AutocompleteSuggestion.fetchAutocompleteSuggestions({
    input,
    sessionToken: session,
    includedRegionCodes: [country.toLowerCase()],
    language: PLACES_LANG[country] ?? "en",
    // улица без номера не имеет индекса и недоставляема: это лишь шаг к адресу с номером
    includedPrimaryTypes: streets ? ["route"] : ["street_address", "premise", "subpremise"],
  });
  return suggestions
    .map((s) => s.placePrediction)
    .filter(Boolean)
    .slice(0, 6)
    .map((p) => ({ main: p.mainText?.text ?? p.text.text, secondary: p.secondaryText?.text ?? "", street: streets, ref: p }));
}

/** Выбранная улица → название и город, чтобы дописать номер дома. */
export async function resolveStreet(s) {
  const place = s.ref.toPlace();
  await place.fetchFields({ fields: ["addressComponents"] });
  const comps = place.addressComponents ?? [];
  const get = (type) => comps.find((x) => x.types.includes(type))?.longText ?? "";
  return { route: get("route") || s.main, city: get("locality") || get("postal_town") || get("sublocality_level_1") };
}

/** Компоненты адреса Google → поля формы. */
function fromComponents(comps, fallbackStreet = "") {
  const get = (type) => comps.find((x) => x.types.includes(type))?.long ?? "";
  const number = get("street_number").replace(/(\d)\s+(\d)/g, "$1-$2"); // диапазон «5 7» пишем «5-7»
  const route = get("route");
  return {
    street: route || fallbackStreet,
    houseNumber: route ? number : "",
    unit: get("subpremise"),
    city: get("locality") || get("postal_town") || get("sublocality_level_1") || get("sublocality") || get("neighborhood"),
    state: get("administrative_area_level_1"),
    zip: get("postal_code"),
  };
}

export async function resolveAddress(s) {
  const place = s.ref.toPlace();
  await place.fetchFields({ fields: ["addressComponents"] });
  const comps = (place.addressComponents ?? []).map((c) => ({ long: c.longText, short: c.shortText, types: c.types }));
  return fromComponents(comps, s.main);
}

/** «Баумана» + «12» → строка так, как её пишет страна. */
export const streetLine = (country, street, number) => (NUMBER_FIRST.has(country) ? [number, street] : [street, number]).filter(Boolean).join(" ");

/** Строка «улица и дом» → два поля магазина: «Баумана 12» → улица + «12», «10 Downing Street» по ведущему числу. */
export function splitStreet(line) {
  const text = line.trim().replace(/\s+/g, " ");
  const tail = text.match(/^(.+?),?\s+(\d+(?:\s?[a-zA-Zа-яА-Я])?(?:\s?[-–/]\s?\d+(?:\s?[a-zA-Zа-яА-Я])?)?)$/);
  if (tail) return { street: tail[1], build: tail[2] };
  const head = text.match(/^(\d+(?:\s?[a-zA-Z])?(?:\s?[-–/]\s?\d+[a-zA-Z]?)?),?\s+(.+)$/);
  if (head) return { street: head[2], build: head[1] };
  return { street: text, build: "" };
}
