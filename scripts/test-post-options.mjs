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
  blueskySelfLabels,
  pinterestExtras,
  normalizeInstagramUserTags,
  linkedinExtras,
  xExtras,
  facebookPostsAsReel,
  hasCoverFrame,
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
  check(`youtube: ${name} settings add nothing`, youtubeExtras(s), { snippet: {}, status: {}, extraParts: {} });
  check(`instagram reel: ${name} settings add nothing`, instagramContainerExtras(s, "REELS", false), {});
  check(`bluesky: ${name} settings add nothing`, blueskyExtras(s), {});
  check(`pinterest: ${name} settings add nothing`, pinterestExtras(s), {});
}
check("tiktok: legacy row adds nothing", tiktokPostInfoExtras(legacyTikTok), {});
check("youtube: legacy row adds nothing", youtubeExtras(legacyYouTube), { snippet: {}, status: {}, extraParts: {} });
check("instagram: legacy reel row adds nothing", instagramContainerExtras(legacyInstagram, "REELS", true), {});
check("instagram: legacy story row adds nothing", instagramContainerExtras({ ig_type: "story" }, "STORIES", false), {});
check("bluesky: legacy row adds nothing", blueskyExtras(legacyBluesky), {});
check("pinterest: legacy row adds nothing", pinterestExtras(legacyPinterest), {});

// --- AI label ---------------------------------------------------------------
check("AI label platforms", [...AI_LABEL_PLATFORMS], ["tiktok", "youtube", "instagram", "x", "pinterest"]);
check("x: AI label", xExtras({ made_with_ai: true }), { made_with_ai: true });
check("pinterest: AI label", pinterestExtras({ ai_generated: true }), { ai_disclosures: { values: ["AI_MODIFIED"] } });
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
check("youtube: paid promotion sends its own part", youtubeExtras({ has_paid_product_placement: true }).extraParts, { paidProductPlacementDetails: { hasPaidProductPlacement: true } });
check("youtube: paid promotion off adds no part", youtubeExtras({ has_paid_product_placement: false }).extraParts, {});
check("youtube: truthy non-boolean paid promotion ignored", youtubeExtras({ has_paid_product_placement: "true" }).extraParts, {});
check("youtube: recording date", youtubeExtras({ recording_date: "2026-10-01" }).extraParts, { recordingDetails: { recordingDate: "2026-10-01T00:00:00.000Z" } });
check("youtube: impossible recording date ignored", youtubeExtras({ recording_date: "2026-02-30" }).extraParts, {});
check("youtube: recording date with time ignored", youtubeExtras({ recording_date: "2026-10-01T10:00" }).extraParts, {});
{
  const locs = [
    { language: "es", title: "Hola", description: "Desc" },
    { language: "en", title: "Same as default", description: "" },   // the default language itself
    { language: "es", title: "Duplicate", description: "" },          // second Spanish
    { language: "fr", title: "   ", description: "no title" },         // YouTube requires a title
    { language: "nope!", title: "x", description: "" },               // bad code
    { language: "pt-PT", title: "<Olá>", description: "" },
  ];
  check("youtube: translations keep valid, unique, titled, non-default ones",
    youtubeExtras({ default_language: "en", localizations: locs }).extraParts,
    { localizations: { es: { title: "Hola", description: "Desc" }, "pt-PT": { title: "Olá", description: "" } } });
  check("youtube: translations need a video language", youtubeExtras({ localizations: locs }).extraParts, {});
}
{
  // Every language the uploads page offers must pass the validator, or it would be silently dropped.
  const { YOUTUBE_LANGUAGES } = await import("../src/lib/youtubeLanguages.ts");
  const dropped = YOUTUBE_LANGUAGES.filter((l) => !youtubeExtras({ default_language: l.value }).snippet.defaultLanguage).map((l) => l.value);
  check("youtube: every offered language is accepted", dropped, []);
  check("youtube: offered languages are unique", new Set(YOUTUBE_LANGUAGES.map((l) => l.value)).size, YOUTUBE_LANGUAGES.length);
  check("youtube: full language list offered", YOUTUBE_LANGUAGES.length >= 85, true);
}

// --- Instagram --------------------------------------------------------------
check("ig collaborators: @ stripped, lowercased, max 3, invalid dropped", normalizeInstagramCollaborators("@Alice, bob bad-name carol dave"), ["alice", "bob", "carol"]);
check("ig collaborators: sent as JSON array on reels", instagramContainerExtras({ collaborators: "@a, @b" }, "REELS", false), { collaborators: '["a","b"]' });
check("ig collaborators: not sent on stories", instagramContainerExtras({ collaborators: "@a", share_to_feed: false, cover_offset_ms: 1000 }, "STORIES", false), {});
check("ig: share_to_feed only sent when turned off", instagramContainerExtras({ share_to_feed: true }, "REELS", false), {});
check("ig: share_to_feed=false", instagramContainerExtras({ share_to_feed: false }, "REELS", false), { share_to_feed: "false" });
check("ig: cover offset used without a custom cover", instagramContainerExtras({ cover_offset_ms: 1500 }, "REELS", false), { thumb_offset: "1500" });
check("ig: a sent cover image wins over cover offset", instagramContainerExtras({ cover_offset_ms: 1500 }, "REELS", true), {});
check("cover frame chosen", [hasCoverFrame({ cover_offset_ms: 0 }), hasCoverFrame({ cover_offset_ms: 1500 }), hasCoverFrame({}), hasCoverFrame({ cover_offset_ms: -1 })], [true, true, false, false]);
check("ig user tags: max 20, invalid dropped", normalizeInstagramUserTags(Array.from({ length: 25 }, (_, i) => `user${i}`).concat("bad-name")).length, 20);
check("ig user tags: reels", instagramContainerExtras({ user_tags: "@Ann, bob" }, "REELS", false), { user_tags: '[{"username":"ann"},{"username":"bob"}]' });
check("ig user tags: stories too", instagramContainerExtras({ user_tags: "@ann" }, "STORIES", false), { user_tags: '[{"username":"ann"}]' });
check("ig audio name: reels only", [instagramContainerExtras({ audio_name: " My sound " }, "REELS", false), instagramContainerExtras({ audio_name: "x" }, "STORIES", false)], [{ audio_name: "My sound" }, {}]);
check("ig trial reel: manual by default", instagramContainerExtras({ trial_reel: true }, "REELS", false), { trial_params: '{"graduation_strategy":"MANUAL"}' });
check("ig trial reel: graduate on performance", instagramContainerExtras({ trial_reel: true, trial_graduation: "SS_PERFORMANCE" }, "REELS", false), { trial_params: '{"graduation_strategy":"SS_PERFORMANCE"}' });
check("ig trial reel: drops collaborators and feed opt-out", instagramContainerExtras({ trial_reel: true, collaborators: "@a", share_to_feed: false }, "REELS", false), { trial_params: '{"graduation_strategy":"MANUAL"}' });
check("ig trial reel: never on stories", instagramContainerExtras({ trial_reel: true }, "STORIES", false), {});

