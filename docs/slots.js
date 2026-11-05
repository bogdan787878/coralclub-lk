// Дни и часы курьера магазина (Москва, Санкт-Петербург). Расписание магазин присылает в /init
// (moscowDeliveryTimes, spbDeliveryTimes), правило то же, что в его чек-ауте и в «Друге клуба»:
//  - три варианта расписания: express (в тот же день), mkad (внутри МКАД) и outside; каждый — 7 дней с понедельника,
//    skip: 1 у дня, в который возят, beforeTime (час, до которого заказ ещё идёт на этот день) и times («10:00-14:00»);
//  - всё по московскому времени; express: сегодня до отсечки, иначе завтра (один день); остальные: со следующего дня
//    (после отсечки с послезавтра), семь дней подряд;
//  - сегодняшние интервалы, которые уже начались, убираются; restricted — даты «дд.ММ.гггг» без доставки.
const WEEKDAYS = ["вс", "пн", "вт", "ср", "чт", "пт", "сб"];
const MONTHS = ["янв.", "февр.", "марта", "апр.", "мая", "июня", "июля", "авг.", "сент.", "окт.", "нояб.", "дек."];
const pad = (n) => String(n).padStart(2, "0");

function moscowNow(at) {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Moscow", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(at);
  const get = (t) => Number(parts.find((p) => p.type === t)?.value);
  return { y: get("year"), m: get("month"), d: get("day"), hour: get("hour"), minute: get("minute") };
}

/** → [{ label: «Завтра, 29 окт.», date: «ггггммдд», times: ["10:00-14:00", …] }] */
export function deliverySlots(times, { express, mkad = true, at = new Date() }) {
  const intervals = times?.[express ? "express" : mkad ? "mkad" : "outside"];
  if (!Array.isArray(intervals)) return [];
  const now = moscowNow(at);
  const today = (new Date(Date.UTC(now.y, now.m - 1, now.d)).getUTCDay() + 6) % 7; // 0 = понедельник
  const before = Number(intervals[today]?.beforeTime);
  const late = Number.isFinite(before) && now.hour >= before;
  const start = express ? (late ? 1 : 0) : late ? 2 : 1;
  const end = express ? start + 1 : start + 7;
  const nowHm = `${pad(now.hour)}:${pad(now.minute)}`;
  const restricted = times?.restricted ?? [];
  const days = [];
  for (let c = start; c < end; c++) {
    const d = (today + c) % 7;
    const day = intervals[d];
    if (Number(day?.skip) !== 1) continue;
    const date = new Date(Date.UTC(now.y, now.m - 1, now.d + c));
    const dd = pad(date.getUTCDate());
    const mm = pad(date.getUTCMonth() + 1);
    const yyyy = date.getUTCFullYear();
    let slots = Array.isArray(day.times) ? day.times : [];
    if (c === 0) slots = slots.filter((s) => s.split("-")[0] > nowHm); // сегодня только интервалы, которые не начались
    if (slots.length === 0 || restricted.includes(`${dd}.${mm}.${yyyy}`)) continue;
    const name = c === 0 ? "Сегодня" : c === 1 ? "Завтра" : WEEKDAYS[date.getUTCDay()];
    days.push({ label: `${name}, ${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]}`, date: `${yyyy}${mm}${dd}`, times: slots });
  }
  return days;
}

const MOSCOW = ["москва", "moscow", "moskva"];
const SPB = ["санкт-петербург", "saint petersburg", "saint-petersburg", "st petersburg", "st. petersburg", "sankt-peterburg"];

/** Какое расписание курьера относится к городу и службе доставки. */
export function slotRegion(city, serviceId) {
  const c = String(city).trim().toLowerCase();
  if (MOSCOW.includes(c) && ["I_COURIER_BALANCE", "I_M_RUNNER", "I_COURIER_1DAY"].includes(serviceId)) return "moscow";
  if (SPB.includes(c) && serviceId === "I_SPB_RUNNER") return "spb";
  return null;
}
export const isMoscow = (city) => MOSCOW.includes(String(city).trim().toLowerCase());
