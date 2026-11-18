"""KarGah NLP service — FastAPI entrypoint (spec D.13).

Phase 1 ships the two endpoints the Integrity pipeline needs
(E.4 rules 5-7): /vocabulary-stats and /similarity.

DECISION: hazm/parsivar are not installable in the dev venv (no network
access), so both endpoints use a pure-Python fallback implementation
(Persian word tokenization + word-frequency cosine). The fallback is
good enough to exercise the pipeline end-to-end and to catch obvious
copy-paste / self-repeat; when hazm/parsivar are available the same
endpoints would be backed by them. The API contract (request/response
JSON) is identical either way, so the Nest client does not change.
"""

import math
import re
from collections import Counter

from fastapi import FastAPI
from pydantic import BaseModel

app = FastAPI(title="KarGah NLP", version="1.0.0")

# --- Phase-1 lexical fallback lexicons (spec D.13 / todo #4) ----------------
# With hazm/parsivar these would come from POS-tagged corpora. The dev-time
# fallback uses morphological suffixes plus a small closed word list, which
# is enough to exercise the /extract-adjectives-adverbs contract and to seed
# the "no-adverbs" style rule's reference list. The request/response JSON
# contract is identical either way, so the Nest client does not change.
_ADJ_SUFFIXES = ("دار", "وار")
_ADV_SUFFIXES = ("انه", "طور", "گونه", "وار", "مند")
_ADJ_STOP = {"سی", "پی", "نی", "می"}  # particles glued by the naive tokenizer
_ADV_STOP = {"می", "نی", "سی"}

# Persian/Arabic letter class for tokenization (matches the same ranges the
# TS persianCharRatio helper uses, so the two sides agree on "is Persian").
_PERSIAN_RE = re.compile(r"[\u0600-\u06FF\u0750-\u077F]+")


class TextRequest(BaseModel):
    text: str


class SimilarityRequest(BaseModel):
    textA: str
    textB: str


class ExtractionRequest(BaseModel):
    text: str
    # Optional explicit lexicon. When omitted, the built-in suffix sets
    # below are used (the phase-1 lexical fallback — same idea as the TS
    # style validator's adverb detection).
    adjectives: list[str] | None = None
    adverbs: list[str] | None = None


def _tokenize(text: str) -> list[str]:
    """Lowercase word tokens. Uses Persian/Arabic runs and ASCII word runs.

    DECISION: the fallback tokenizer treats the whole Persian run as one
    token, which is not a real morpheme split. To get at least word-level
    tokens we split on the zero-width non-joiner (U+200C, Persian "half
    space") and on whitespace, which is how the web app renders spaced
    Persian text. A proper hazm/parsivar tokenizer would handle full
    morphological analysis; this is a dev-time approximation only.
    """
    if not text:
        return []
    text = text.lower()
    tokens: list[str] = []
    for run in _PERSIAN_RE.findall(text):
        # Split each Persian run on ZWNJ (U+200C) and whitespace — the
        # minimal word-level split available without hazm/parsivar.
        for part in re.split(r'[\u200c\s]+', run):
            if part:
                tokens.append(part)
    # ASCII/Latin words (kept for mixed text; phase 1 content is Persian).
    for run in re.findall(r"[a-z0-9]+", text):
        tokens.append(run)
    return tokens


@app.get("/health")
def health() -> dict:
    return {"status": "ok", "service": "nlp"}


@app.post("/vocabulary-stats")
def vocabulary_stats(req: TextRequest) -> dict:
    """Unique + known-word ratios (E.4 rule 5).

    'known' here is a lexical proxy: words whose length is >= 2 (a stand-in
    for a morpheme/lexicon check). With hazm this would use its POS/lemma
    tables; the contract is unchanged.
    """
    tokens = _tokenize(req.text)
    total = len(tokens)
    unique = len(set(tokens))
    known = sum(1 for t in tokens if len(t) >= 2)
    return {
        "uniqueWords": unique,
        "totalWords": total,
        "uniqueRatio": (unique / total) if total else 0.0,
        "knownWords": known,
        "knownWordRatio": (known / total) if total else 0.0,
    }


