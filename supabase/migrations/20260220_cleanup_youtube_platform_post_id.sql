-- One-time cleanup: normalize YouTube platform_post_id values to canonical 11-char video IDs.
-- Applies only to scheduled_posts rows where provider = 'youtube'.

WITH normalized AS (
  SELECT
    id,
    platform_post_id,
    CASE
      WHEN btrim(platform_post_id) ~ '^[A-Za-z0-9_-]{11}$' THEN btrim(platform_post_id)
      WHEN platform_post_id ~* 'https?://(www\.)?youtube\.com/watch\?' THEN substring(platform_post_id FROM '[?&]v=([A-Za-z0-9_-]{11})')
      WHEN platform_post_id ~* 'https?://(www\.)?youtu\.be/' THEN substring(platform_post_id FROM 'youtu\.be/([A-Za-z0-9_-]{11})')
      WHEN platform_post_id ~* 'https?://(www\.)?youtube\.com/(shorts|embed|live)/' THEN substring(platform_post_id FROM 'youtube\.com/(?:shorts|embed|live)/([A-Za-z0-9_-]{11})')
      ELSE NULL
    END AS normalized_video_id
  FROM scheduled_posts
  WHERE provider = 'youtube'
    AND platform_post_id IS NOT NULL
)
UPDATE scheduled_posts sp
SET platform_post_id = n.normalized_video_id
FROM normalized n
WHERE sp.id = n.id
  AND n.normalized_video_id IS NOT NULL
  AND sp.platform_post_id IS DISTINCT FROM n.normalized_video_id;

-- Verification query #1: counts after normalization.
-- "invalid_rows" are rows that still do not contain a canonical 11-char video ID.
SELECT
  COUNT(*) FILTER (WHERE provider = 'youtube' AND platform_post_id IS NOT NULL) AS youtube_rows_with_post_id,
  COUNT(*) FILTER (WHERE provider = 'youtube' AND platform_post_id ~ '^[A-Za-z0-9_-]{11}$') AS canonical_rows,
  COUNT(*) FILTER (
    WHERE provider = 'youtube'
      AND platform_post_id IS NOT NULL
      AND platform_post_id !~ '^[A-Za-z0-9_-]{11}$'
  ) AS invalid_rows
FROM scheduled_posts;

-- Verification query #2: sample unresolved rows for manual cleanup.
SELECT id, team_id, title, platform_post_id, posted_at
FROM scheduled_posts
WHERE provider = 'youtube'
  AND platform_post_id IS NOT NULL
  AND platform_post_id !~ '^[A-Za-z0-9_-]{11}$'
ORDER BY posted_at DESC NULLS LAST
LIMIT 100;
