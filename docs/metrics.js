// «Мои показатели»: карусель плиток, справа от цифры мини-график по месяцам.
// Данные: GET /account/metrics (закрытые месяцы) и GET /account/dashboard (текущий месяц).
// Решения по результатам кастдевов (Екатерина, Карина, Новоселов, CX Discovery):
//  - СОП со звёздочкой первым и крупно: единственный показатель, который лидеры смотрят каждый день;
//  - только абсолютные числа в баллах, без процентов, у каждой цифры подпись «относительно чего»
//    (месяц назван словами: «в сентябре: 122,5»), слэшей «154/500» нет;
//  - аббревиатуры расшифрованы, у каждой метрики есть пояснение (кнопка «?»);
//  - для ГО подсказка про долю личного объёма: у Екатерины это рабочий красный флаг.
import { attachHints } from "./hint.js";
import { RANKS } from "./ranks.js";
const MONTHS_NOM = ["январь", "февраль", "март", "апрель", "май", "июнь", "июль", "август", "сентябрь", "октябрь", "ноябрь", "декабрь"];
const MONTHS_PREP = ["январе", "феврале", "марте", "апреле", "мае", "июне", "июле", "августе", "сентябре", "октябре", "ноябре", "декабре"];
const MONTHS_SHORT = ["янв.", "февр.", "март", "апр.", "май", "июнь", "июль", "авг.", "сент.", "окт.", "нояб.", "дек."];
const monthIdx = (iso) => Number(String(iso).slice(5, 7)) - 1;
const asc = (a) => [...(a ?? [])].sort((x, y) => (x.date < y.date ? -1 : 1));
/** Ранг, как его пишет русский кабинет: «jA» → «мА», латинские буквы на русские (A → А, как U+0410 на сайте). */
const CYR = { A: "А", B: "В", C: "С", E: "Е", H: "Н", K: "К", M: "М", O: "О", P: "Р", T: "Т", X: "Х" };
export const rankRu = (r) => (typeof r === "string" && r ? r.replace(/^j/, "м").replace(/[A-Z]/g, (c) => CYR[c] ?? c) : "—");
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const n = (v) => {
  const x = Number(String(v ?? "").replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(x) ? x : null;
};
const fmt = (v) => (v === null ? "—" : v.toLocaleString("ru-RU", { maximumFractionDigits: 1 }));

/** Номер текущего месяца «ГГГГ-ММ»: из дашборда (currentMonth = ГГММ), иначе по часам компьютера. */
function currentKey(dash) {
  const m = String(dash?.currentMonth ?? "");
  if (/^\d{4}$/.test(m)) return `20${m.slice(0, 2)}-${m.slice(2)}`;
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

const INFO = {
  rank: "Ранг, закрытый по итогам последнего закрытого месяца.",
  sop: "СОП* — сетевой объём поколений со звёздочкой: показатель, который лидеры смотрят каждый день. СОП — сетевой объём поколений без звёздочки. Объём в баллах. План берётся из кабинета.",
  group: "ГО — групповой объём: баллы вашей группы за месяц. Личный объём (ЛО) входит в групповой.",
  geo: "Доля СОП по странам: какую часть объёма дала каждая страна в закрытом месяце. «Нет данных» — если за месяц объёма не было.",
};

/** Мини-график справа от цифры: столбики, выделен тот, что соответствует цифре слева (по умолчанию последний). Меньше двух точек не рисуем. */
function chart(points, label, hi = points.length - 1) {
  if (points.length < 2) return "";
  const W = 88;
  const H = 52;
  const gap = 4;
  const bw = (W - gap * (points.length - 1)) / points.length;
  const max = Math.max(...points.map((p) => p.v), 1);
  const bars = points
    .map((p, i) => {
      const h = Math.max(4, (p.v / max) * (H - 2));
      return `<rect class="${i === hi ? "now" : ""}" x="${(i * (bw + gap)).toFixed(1)}" y="${(H - h).toFixed(1)}" width="${bw.toFixed(1)}" height="${h.toFixed(1)}" rx="3"><title>${esc(p.tip)}</title></rect>`;
    })
    .join("");
  return `<svg class="mchart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(label)}">${bars}</svg>`;
}
/** Точки по месяцам: закрытые месяцы и, если есть, текущий по дашборду. */
const monthPoints = (rows, live, cur) => {
  const pts = rows.slice(-5).map((m) => ({ v: n(m.total) ?? 0, tip: `${MONTHS_NOM[monthIdx(m.date)]}: ${fmt(n(m.total))}` }));
  if (live !== null) pts.push({ v: live, tip: `${MONTHS_NOM[monthIdx(cur)]} (идёт): ${fmt(live)}` });
  return pts.slice(-6);
};

function tile(key, title, body, graph = "") {
  return `<article class="mcard" data-k="${key}"><div class="mhead"><h3>${esc(title)}</h3><button class="mi" type="button" aria-label="Что это за показатель" aria-expanded="false" data-hint="${esc(INFO[key])}">?</button></div><div class="mbody"><div class="mval">${body}</div>${graph}</div></article>`;
}

/* ---------- плитки: название, цифра крупно, подпись периода ---------- */
const planPart = (plan) => (plan > 0 ? `, план ${fmt(plan)}` : "");

function tileSop(star, dash, cur, last) {
  const live = n(dash?.volumeQualifyingStar);
  const value = live ?? (star.length ? n(star[star.length - 1].total) : null);
  const when = live !== null ? `в ${MONTHS_PREP[monthIdx(cur)]}${planPart(n(dash?.volumeQualifyingStarPlan))}` : last ? `за ${MONTHS_NOM[monthIdx(last.date)]}` : "";
  return tile("sop", "СОП со звёздочкой", `<p class="mbig">${fmt(value)}</p><p class="msub">${esc(when)}</p>`, chart(monthPoints(star, live, cur), "СОП со звёздочкой по месяцам"));
}

function tileGroup(group, dash, cur, last) {
  const live = n(dash?.volumeGroup);
  const value = live ?? (group.length ? n(group[group.length - 1].total) : null);
  const when = live !== null ? `в ${MONTHS_PREP[monthIdx(cur)]}${planPart(n(dash?.volumeGroupPlan))}` : last ? `за ${MONTHS_NOM[monthIdx(last.date)]}` : "";
  return tile("group", "Групповой объём (ГО)", `<p class="mbig">${fmt(value)}</p><p class="msub">${esc(when)}</p>`, chart(monthPoints(group, live, cur), "Групповой объём по месяцам"));
}

function tileRank(star) {
  const cur = star[star.length - 1];
  // высота столбика — место ранга в таблице условий (ниже директора — самый низкий)
  const level = (m) => RANKS.findIndex((r) => r.codes.includes(m.rank)) + 1;
  const pts = star.slice(-6).map((m) => ({ v: level(m), tip: `${MONTHS_NOM[monthIdx(m.date)]}: ${rankRu(m.fullRank || m.rank)}` }));
  return tile("rank", "Закрытый ранг", `<p class="mbig">${esc(rankRu(cur.fullRank || cur.rank))}</p><p class="msub">за ${esc(MONTHS_NOM[monthIdx(cur.date)])}</p>`, chart(pts, "Закрытый ранг по месяцам"));
}

function tileGeo(geo) {
  const withData = [...geo].reverse().find((m) => Number(m.total) > 0 && (m.countries ?? []).length);
  const m = withData ?? geo[geo.length - 1];
  if (!withData) return tile("geo", "География СОП", `<p class="mbig">н/д</p><p class="msub">нет данных за ${esc(MONTHS_NOM[monthIdx(m.date)])}</p>`);
  const top = [...m.countries].sort((a, b) => Number(b.shared) - Number(a.shared))[0];
  const pts = [...m.countries].sort((a, b) => Number(b.shared) - Number(a.shared)).slice(0, 4).map((c) => ({ v: Number(c.shared) || 0, tip: `${c.country}: ${fmt(Number(c.shared))}%` }));
  return tile("geo", "География СОП", `<p class="mbig">${esc(top.country)} ${fmt(Number(top.shared))}%</p><p class="msub">доля СОП в ${esc(MONTHS_PREP[monthIdx(m.date)])}</p>`, chart(pts, "Доля СОП по странам", 0));
}

/** Рисует карусель плиток; dash (дашборд) и fetchedAt необязательны. */
export function renderMetrics(root, json, dash = null, fetchedAt = new Date()) {
  const d = json?.data ?? json;
  const star = asc(d?.volumeQualifyingStar);
  const qual = asc(d?.volumeQualifying);
  const group = asc(d?.volumeGroup);
  const geo = asc(d?.countries);
  if (!star.length && !group.length) {
    root.innerHTML = `<h2 class="mtitle">МОИ ПОКАЗАТЕЛИ</h2><p class="muted">В ответе нет данных по месяцам.</p>`;
    return;
  }
  const cur = currentKey(dash);
  // закрытые месяцы: всё, что раньше текущего; если таких нет, берём последний доступный
  const closed = (a) => {
    const c = a.filter((m) => m.date < cur);
    return c.length ? c : a;
  };
  const lastOf = (a) => closed(a)[closed(a).length - 1];
  const tiles = [
    star.length && tileSop(closed(star), dash, cur, lastOf(star)),
    group.length && tileGroup(closed(group), dash, cur, lastOf(group)),
    star.length && tileRank(closed(star)),
    geo.length && tileGeo(closed(geo)),
  ].filter(Boolean);
  root.innerHTML = `<div class="mtop"><h2 class="mtitle">МОИ ПОКАЗАТЕЛИ</h2></div><div class="mgrid mcar">${tiles.join("")}</div>`;
  attachHints(root);
}

export function metricsMessage(root, text) {
  root.innerHTML = `<h2 class="mtitle">МОИ ПОКАЗАТЕЛИ</h2><p class="muted">${esc(text)}</p>`;
}
