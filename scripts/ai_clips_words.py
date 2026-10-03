"""
Cleans up Whisper word tokens before they become AI Clips subtitles and transcripts.

Whisper splits spelled-out terms into one token per letter, with stray dots and
hyphens, and sometimes repeats or drops a letter. Real output for "GTA":
    "G" "-T" "-A" "-5."    "G." "T" ".A." "4,"    "G" "-T" "-T" "-A" "-6"
    "G" ".T." "5"          "G." "A" "five"        "GTA" "-5,"
Shown as captions that reads "G -T -A -5". This turns each into "GTA 5" etc.,
and re-joins hyphenated words it split ("brand" "-new" -> "brand-new").

Used by .github/workflows/ai-clips.yml (small files) and
ai-clips-transcribe-chunk.yml (large files). Tests: scripts/test_ai_clips_words.py
"""

import re

# Spelled-out terms worth repairing when Whisper repeats or drops a letter
# ("GTTA", "GA" -> "GTA"). Exact spellings of anything else are kept as heard.
KNOWN_TERMS = {
    "GTA", "NPC", "NPCS", "FPS", "RPG", "MMO", "DLC", "PVP", "PVE", "HUD", "FOV",
    "AFK", "RNG", "MVP", "NBA", "NFL", "UFC", "WWE", "FBI", "CIA", "CEO", "USA",
}

_TRAIL = re.compile(r"[,!?;:]+$")
# 1-3 capital letters with optional dots/hyphens around them: "G", "G.", ".T.", "-A", "GTA"
_PIECE = re.compile(r"^[-.]?(?:[A-Z][-.]?){1,3}$")
_NUMBER = re.compile(r"^[-.]?\d+\.?$")
_WORD_CONTINUATION = re.compile(r"^-[a-z]")
# Leading "-T"/".T", a lone letter with a dot "G.", or letters joined inside a token "G-T"
_SPELLING_MARK = re.compile(r"^[-.]|^[A-Z]\.$|[A-Z][-.][A-Z]")


def _split_trail(word):
    m = _TRAIL.search(word)
    return (word[: m.start()], m.group(0)) if m else (word, "")


def _is_piece(word):
    core, _ = _split_trail(word)
    return bool(_PIECE.match(core))


def _is_number(word):
    core, _ = _split_trail(word)
    return bool(_NUMBER.match(core))


def _repair(letters, spelled):
    if letters in KNOWN_TERMS:
        return letters
    deduped = re.sub(r"(.)\1+", r"\1", letters)
    if deduped in KNOWN_TERMS:
        return deduped
    if spelled:
        # One letter dropped: "GA", "GT" -> "GTA". Only for clearly spelled-out runs.
        for term in KNOWN_TERMS:
            if len(term) == len(deduped) + 1 and term[0] == deduped[0] and _is_subsequence(deduped, term):
                return term
    return letters


def _is_subsequence(short, long):
    it = iter(long)
    return all(c in it for c in short)


def normalize_words(words):
    """Words are dicts with start/end/word. Returns new dicts; a merged word spans its tokens."""
    toks = [{"start": w["start"], "end": w["end"], "word": (w.get("word") or "").strip()} for w in words]
    toks = [t for t in toks if t["word"]]
    out = []
    i = 0
    while i < len(toks):
        j = i
        while j < len(toks) and _is_piece(toks[j]["word"]):
            j += 1
        run = toks[i:j]
        letters = "".join(c for t in run for c in t["word"] if c.isupper())
        has_number = j < len(toks) and run and _is_number(toks[j]["word"])
        # Spelling marks, as opposed to a sentence-ending period ("OK." "I" is two words)
        marked = any(_SPELLING_MARK.search(_split_trail(t["word"])[0]) for t in run)
        # A spelled-out term ("G" "-T" "-A"), or one acronym glued to a number ("GTA" "-5,")
        if len(letters) >= 2 and ((marked and (len(run) >= 2 or has_number)) or (len(run) == 1 and has_number)):
            last = toks[j] if has_number else run[-1]
            core, trail = _split_trail(last["word"])
            term = _repair(letters, spelled=marked and len(run) >= 2)
            text = term
            if has_number:
                text += " " + core.strip("-.")
                # keep a sentence-ending period that followed the number ("-5." -> "5.")
                if core.endswith("."):
                    text += "."
            out.append({"start": run[0]["start"], "end": last["end"], "word": text + trail})
            i = j + 1 if has_number else j
            continue
        t = toks[i]
        if out and _WORD_CONTINUATION.match(t["word"]):
            out[-1]["word"] += t["word"]
            out[-1]["end"] = t["end"]
        else:
            out.append(dict(t))
        i += 1
    return out


def normalize_text(text):
    """Same cleanup for plain text (segment lines sent to the moment finder)."""
    tokens = [{"start": 0, "end": 0, "word": t} for t in text.split()]
    return " ".join(w["word"] for w in normalize_words(tokens))
