// Кабинет: вход и главная в духе банковского приложения (home.js).
import { createHome } from "./home.js";
import { currentMode, init, login as doLogin, logout as doLogout, request, shopConfig, shopReady, shopRequest } from "./client.js";

const $ = (s) => document.querySelector(s);
let config = {};

/** Запрос к API: через стенд или напрямую (см. client.js) */
const api = request;

/** Выход: сбрасываем сессию и перезагружаем страницу, чтобы данные прежнего аккаунта не остались в памяти. */
async function signOut() {
  await doLogout();
  location.replace(location.pathname + location.search);
}

const home = createHome($("#home"), api, { onLogout: signOut, shopRequest, shopReady, shopConfig, useLayout: () => currentMode() === "direct" });

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
  say("Входим…", "busy");
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


async function enterDashboard(info) {
  $("#login-view").hidden = true;
  $("#dash-view").hidden = false;
  const { chk } = await home.load();
  // если магазин вернул 401, сессия истекла: вернём на вход
  if (chk.status === 401) {
    await doLogout();
    $("#dash-view").hidden = true;
    $("#login-view").hidden = false;
    say("Сессия истекла, войдите снова", "bad");
  }
}

/* ---------- старт ---------- */
(async () => {
  try {
    config = await (await fetch("config.json", { cache: "no-store" })).json();
  } catch {
    /* без конфига: значения по умолчанию из client.js */
  }
  const st = await init(config);
  if (st.loggedIn) enterDashboard({ token: st.token, sessionStatus: "восстановлена" });
})();
