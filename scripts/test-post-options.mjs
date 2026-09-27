// Run: node --experimental-strip-types scripts/test-post-options.mjs
//
// src/lib/postOptions.ts turns the optional per-platform post options into the
// extra fields each publish API receives. The first block is the one that
// matters most: posts scheduled before these options existed (and posts that
// leave them blank) must produce NO extra fields, so their API requests are
// byte-for-byte what they were before.
//
// It also covers the bug this shipped with: the TikTok "Label as AI-generated"
// toggle saved aigc_disclosure but it was never sent, so no label appeared.

import {
  AI_LABEL_PLATFORMS,
  tiktokPostInfoExtras,
  youtubeExtras,
  normalizeYouTubeTags,
  instagramContainerExtras,
  normalizeInstagramCollaborators,
  blueskyExtras,
  blueskyThreadgateAllow,
  pinterestExtras,
  parseList,
} from "../src/lib/postOptions.ts";

let failures = 0;
function check(label, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  const ok = a === e;
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${ok ? "" : `\n        got  ${a}\n        want ${e}`}`);
}

// --- Existing rows send nothing extra ---------------------------------------
// Shapes copied from what the uploads page saved before this change.
const legacyTikTok = {
  privacy_level: "PUBLIC_TO_EVERYONE", allow_comments: true, allow_duet: false, allow_stitch: false,
  brand_organic_toggle: false, brand_content_toggle: false, aigc_disclosure: false,
};
const legacyYouTube = {
  is_short: true, category: "gaming", notify_subscribers: true, allow_comments: true,
  allow_embedding: true, made_for_kids: false, public_stats_viewable: true,
};
const legacyInstagram = { ig_type: "reel", first_comment: "nice" };
const legacyBluesky = { description_override: "hi" };
const legacyPinterest = { board_id: "123" };

for (const [name, s] of [["null", null], ["undefined", undefined], ["{}", {}]]) {
  check(`tiktok: ${name} settings add nothing`, tiktokPostInfoExtras(s), {});
  check(`youtube: ${name} settings add nothing`, youtubeExtras(s), { snippet: {}, status: {} });
  check(`instagram reel: ${name} settings add nothing`, instagramContainerExtras(s, "REELS", false), {});
  check(`bluesky: ${name} settings add nothing`, blueskyExtras(s), {});
  check(`pinterest: ${name} settings add nothing`, pinterestExtras(s), {});
}
check("tiktok: legacy row adds nothing", tiktokPostInfoExtras(legacyTikTok), {});
check("youtube: legacy row adds nothing", youtubeExtras(legacyYouTube), { snippet: {}, status: {} });
check("instagram: legacy reel row adds nothing", instagramContainerExtras(legacyInstagram, "REELS", true), {});
check("instagram: legacy story row adds nothing", instagramContainerExtras({ ig_type: "story" }, "STORIES", false), {});
check("bluesky: legacy row adds nothing", blueskyExtras(legacyBluesky), {});
check("pinterest: legacy row adds nothing", pinterestExtras(legacyPinterest), {});

// --- AI label ---------------------------------------------------------------
check("AI label platforms", [...AI_LABEL_PLATFORMS], ["tiktok", "youtube", "instagram"]);
check("tiktok: aigc_disclosure=true sends is_aigc", tiktokPostInfoExtras({ aigc_disclosure: true }), { is_aigc: true });
check("tiktok: truthy non-boolean is not treated as a label", tiktokPostInfoExtras({ aigc_disclosure: "true" }), {});
check("youtube: contains_synthetic_media", youtubeExtras({ contains_synthetic_media: true }).status, { containsSyntheticMedia: true });
check("instagram reel: ai_generated", instagramContainerExtras({ ai_generated: true }, "REELS", false), { is_ai_generated: "true" });
check("instagram story: ai_generated", instagramContainerExtras({ ai_generated: true }, "STORIES", false), { is_ai_generated: "true" });

// --- TikTok cover frame -----------------------------------------------------
check("tiktok: cover frame rounds ms", tiktokPostInfoExtras({ cover_timestamp_ms: 2500.4 }), { video_cover_timestamp_ms: 2500 });
check("tiktok: cover frame 0 is valid", tiktokPostInfoExtras({ cover_timestamp_ms: 0 }), { video_cover_timestamp_ms: 0 });
check("tiktok: negative cover frame ignored", tiktokPostInfoExtras({ cover_timestamp_ms: -1 }), {});
check("tiktok: string cover frame ignored", tiktokPostInfoExtras({ cover_timestamp_ms: "5" }), {});

// --- YouTube ----------------------------------------------------------------
check("youtube tags: split on commas, keep spaces, strip #, dedupe", normalizeYouTubeTags("#gaming, warzone highlights, Gaming,, "), ["gaming", "warzone highlights"]);
check("youtube tags: angle brackets removed (YouTube rejects them)", normalizeYouTubeTags("a<b>"), ["ab"]);
const many = Array.from({ length: 100 }, (_, i) => `tag${String(i).padStart(3, "0")}`); // 6 chars + comma each
const capped = normalizeYouTubeTags(many);
check("youtube tags: capped at 500 chars total", capped.join(",").length <= 500 && capped.length === 71, true);
check("youtube: language sets default + audio language", youtubeExtras({ default_language: "zh-Hans" }).snippet, { defaultLanguage: "zh-Hans", defaultAudioLanguage: "zh-Hans" });
check("youtube: junk language ignored", youtubeExtras({ default_language: "english!" }).snippet, {});
check("youtube: creative commons license", youtubeExtras({ license: "creativeCommon" }).status, { license: "creativeCommon" });
check("youtube: standard license sends nothing", youtubeExtras({ license: "youtube" }).status, {});

// --- Instagram --------------------------------------------------------------
check("ig collaborators: @ stripped, lowercased, max 3, invalid dropped", normalizeInstagramCollaborators("@Alice, bob bad-name carol dave"), ["alice", "bob", "carol"]);
check("ig collaborators: sent as JSON array on reels", instagramContainerExtras({ collaborators: "@a, @b" }, "REELS", false), { collaborators: '["a","b"]' });
check("ig collaborators: not sent on stories", instagramContainerExtras({ collaborators: "@a", share_to_feed: false, cover_offset_ms: 1000 }, "STORIES", false), {});
check("ig: share_to_feed only sent when turned off", instagramContainerExtras({ share_to_feed: true }, "REELS", false), {});
check("ig: share_to_feed=false", instagramContainerExtras({ share_to_feed: false }, "REELS", false), { share_to_feed: "false" });
check("ig: cover offset used without a custom cover", instagramContainerExtras({ cover_offset_ms: 1500 }, "REELS", false), { thumb_offset: "1500" });
check("ig: custom cover wins over cover offset", instagramContainerExtras({ cover_offset_ms: 1500 }, "REELS", true), {});

// --- Bluesky ----------------------------------------------------------------
check("bluesky: language, alt text, reply gate", blueskyExtras({ language: "en", alt_text: "  a dog  ", reply_gate: "following" }), { langs: ["en"], alt: "a dog", replyGate: "following" });
check("bluesky: 'everyone' is not a gate", blueskyExtras({ reply_gate: "everyone" }), {});
check("bluesky: alt text capped at 1000", blueskyExtras({ alt_text: "x".repeat(1200) }).alt.length, 1000);
check("threadgate: nobody = empty allow list", blueskyThreadgateAllow("nobody"), []);
check("threadgate: mentioned", blueskyThreadgateAllow("mentioned"), [{ $type: "app.bsky.feed.threadgate#mentionRule" }]);
check("threadgate: followers", blueskyThreadgateAllow("followers"), [{ $type: "app.bsky.feed.threadgate#followerRule" }]);

// --- Pinterest --------------------------------------------------------------
check("pinterest: valid link + alt text", pinterestExtras({ link: " https://clipdash.org/x ", alt_text: "alt" }), { link: "https://clipdash.org/x", alt_text: "alt" });
check("pinterest: link without scheme skipped", pinterestExtras({ link: "clipdash.org" }), {});
check("pinterest: javascript: link skipped", pinterestExtras({ link: "javascript:alert(1)" }), {});

// --- parseList --------------------------------------------------------------
check("parseList accepts arrays", parseList(["@a", " b ", 3]), ["a", "b"]);

console.log(failures === 0 ? "\nAll passed." : `\n${failures} failed.`);
process.exit(failures === 0 ? 0 : 1);
