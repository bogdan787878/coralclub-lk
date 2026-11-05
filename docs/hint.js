// Подсказки «?» всплывают поверх страницы, а не раздвигают карточку.
// У кнопки: class="mi" и data-hint="текст". Закрывается по клику мимо, Escape, прокрутке и повторному нажатию.
let pop = null;
let owner = null;

function close() {
  pop?.remove();
  pop = null;
  owner?.setAttribute("aria-expanded", "false");
  owner = null;
}

function open(btn) {
  close();
  owner = btn;
  btn.setAttribute("aria-expanded", "true");
  pop = document.createElement("div");
  pop.className = "hint-pop";
  pop.setAttribute("role", "tooltip");
  pop.textContent = btn.dataset.hint;
  const w = Math.min(260, window.innerWidth - 24);
  pop.style.width = `${w}px`;
  document.body.append(pop);
  const r = btn.getBoundingClientRect();
  const left = Math.min(Math.max(12, r.right - w), window.innerWidth - w - 12);
  let top = r.bottom + 8;
  const h = pop.offsetHeight;
  if (top + h > window.innerHeight - 12) top = Math.max(12, r.top - 8 - h);
  pop.style.left = `${left}px`;
  pop.style.top = `${top}px`;
}

document.addEventListener("click", (e) => pop && !pop.contains(e.target) && close());
document.addEventListener("keydown", (e) => e.key === "Escape" && close());
window.addEventListener("scroll", close, true);
window.addEventListener("resize", close);

/** Вешает хинты на все кнопки .mi[data-hint] внутри root. */
export function attachHints(root) {
  root.querySelectorAll(".mi[data-hint]").forEach((b) => {
    b.onclick = (e) => {
      e.stopPropagation();
      owner === b ? close() : open(b);
    };
  });
}
