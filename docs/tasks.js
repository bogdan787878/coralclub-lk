// «Задачи» на главной: цифры считаются из двух отчётов кабинета.
//  - отчёт по структуре (PRep): флаг isNewMember, имена, линии;
//  - отчёт по контактам: ранги, дни рождения, срок кандидата после регистрации (registrationDays из registrationDaysLimit).
// Правила взяты из БТ (задачи З-01, З-05, З-07, З-10). Брошенные корзины в API числом не отдаются, поэтому их здесь нет.
import { RANKS } from "./ranks.js";
import { rankRu } from "./metrics.js";

/** Номер линии: в отчётах «1», «2» или «.1», «.2»; 0 — сам участник. */
const lvl = (m) => Number(String(m?.level ?? "").replace(/^\./, ""));
const DIRECTOR_CODES = new Set(["D", "SD", "GD", "ED", "DD", "DD+", "E", "SE", "SE1", "GE", "GE1", "PE", "PE1", "PE2", "PE3", "2SE", "StE"]);
const WARN_DAYS = 7; // «уходящий»: на первый заказ у кандидата осталось не больше недели

export const rankName = (code) => RANKS.find((r) => r.codes.includes(code))?.name ?? rankRu(code);
export const personName = (m) => {
  const raw = m.fullName || [m.surname, m.name].filter(Boolean).join(" ");
  return raw && raw === raw.toUpperCase() ? raw.toLowerCase().replace(/(^|[\s-])(\S)/g, (_, a, b) => a + b.toUpperCase()) : raw || "Участник";
};
export const lineLabel = (m) => `${lvl(m)}-я линия`;

/** contact — structure из отчёта по контактам, prep — structure из отчёта PRep. */
export function computeTasks(contact, prep, now = new Date()) {
  const people = contact.filter((m) => lvl(m) > 0);

  const fresh = prep.filter((m) => lvl(m) > 0 && m.isNewMember);

  const leaving = people
    .filter((m) => m.position === "CANDIDATE" && m.registrationDays != null && m.registrationDaysLimit != null)
    .map((m) => ({ ...m, left: m.registrationDaysLimit - m.registrationDays }))
    .filter((m) => m.left <= WARN_DAYS)
    .sort((a, b) => a.left - b.left);

  // поколение директора = число директоров над ним + 1; отчёт идёт деревом сверху вниз
  const stack = [];
  const directors = [];
  for (const m of contact) {
    const l = lvl(m);
    while (stack.length && stack[stack.length - 1].l >= l) stack.pop();
    const isDir = l > 0 && DIRECTOR_CODES.has(m.rank);
    if (isDir) directors.push({ ...m, gen: stack.filter((s) => s.dir).length + 1 });
    stack.push({ l, dir: isDir });
  }

  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const birthdays = people
    .map((m) => {
      const [mm, dd] = String(m.birthday ?? "").split("-").map(Number);
      if (!mm || !dd) return null;
      let when = new Date(now.getFullYear(), mm - 1, dd);
      if (when < today) when = new Date(now.getFullYear() + 1, mm - 1, dd);
      return { ...m, in: Math.round((when - today) / 86400000), when };
    })
    .filter((m) => m && m.in <= 6)
    .sort((a, b) => a.in - b.in);

  // «Давно не заказывали»: не покупали от 3 до 11 месяцев, пока человека реально вернуть (кандидатов не считаем)
  const stale = prep
    .filter((m) => lvl(m) > 0 && m.status !== "CANDIDATE" && m.monthsWithoutPoints != null && m.monthsWithoutPoints >= 3 && m.monthsWithoutPoints < 12)
    .sort((a, b) => a.monthsWithoutPoints - b.monthsWithoutPoints);

  // «Не хватает до 500 / 750»: у дистрибьюторов с объёмом группы, но ниже порога директора (500) или экстрабонуса (750)
  const go = (m) => Number(m.volumeGroup ?? 0);
  const dist = prep.filter((m) => lvl(m) > 0 && m.position === "DISTRIBUTOR" && go(m) > 0);
  const to500 = dist.filter((m) => go(m) < 500).sort((a, b) => go(b) - go(a));
  const to750 = dist.filter((m) => go(m) >= 500 && go(m) < 750).sort((a, b) => go(b) - go(a));

  const mine = (a) => a.filter((m) => lvl(m) === 1);
  return { fresh, leaving, directors, birthdays, stale, to500, to750, mine };
}