// --- Facebook ---------------------------------------------------------------
check("facebook: reel only when chosen", [facebookPostsAsReel({ post_as_reel: true }), facebookPostsAsReel({}), facebookPostsAsReel({ post_as_reel: "true" })], [true, false, false]);

// --- LinkedIn ---------------------------------------------------------------
check("linkedin: defaults match what every post sent before", linkedinExtras({}), { visibility: "PUBLIC", isReshareDisabledByAuthor: false });
check("linkedin: legacy connections-only row", linkedinExtras({ visibility: "CONNECTIONS" }), { visibility: "CONNECTIONS", isReshareDisabledByAuthor: false });
check("linkedin: signed-in members, no resharing, alt text", linkedinExtras({ visibility: "LOGGED_IN", disable_reshare: true, alt_text: " a demo " }), { visibility: "LOGGED_IN", isReshareDisabledByAuthor: true, altText: "a demo" });
check("linkedin: unknown visibility falls back to public", linkedinExtras({ visibility: "CONTAINER" }).visibility, "PUBLIC");

// --- X ----------------------------------------------------------------------
check("x: nothing set sends nothing", [xExtras(null), xExtras({}), xExtras({ reply_settings: "everyone" })], [{}, {}, {}]);
check("x: legacy reply settings still sent", xExtras({ reply_settings: "mentionedUsers" }), { reply_settings: "mentionedUsers" });
check("x: new reply settings", [xExtras({ reply_settings: "following" }), xExtras({ reply_settings: "verified" })], [{ reply_settings: "following" }, { reply_settings: "verified" }]);
check("x: junk reply setting ignored", xExtras({ reply_settings: "friends" }), {});
check("x: paid partnership", xExtras({ paid_partnership: true }), { paid_partnership: true });

// --- Bluesky ----------------------------------------------------------------
check("bluesky: language, alt text, reply gate", blueskyExtras({ language: "en", alt_text: "  a dog  ", reply_gate: "following" }), { langs: ["en"], alt: "a dog", replyGate: "following" });
check("bluesky: 'everyone' is not a gate", blueskyExtras({ reply_gate: "everyone" }), {});
check("bluesky: alt text capped at 1000", blueskyExtras({ alt_text: "x".repeat(1200) }).alt.length, 1000);
check("threadgate: nobody = empty allow list", blueskyThreadgateAllow("nobody"), []);
check("threadgate: mentioned", blueskyThreadgateAllow("mentioned"), [{ $type: "app.bsky.feed.threadgate#mentionRule" }]);
check("threadgate: followers", blueskyThreadgateAllow("followers"), [{ $type: "app.bsky.feed.threadgate#followerRule" }]);
check("bluesky: one adult label plus graphic media", blueskyExtras({ adult_label: "porn", graphic_media: true }).labels, ["porn", "graphic-media"]);
check("bluesky: junk adult label ignored", blueskyExtras({ adult_label: "spicy" }), {});
check("bluesky: quotes only sent when turned off", [blueskyExtras({ allow_quotes: true }), blueskyExtras({ allow_quotes: false })], [{}, { disableQuotes: true }]);
check("bluesky: self-labels record shape", blueskySelfLabels(["sexual"]), { $type: "com.atproto.label.defs#selfLabels", values: [{ val: "sexual" }] });

// --- Pinterest --------------------------------------------------------------
check("pinterest: valid link + alt text", pinterestExtras({ link: " https://clipdash.org/x ", alt_text: "alt" }), { link: "https://clipdash.org/x", alt_text: "alt" });
check("pinterest: link without scheme skipped", pinterestExtras({ link: "clipdash.org" }), {});
check("pinterest: javascript: link skipped", pinterestExtras({ link: "javascript:alert(1)" }), {});
check("pinterest: board section must be numeric", [pinterestExtras({ board_section_id: "123" }), pinterestExtras({ board_section_id: "abc" })], [{ board_section_id: "123" }, {}]);
check("pinterest: cover frame in whole seconds", pinterestExtras({ cover_offset_ms: 2900 }), { cover_image_key_frame_time: 2 });

// --- parseList --------------------------------------------------------------
check("parseList accepts arrays", parseList(["@a", " b ", 3]), ["a", "b"]);

console.log(failures === 0 ? "\nAll passed." : `\n${failures} failed.`);
process.exit(failures === 0 ? 0 : 1);
