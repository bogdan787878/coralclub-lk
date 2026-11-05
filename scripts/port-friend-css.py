#!/usr/bin/env python3
"""Переносит CSS-модули проекта «Друг клуба» (coral-club-shop) в обычный CSS для ЛК: docs/friend.css.

Каждому модулю даётся префикс, чтобы классы не пересекались (.section → .ck-section).
Токены дизайна (--color-*, --space-* …) копируются как есть. Запуск: python3 scripts/port-friend-css.py
"""
import re, sys, pathlib

SRC = pathlib.Path(__file__).resolve().parents[2] / "coral-club-shop" / "src"
OUT = pathlib.Path(__file__).resolve().parents[1] / "docs" / "friend.css"
MODULES = [
    ("components/landing/LandingCheckout.module.css", "lc"),
    ("components/friend/FriendCheckout.module.css", "ck"),
    ("components/friend/CheckoutExtras.module.css", "ex"),
    ("components/friend/CourierSlots.module.css", "sl"),
    ("components/friend/OptionCards.module.css", "oc"),
    ("components/friend/FriendCartParts.module.css", "cp"),
    ("components/friend/PickupSheet.module.css", "ps"),
    ("components/friend/CountryMenu.module.css", "cm"),
]

def strip_comments(css):
    return re.sub(r"/\*.*?\*/", "", css, flags=re.S)

def prefix_selector(sel, tag):
    sel = re.sub(r":global\(([^)]*)\)", r"\1", sel)
    return re.sub(r"\.([A-Za-z_][\w-]*)", lambda m: f".{tag}-{m.group(1)}", sel)

def convert(css, tag):
    css = strip_comments(css)
    out, i, n = [], 0, len(css)
    def block(start):
        # возвращает индекс за закрывающей скобкой, начиная после «{»
        depth, j = 1, start
        while j < n and depth:
            if css[j] == "{": depth += 1
            elif css[j] == "}": depth -= 1
            j += 1
        return j
    def walk(text, tag):
        res, k, m = [], 0, len(text)
        while k < m:
            b = text.find("{", k)
            if b < 0:
                res.append(text[k:]); break
            prelude = text[k:b].strip()
            depth, j = 1, b + 1
            while j < m and depth:
                if text[j] == "{": depth += 1
                elif text[j] == "}": depth -= 1
                j += 1
            body = text[b + 1 : j - 1]
            if prelude.startswith("@media") or prelude.startswith("@supports"):
                res.append(f"{prelude} {{\n{walk(body, tag)}\n}}\n")
            elif prelude.startswith("@keyframes") or prelude.startswith("@font-face"):
                res.append(f"{prelude} {{{body}}}\n")
            else:
                body = re.sub(r"\s*composes:[^;]*;", "", body)
                res.append(f"{prefix_selector(prelude, tag)} {{{body}}}\n")
            k = j
        return "".join(res)
    return walk(css, tag)

parts = ["/* Сгенерировано scripts/port-friend-css.py из CSS-модулей проекта «Друг клуба». Не править руками. */\n"]
parts.append(strip_comments((SRC / "styles" / "tokens.css").read_text(encoding="utf-8")))
for rel, tag in MODULES:
    p = SRC / rel
    if not p.exists():
        print("нет файла", rel, file=sys.stderr); continue
    parts.append(f"\n/* ---- {rel} → .{tag}-* ---- */\n" + convert(p.read_text(encoding="utf-8"), tag))
OUT.write_text("\n".join(parts), encoding="utf-8")
print("записано", OUT, OUT.stat().st_size, "байт")
