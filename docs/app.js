// Стенд ЛК: вход, главная в духе банковского приложения (home.js) и отладочный раздел с запросами к API.
import { createHome } from "./home.js";
import { init, login as doLogin, logout as doLogout, request } from "./client.js";

const $ = (s) => document.querySelector(s);
const el = (tag, attrs = {}, ...kids) => {
  const n = Object.assign(document.createElement(tag), attrs);
  for (const k of kids) n.append(k);
  return n;
};

let config = { endpoints: [] };
const ctx = { currency: "RUB" };

const store = {
  get(k, d) {
    try {
      return JSON.parse(sessionStorage.getItem(k) ?? "null") ?? d;
    } catch {
      return d;
    }
  },
  set(k, v) {
    try {
      sessionStorage.setItem(k, JSON.stringify(v));
    } catch {
      /* без хранилища всё работает, добавленные адреса не переживут обновление */
    }
  },
};

/** Запрос к API: через стенд или напрямую (см. client.js) */
const api = request;

const home = createHome($("#home"), api);

/* ---------- вход ---------- */
const loginForm = $("#login-form");
const loginMsg = $("#login-msg");
const say = (text, kind = "") => {
  loginMsg.textContent = text;
  loginMsg.className = `msg ${kind}`;
};

loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const f = new FormData(loginForm);
  const btn = $("#login-btn");
  btn.disabled = true;
  say("Входим…");
  try {
    const d = await doLogin({ ...Object.fromEntries(f), timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone });
    loginForm.elements.password.value = ""; // пароль не остаётся в форме
    if (!d.ok) say(`Не вошли (${d.step}${d.status ? `, ${d.status}` : ""}): ${d.message}`, "bad");
    else enterDashboard({ token: d.token, sessionStatus: d.sessionStatus });
  } catch (err) {
    say(`Не достучались до стенда: ${err.message}`, "bad");
  } finally {
    btn.disabled = false;
  }
});

$("#logout-btn").addEventListener("click", async () => {
  await doLogout();
  $("#dash-view").hidden = true;
  $("#login-view").hidden = false;
  say("");
});


async function enterDashboard(info) {
  $("#login-view").hidden = true;
  $("#dash-view").hidden = false;
  endpoints = [...config.endpoints, ...store.get("extra", [])];
  renderAll();
  const { chk } = await home.load();
  // если магазин вернул 401, сессия истекла: вернём на вход
  if (chk.status === 401) {
    await doLogout();
    $("#dash-view").hidden = true;
    $("#login-view").hidden = false;
    say("Сессия истекла, войдите снова", "bad");
  }
}

/* ---------- отладка: запросы к API ---------- */
let endpoints = [];
const results = $("#results");
const renderAll = () => results.replaceChildren(...endpoints.map(card));

function card(ep) {
  const status = el("span", { className: "chip", textContent: "не запрошен" });
  const body = el("div", { className: "res-body" }, "Нажмите «Запросить»");
  const pathNode = el("code", { textContent: `${ep.method} ${ep.path}` });
  const run = el("button", { className: "btn small ghost", type: "button", textContent: "Запросить" });
  run.addEventListener("click", () => load(ep, status, body, pathNode));
  return el(
    "article",
    { className: "res" },
    el("div", { className: "res-head" }, el("h3", { textContent: ep.title }), pathNode, el("span", { className: "grow" }), status, run),
    ...(ep.note ? [el("p", { className: "res-note", textContent: ep.note })] : []),
    body,
  );
}

async function load(ep, status, body, pathNode) {
  status.textContent = "…";
  status.className = "chip";
  body.replaceChildren("Загрузка…");
  const resolved = ep.path.replace("{currency}", encodeURIComponent(ctx.currency));
  if (pathNode) pathNode.textContent = `${ep.method} ${resolved}`;
  const r = await api(resolved, { method: ep.method, body: ep.body ? (typeof ep.body === "string" ? JSON.parse(ep.body) : ep.body) : undefined });
  status.textContent = r.status ? `${r.status}` : "нет ответа";
  status.className = `chip ${r.ok ? "ok" : "bad"}`;
  body.replaceChildren(el("pre", { textContent: r.json ? JSON.stringify(r.json, null, 2) : r.text.slice(0, 4000) || "(пусто)" }));
}

$("#custom-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const f = new FormData(e.target);
  const path = String(f.get("path")).trim();
  if (!path.startsWith("/restApi/")) return alert("Адрес должен начинаться с /restApi/");
  const bodyText = $("#custom-body").value.trim();
  let body;
  if (bodyText) {
    try {
      body = JSON.parse(bodyText);
    } catch {
      return alert("Тело запроса должно быть JSON");
    }
  }
  const ep = { id: `c${Date.now()}`, title: "Свой запрос", method: f.get("method"), path, body };
  endpoints.unshift(ep);
  const n = card(ep);
  results.prepend(n);
  n.querySelector("button").click();
});

/* ---------- старт ---------- */
(async () => {
  try {
    config = await (await fetch("config.json", { cache: "no-store" })).json();
  } catch {
    /* без конфига не будет карточек отладки */
  }
  const st = await init(config);
  if (st.loggedIn) enterDashboard({ token: st.token, sessionStatus: "восстановлена" });
})();
