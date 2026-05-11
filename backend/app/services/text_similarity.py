"""Light-weight string similarity helpers used by matching/mapping services."""
from __future__ import annotations

import re
from difflib import SequenceMatcher

_NONWORD = re.compile(r"[^a-z0-9]+")


def normalize(value: str | None) -> str:
    if not value:
        return ""
    return _NONWORD.sub(" ", value.strip().lower()).strip()


def ratio(a: str | None, b: str | None) -> float:
    na, nb = normalize(a), normalize(b)
    if not na or not nb:
        return 0.0
    return SequenceMatcher(None, na, nb).ratio()


def contains(needle: str | None, haystack: str | None) -> bool:
    nh = normalize(haystack)
    nn = normalize(needle)
    if not nh or not nn:
        return False
    return nn in nh
