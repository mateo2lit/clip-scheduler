"""Run: python -m unittest scripts/test_ai_clips_words.py
Token sequences below are what Whisper actually produced for a GTA video (2026-10-03)."""

import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from ai_clips_words import normalize_text, normalize_words  # noqa: E402


def words(*tokens):
    return [{"start": float(i), "end": i + 0.5, "word": t} for i, t in enumerate(tokens)]


def norm(*tokens):
    return " ".join(w["word"] for w in normalize_words(words(*tokens)))


class RealWhisperOutput(unittest.TestCase):
    def test_hyphenated_spelling(self):
        self.assertEqual(norm("better", "than", "G", "-T", "-A", "-5."), "better than GTA 5.")
        self.assertEqual(norm("than", "G", "-T", "-A", "-5,", "and"), "than GTA 5, and")

    def test_dotted_spelling(self):
        self.assertEqual(norm("in", "G", ".T", ".A.", "5,"), "in GTA 5,")
        self.assertEqual(norm("basics", "of", "G", ".T", ".A", ".5,"), "basics of GTA 5,")
        self.assertEqual(norm("feel", "of", "G.", "T", ".A.", "4,", "while"), "feel of GTA 4, while")

    def test_repeated_letter(self):
        self.assertEqual(norm("G", "-T", "-T", "-A", "-6", "is"), "GTA 6 is")

    def test_dropped_letter_in_a_spelled_run(self):
        self.assertEqual(norm("Back", "in", "2013", "when", "G", ".T.", "5", "was"), "Back in 2013 when GTA 5 was")
        self.assertEqual(norm("the", "regular", "G.", "A", "six", "map"), "the regular GTA six map")

    def test_term_glued_to_number(self):
        self.assertEqual(norm("In", "GTA", "-5,", "we"), "In GTA 5, we")

    def test_hyphenated_words_rejoined(self):
        self.assertEqual(norm("the", "brand", "-new", "map,"), "the brand-new map,")


class LeavesRealWordsAlone(unittest.TestCase):
    def test_plain_acronyms_and_words(self):
        self.assertEqual(norm("Now", "for", "many", "of", "you", "GT", "online"), "Now for many of you GT online")
        self.assertEqual(norm("the", "NPCs", "on", "PS5."), "the NPCs on PS5.")
        self.assertEqual(norm("I", "think", "A", "lot", "of", "people", "agree."), "I think A lot of people agree.")
        self.assertEqual(norm("released", "in", "2013,", "and"), "released in 2013, and")

    def test_consecutive_capitalized_words_are_not_a_term(self):
        self.assertEqual(norm("Is", "it", "OK.", "I", "think", "so."), "Is it OK. I think so.")
        self.assertEqual(norm("say", "OK", "I", "guess"), "say OK I guess")
        self.assertEqual(norm("watch", "TV.", "I", "said"), "watch TV. I said")
        self.assertEqual(norm("they", "are", "bringing", "into", "G."), "they are bringing into G.")

    def test_unknown_spelled_terms_keep_their_letters(self):
        self.assertEqual(norm("the", "A", "-A", "-R", "-P"), "the AARP")

    def test_merged_timing_spans_all_tokens(self):
        w = normalize_words(words("G", "-T", "-A", "-6"))
        self.assertEqual([(x["start"], x["end"], x["word"]) for x in w], [(0.0, 3.5, "GTA 6")])

    def test_text(self):
        self.assertEqual(normalize_text("G -T -T -A -6 is already way better than G -T -A -5."),
                         "GTA 6 is already way better than GTA 5.")


if __name__ == "__main__":
    unittest.main()