@app.post("/similarity")
def similarity(req: SimilarityRequest) -> dict:
    """Cosine similarity over word-frequency vectors (E.4 rules 6-7).

    Pure-Python fallback; identical contract to a hazm-backed embedding
    similarity. Returns 0.0 for two empty/absent texts.
    """
    a = Counter(_tokenize(req.textA))
    b = Counter(_tokenize(req.textB))
    if not a or not b:
        return {"similarity": 0.0}
    common = set(a) & set(b)
    dot = sum(a[w] * b[w] for w in common)
    mag_a = math.sqrt(sum(v * v for v in a.values()))
    mag_b = math.sqrt(sum(v * v for v in b.values()))
    if mag_a == 0 or mag_b == 0:
        return {"similarity": 0.0}
    return {"similarity": dot / (mag_a * mag_b)}


def _canonicalize(token: str) -> str:
    """Canonicalize a token to match the TS validator's normalizePersian."""
    return (
        token.replace("ي", "ی")
        .replace("ك", "ک")
        .replace("آ", "ا")
        .replace("أ", "ا")
        .replace("إ", "ا")
    )


def _looks_adjective(token: str) -> bool:
    """Phase-1 adjective heuristic.

    A Persian adjective often ends in a short-vowel + ي stem (e.g. سردی,
    گرمی). We detect: (a) explicit suffixes دار/وار, or (b) a trailing ی
    preceded by a consonant (so «درد»/«باران» — vowel-final — are not
    flagged). The trailing-ی test alone is a heuristic; with hazm this would
    be a POS lookup.
    """
    for suf in _ADJ_SUFFIXES:
        if token.endswith(suf) and len(token) > len(suf):
            return True
    if token.endswith("ی") and len(token) >= 3:
        prev = token[-2]
        if prev not in "اآاوئيی" and prev not in _ADJ_STOP:
            return True
    return False


def _looks_adverb(token: str) -> bool:
    return any(
        token.endswith(suf) and len(token) > len(suf)
        for suf in _ADV_SUFFIXES
    ) and token not in _ADV_STOP


@app.post("/extract-adjectives-adverbs")
def extract_adjectives_adverbs(req: ExtractionRequest) -> dict:
    """Extract adjective/adverb candidates from a text (todo #4).

    Phase-1 lexical fallback: suffix/POS heuristics over the Persian word
    tokens. Accepts an optional explicit lexicon (adjectives/adverbs lists)
    to override the heuristics; when omitted, the built-in suffix sets are
    used. The response lists the found words plus the source (heuristic vs
    lexicon) so the Nest client can decide how to weight them.
    """
    tokens = _tokenize(req.text)
    canon: list[str] = []
    for t in tokens:
        c = _canonicalize(t)
        if c:
            canon.append(c)

    adj_lex = {_canonicalize(w) for w in (req.adjectives or [])}
    adv_lex = {_canonicalize(w) for w in (req.adverbs or [])}
    use_lex = bool(adj_lex or adv_lex)

    adjectives: set[str] = set()
    adverbs: set[str] = set()
    for c in canon:
        if use_lex:
            if c in adj_lex:
                adjectives.add(c)
            if c in adv_lex:
                adverbs.add(c)
        else:
            if _looks_adjective(c):
                adjectives.add(c)
            if _looks_adverb(c):
                adverbs.add(c)

    return {
        "adjectives": sorted(adjectives),
        "adverbs": sorted(adverbs),
        "source": "lexicon" if use_lex else "heuristic",
        "totalWords": len(canon),
    }


# --- Spec D.11: 5 remaining endpoints ---------------------------------------

# Persian diacritics range (Farsi harakat + tashkeel marks).
_DIACRITICS_RE = re.compile(r"[\u064B-\u065F\u0670]")

# Persian/Arabic sentence-final punctuation.
_SENT_END_CHARS = (".", "!", "?", "…", "؟", "۔")


class LipogramRequest(BaseModel):
    text: str
    forbiddenLetter: str


def _normalize(text: str) -> str:
    """Persian text normalization (spec G.3 normalizePersian).

    Canonical form: ي→ی, ك→ک, ZWNJ→space, strip diacritics, آ/أ/إ→ا,
    collapse whitespace, lowercase.
    """
    s = (
        text.replace("ي", "ی")
        .replace("ك", "ک")
        .replace("\u200c", " ")
    )
    s = _DIACRITICS_RE.sub("", s)
    s = s.replace("آ", "ا").replace("أ", "ا").replace("إ", "ا")
    s = re.sub(r"\s+", " ", s).strip().lower()
    return s


@app.post("/normalize")
def normalize(req: TextRequest) -> dict:
    """POST /normalize — canonicalize Persian text (spec D.11)."""
    return {"normalized": _normalize(req.text)}


