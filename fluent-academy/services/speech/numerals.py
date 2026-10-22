"""Spell out numerals and clock times so recognised text ("14h30") can be compared with scripts ("quatorze heures trente")."""
from __future__ import annotations

import re

_FR = "zéro un deux trois quatre cinq six sept huit neuf dix onze douze treize quatorze quinze seize".split()
_ES = "cero uno dos tres cuatro cinco seis siete ocho nueve diez once doce trece catorce quince dieciséis diecisiete dieciocho diecinueve veinte veintiuno veintidós veintitrés veinticuatro veinticinco veintiséis veintisiete veintiocho veintinueve".split()
_DE = "null eins zwei drei vier fünf sechs sieben acht neun zehn elf zwölf dreizehn vierzehn fünfzehn sechzehn siebzehn achtzehn neunzehn".split()
_EN = "zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen".split()


def fr(n: int) -> str:
    if n < 17:
        return _FR[n]
    if n < 20:
        return "dix-" + _FR[n - 10]
    if n < 70:
        tens = {2: "vingt", 3: "trente", 4: "quarante", 5: "cinquante", 6: "soixante"}[n // 10]
        u = n % 10
        return tens if u == 0 else f"{tens} et un" if u == 1 else f"{tens}-{_FR[u]}"
    if n < 80:
        return "soixante et onze" if n == 71 else "soixante-" + fr(n - 60)
    if n < 100:
        return "quatre-vingts" if n == 80 else "quatre-vingt-" + fr(n - 80)
    if n < 1000:
        h, r = divmod(n, 100)
        head = "cent" if h == 1 else f"{_FR[h]} cent{'s' if r == 0 else ''}"
        return head if r == 0 else f"{head} {fr(r)}"
    th, r = divmod(n, 1000)
    head = "mille" if th == 1 else f"{fr(th)} mille"
    return head if r == 0 else f"{head} {fr(r)}"


def es(n: int) -> str:
    if n < 30:
        return _ES[n]
    if n < 100:
        tens = {3: "treinta", 4: "cuarenta", 5: "cincuenta", 6: "sesenta", 7: "setenta", 8: "ochenta", 9: "noventa"}[n // 10]
        return tens if n % 10 == 0 else f"{tens} y {_ES[n % 10]}"
    if n < 1000:
        h, r = divmod(n, 100)
        if n == 100:
            return "cien"
        head = {1: "ciento", 5: "quinientos", 7: "setecientos", 9: "novecientos"}.get(h) or f"{_ES[h]}cientos"
        return head if r == 0 else f"{head} {es(r)}"
    th, r = divmod(n, 1000)
    head = "mil" if th == 1 else f"{es(th)} mil"
    return head if r == 0 else f"{head} {es(r)}"


def de(n: int) -> str:
    if n < 20:
        return _DE[n]
    if n < 100:
        tens = {2: "zwanzig", 3: "dreißig", 4: "vierzig", 5: "fünfzig", 6: "sechzig", 7: "siebzig", 8: "achtzig", 9: "neunzig"}[n // 10]
        u = n % 10
        return tens if u == 0 else ("ein" if u == 1 else _DE[u]) + "und" + tens
    if n < 1000:
        h, r = divmod(n, 100)
        head = ("ein" if h == 1 else _DE[h]) + "hundert"
        return head if r == 0 else head + de(r)
    th, r = divmod(n, 1000)
    head = ("ein" if th == 1 else de(th)) + "tausend"
    return head if r == 0 else head + de(r)


def en(n: int) -> str:
    if n < 20:
        return _EN[n]
    if n < 100:
        tens = {2: "twenty", 3: "thirty", 4: "forty", 5: "fifty", 6: "sixty", 7: "seventy", 8: "eighty", 9: "ninety"}[n // 10]
        return tens if n % 10 == 0 else f"{tens}-{_EN[n % 10]}"
    if n < 1000:
        h, r = divmod(n, 100)
        return f"{_EN[h]} hundred" + ("" if r == 0 else f" and {en(r)}")
    th, r = divmod(n, 1000)
    return f"{en(th)} thousand" + ("" if r == 0 else f" {en(r)}")


SPELL = {"fr": fr, "es": es, "de": de, "en": en}
HOUR = {"fr": "heures", "es": "", "de": "Uhr", "en": ""}


def expand(text: str, lang: str) -> str:
    spell = SPELL.get(lang)
    if not spell:
        return text

    def clock(m: re.Match) -> str:
        h, mnt = int(m.group(1)), int(m.group(2) or 0)
        if h > 24 or mnt > 59:
            return m.group(0)
        hour = spell(h)
        if lang == "fr":
            hour = "une heure" if h == 1 else f"{hour} heures"
            return hour + (f" {spell(mnt)}" if mnt else "")
        if lang == "de":
            return f"{hour} Uhr" + (f" {spell(mnt)}" if mnt else "")
        return hour + (f" {spell(mnt)}" if mnt else "")

    text = re.sub(r"\b(\d{1,2})\s*[h:]\s*(\d{2})?\b(?:\s*Uhr)?", clock, text)

    def price(m: re.Match) -> str:
        a, b = int(m.group(1)), int(m.group(2))
        unit = {"fr": "euros", "es": "euros", "de": "Euro", "en": "euros"}[lang]
        return f"{spell(a)} {unit} {spell(b)}"

    text = re.sub(r"\b(\d{1,4})[,.](\d{2})\s*(?:€|euros?|Euro)", price, text)
    return re.sub(r"\b\d{1,6}\b", lambda m: spell(int(m.group(0))) if int(m.group(0)) < 1_000_000 else m.group(0), text)
