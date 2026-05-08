// src/lib/aiClipsTranscriptMerge.ts
// Pure transcript merge / dedup logic. Used by ai-clips-merge.yml workflow.

export type WordSegment = {
  start: number;   // seconds (within parent chunk's local time)
  end: number;
  word: string;
};

export type ChunkTranscript = {
  chunk_index: number;
  start_sec: number;        // chunk's start in source-video time
  end_sec: number;
  transcript: string;
  word_segments_json: WordSegment[];
};

export type MergedTranscript = {
  transcript: string;
  word_segments_json: WordSegment[];  // timestamps shifted to source-video time
};

/**
 * Merge sequential chunk transcripts into one. Dedupes 5-second overlap windows by
 * word timestamps with a 250 ms tolerance.
 *
 * Assumptions:
 *  - Chunks are passed in sorted by chunk_index already.
 *  - Word timestamps within a chunk are LOCAL to that chunk (start at 0).
 */
export function mergeChunkTranscripts(
  chunks: ChunkTranscript[],
  overlapToleranceSec = 0.25
): MergedTranscript {
  const sorted = [...chunks].sort((a, b) => a.chunk_index - b.chunk_index);
  const merged: WordSegment[] = [];
  let lastEmittedEndSec = -Infinity;

  for (const chunk of sorted) {
    const offset = chunk.start_sec;
    for (const w of (chunk.word_segments_json ?? [])) {
      const absStart = w.start + offset;
      const absEnd = w.end + offset;
      // Skip if a word covering ~the same start time was already emitted
      if (absStart <= lastEmittedEndSec - overlapToleranceSec) continue;
      merged.push({ start: absStart, end: absEnd, word: w.word });
      if (absEnd > lastEmittedEndSec) lastEmittedEndSec = absEnd;
    }
  }

  // Reassemble human-readable transcript from words
  const text = merged.map((w) => w.word).join(" ").replace(/\s+([.,!?;:])/g, "$1").trim();
  return { transcript: text, word_segments_json: merged };
}