@app.post("/tokenize")
def tokenize(req: TextRequest) -> dict:
    """POST /tokenize — word-level tokenization (spec D.11).

    Uses the same _tokenize fallback as /vocabulary-stats and /similarity.
    With hazm this would be hazm.word_tokenize.
    """
    return {"tokens": _tokenize(req.text)}


# --- POS fallback lexicons (spec D.11 / B.3 pos_tag.py) ---------------------
# Phase-1 heuristic: closed word lists for common Persian function words.
# With hazm/POS this would be a real tagger (parsivar/pos_tag).
_PERSIAN_STOP_WORDS = {
    # pronouns
    "من", "تو", "او", "ما", "شما", "آن", "این",
    # articles / determiners (Persian has no definite article, but common ones)
    "یک", "یکی", "هر", "همان", "این",
    # prepositions
    "در", "بر", "به", "با", "از", "برای", "درباره", "به‌سبب",
    # conjunctions
    "و", "یا", "اما", "وگرنه", "اگر", "چون", "زیرا", "که",
    # particles
    "ن", "ب", "م", "س", "ف",
    # modal / auxiliary
    "می‌توان", "باید", "می‌شود", "توانست",
}

# Verb-suffix heuristic: Persian conjugated verbs often end in these markers.
_VERB_SUFFIXES = (
    "م", "ی", "د", "ند", "یم", "ید", "ست", "دند", "م", "ی",
    "ام", "ی", "د", "یم", "ید", "ند",
)


def _pos_fallback(token: str) -> str:
    """Phase-1 POS tag heuristic.

    Returns one of: 'pron', 'prep', 'conj', 'part', 'verb', 'adj', 'adv', 'noun'.
    With hazm/POS this would be a real tagger.
    """
    t = token.lower()
    if t in _PERSIAN_STOP_WORDS:
        # Refine: prepositions vs pronouns vs conjunctions
        if t in ("در", "بر", "به", "با", "از", "برای", "درباره"):
            return "prep"
        if t in ("و", "یا", "اما", "اگر", "چون", "زیرا", "که", "وگرنه"):
            return "conj"
        if t in ("من", "تو", "او", "ما", "شما", "آن", "این"):
            return "pron"
        return "part"
    if _looks_adjective(t):
        return "adj"
    if _looks_adverb(t):
        return "adv"
    # Verb heuristic: short tokens ending in common verb suffixes.
    if len(t) >= 2 and any(t.endswith(s) for s in _VERB_SUFFIXES):
        return "verb"
    return "noun"


@app.post("/pos-tag")
def pos_tag(req: TextRequest) -> dict:
    """POST /pos-tag — part-of-speech tagging (spec D.11).

    Phase-1 fallback: closed-list + suffix heuristics.
    With hazm/POS this would use a trained Persian POS tagger.
    """
    tokens = _tokenize(req.text)
    tagged = [{"word": t, "pos": _pos_fallback(t)} for t in tokens if t]
    return {"tokens": tagged}


@app.post("/validate-sentence")
def validate_sentence(req: TextRequest) -> dict:
    """POST /validate-sentence — completeness check (spec D.11, G.5).

    Phase-1 fallback: checks token count >= 3, presence of a verb-like
    token (suffix heuristic), or sentence-final punctuation.
    With hazm this would use proper tokenization + POS.
    """
    normalized = _normalize(req.text)
    tokens = _tokenize(normalized)
    has_verb = any(_pos_fallback(t) == "verb" for t in tokens)
    has_end = bool(normalized) and normalized[-1] in _SENT_END_CHARS
    is_complete = len(tokens) >= 3 and (has_verb or has_end)
    score = min(len(tokens) / 10, 1.0)
    reason = None
    if not is_complete:
        if len(tokens) < 3:
            reason = "جمله کوتاه است"
        elif not has_verb and not has_end:
            reason = "فعل یا پایان‌بندی ندارد"
    return {"isComplete": is_complete, "reason": reason, "score": score}


@app.post("/lipogram-check")
def lipogram_check(req: LipogramRequest) -> dict:
    """POST /lipogram-check — forbidden-letter check (spec D.11, G.3).

    Normalizes text + letter, then finds words containing the forbidden
    letter. Returns up to 20 offending words (spec G.3).
    """
    normalized = _normalize(req.text)
    forbidden = _normalize(req.forbiddenLetter)
    if not forbidden:
        return {"violation": False, "offendingWords": []}
    words = normalized.split(" ")
    offending = [w for w in words if forbidden in w]
    return {
        "violation": len(offending) > 0,
        "offendingWords": offending[:20],
    }
