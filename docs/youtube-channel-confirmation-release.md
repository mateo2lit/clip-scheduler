# YouTube channel confirmation: implementation and release checks

Implementation prepared in `.worktrees/youtube-channel-confirmation`, branch `feat/youtube-channel-confirmation`, from `c1622fd`. The shared checkout and its running processes were not changed. This implements the separate YouTube connection plan, not the long-form clipping/ChatGPT plugin plan.

## Implemented

- Existing settings and onboarding entry points can start the pending-confirmation flow. Google scopes, redirect URI, and the start response contract stay compatible.
- `/youtube/confirm` shows the current channel title, avatar, available handle and permanent channel link, then offers confirm, cancel, or choose another account.
- Pending credentials are encrypted with AES-256-GCM, bound to the attempt, and excluded from active account queries. Signed state, a per-attempt browser cookie, a one-time DB claim, user/team binding and repeated owner/admin checks protect the flow.
- Confirmation verifies the refresh credential against the displayed channel ID. A SQL transaction preserves existing account IDs, ownership fields and custom labels, checks reconnect snapshots, serializes conflicting confirms, and records the result for safe retries.
- Targeted reconnects cannot replace a channel with another channel. Canceling a reconnect leaves the active credentials unchanged and never revokes a Google grant.
- Settings and upload destinations expose canonical channel links. Verified metadata is displayed separately from editable labels. A rate-limited refresh retrieves metadata without altering the label or channel ID.
- A separately gated pre-upload lookup checks the same authenticated client that will upload. A mismatch, missing identity, or ambiguous result blocks media download and upload. Temporary lookup errors get one bounded retry and then the existing failed-post recovery path.
- YouTube's selected account lookup is team/provider scoped. Legacy one-account fallback remains; ambiguous fallback remains blocked. Shorts continue through existing polling, without a new upload.
- New tables use service-only access and cascading cleanup. Existing nightly maintenance purges expired attempts without blocking other token refresh work if the migration is absent.

## Changes to review

| Area | Files |
| --- | --- |
| Identity verification | `src/lib/youtubeIdentity.ts`, `src/lib/youtubeUpload.ts` |
| Pending connections | `src/lib/youtubeConnection.ts`, `src/lib/youtubeConnectionCrypto.ts` |
| OAuth routes | `src/app/api/auth/youtube/{start,callback,pending,confirm,cancel}/route.ts` |
| Metadata APIs | `src/app/api/platform-accounts/route.ts`, `src/app/api/youtube/identity/route.ts` |
| Screens | `src/app/youtube/confirm/page.tsx`, `src/components/YouTubeChannelIdentity.tsx`, settings/onboarding/uploads pages |
| Workers/errors | `src/app/api/worker/{run-scheduled,refresh-tokens}/route.ts`, `src/lib/postErrorMessages.ts` |
| Database | `supabase/migrations/20261002000000_youtube_channel_confirmation.sql` |
| Tests | `scripts/test-youtube-{connection,identity,account-api}.mjs`, `scripts/helpers/load-ts.mjs`; YouTube worker cases extend the existing worker harness in `scripts/test-bluesky-video.mjs` |

## Configuration — off by default

These server-only environment variables are new. No environment files or deployed settings were changed.

| Variable | Purpose |
| --- | --- |
| `YOUTUBE_CONNECTION_ENCRYPTION_KEY` | Exactly 64 hexadecimal characters representing a cryptographically random 32-byte key. Required before enabling confirmation. Store as an environment secret; do not put it in SQL or commit it. |
| `YOUTUBE_CONFIRMATION_TEAM_IDS` | Comma-separated team UUID allowlist for the new confirmation and metadata refresh flow. |
| `YOUTUBE_CONFIRMATION_ENABLED` | `true` enables that flow for all teams. Leave unset/false during the canary. |
| `YOUTUBE_IDENTITY_ENFORCEMENT_TEAM_IDS` | Independent team allowlist for upload verification. |
| `YOUTUBE_IDENTITY_ENFORCEMENT_ENABLED` | `true` enables upload verification for all teams. Leave unset/false during the canary. |

Existing `OAUTH_STATE_SECRET`, Google credentials, Supabase credentials, and site URL settings are reused unchanged. Keep the encryption key stable while pending attempts exist. Do not reuse it for other purposes. Flags do not bypass authorization, and turning a flag off does not invalidate pending versioned attempts.

## Validation completed locally

- Baseline: 24 existing Node test entries pass; TypeScript passes.
- Implementation: 72 Node test entries pass, including existing platform/settings/Meta/Bluesky/AI Clips tests and new identity/connection/account API/YouTube worker tests. Some existing script entries contain multiple assertions beyond that count.
- TypeScript: `node ../../node_modules/typescript/bin/tsc --noEmit --incremental false -p .` passes in the isolated checkout using existing installed dependencies.
- `git diff --check` passes.
- Production build compiles and passes type validation, then fails while generating `/blog/[slug]/opengraph-image` with `TypeError: Invalid URL` inside `@vercel/og` on Windows. A separate unchanged checkout at `c1622fd` reproduces the same failure. This is not a green full build. Require a supported-environment build before release.
- Build inputs used placeholder environment values, not production credentials. No dependencies were installed and no live database/OAuth/publishing calls were made.

The local mocked tests validate application behavior, not PostgreSQL lock execution or Google consent UI. PostgreSQL/psql/Docker and a browser automation runtime were not available in this environment. The migration has **not been applied or executed against PostgreSQL**, and real-browser OAuth testing remains a release gate. Do not treat these outstanding checks as passed.

Run the test suite from this worktree with `node --test scripts/test-*.mjs`. For a normal checkout with installed dependencies, typecheck with `node node_modules/typescript/bin/tsc --noEmit --incremental false -p .`.

## Database acceptance gate

In a disposable local/staging database with the current ClipDash schema, apply the migration and verify:

1. Existing account/post rows, account IDs, labels, ownership, and destination references are unchanged by migration. Old application code can run with the extra tables present.
2. Anonymous and authenticated client roles cannot read/write any of the three new tables or execute any new RPC. Service-role functions remain server-only; routes enforce team/user/role checks.
3. Confirm a new pending attempt: exactly one account row, one identity row, and a confirmed attempt with no credential envelope result. Repeat confirmation: same account ID.
4. Reconnect an existing account: its ID, `user_id`, label and `profile_name` remain unchanged while credentials and canonical display metadata update. An omitted refresh token uses only that exact existing channel's stored credential.
5. From separate database sessions, race two confirms of the same attempt, then two distinct attempts for the same channel. One durable account results. A stale attempt cannot overwrite a newer confirmation.
6. Race confirm against cancel, account deletion, role removal and expiry. Either the authorized transaction wins or it rolls back; no partial credential/identity writes and no canceled attempt resurrection.
7. Change the stored refresh token/account after callback but before confirm. Snapshot comparison rejects confirmation; the newer connection remains intact.
8. Disconnect/delete an account involved in a pending reconnect: pending secrets and identity metadata cascade away. Deleting a user/team also removes its attempts.
9. Confirm failure partway through the transaction rolls back all account, identity and attempt writes.
10. Run cleanup: expired attempts lose their credential envelope; confirmed outcomes remain available for the retry window; old terminal rows are deleted. Test the metadata refresh throttle under concurrency.

Audit existing YouTube rows with missing/placeholder channel IDs and malformed account/team references before enabling upload enforcement. Do not repair IDs by guessing from names. Inspect aggregate results or safe account IDs only, never token values.

## Rollout and regression gate

1. Review/merge the isolated changes after checking what the other window has changed. Do not copy whole files over newer work. The existing pre-push hook may run database migrations; do not push casually as a validation step.
2. Complete the database acceptance gate and a supported-environment build. Deploy the additive migration separately, then compatible app code with all new flags off. Verify existing settings, onboarding, account selection, and publishing first.
3. Set the encryption secret and enable confirmation only for an owned test team. Test a personal channel, Brand Account, renamed channel, two channels under one Google login, missing handle/avatar, cancellation, back/reload, concurrent tabs, expiry, loss of permissions, and settings/onboarding return paths.
4. Confirm the creator's case: a differently named Google Brand Account resolves to the correct current title/handle/permanent ID, and no account becomes publishable before explicit confirmation.
5. Enable identity enforcement for the test team. With explicit permission for real posts, upload a private test video and inspect its resulting channel ID. Test Shorts processing, playlist/thumbnail behavior, defaults, tags/language/privacy/kids/AI settings, and reconnect without moving existing scheduled destinations.
6. Verify a blocked YouTube post can be retried after repair using existing recovery controls, without replaying successful posts in its group. Verify seven other providers continue their normal worker paths. Smoke-test comments, analytics, playlists, drafts, calendar, AI Clips handoff, billing/defaults, account deletion and maintenance.
7. Expand the allowlists gradually only after observing normal connection success, post completion, queue throughput and identity-check latency. Google lookups are bounded to eight seconds each; one retry adds up to roughly sixteen seconds plus refresh-token acquisition, so include worker time-budget checks.

No deployment, live connection changes, private/public posts, paid provisioning or public submission are authorized by merely running the local tests. Those operations remain separate release steps under the approved plan.

## Retention, operations and rollback

- Attempts stop being usable after 15 minutes. Confirmation/cancel/failure clears the encrypted payload immediately; an expired attempt accessed through the authenticated API is also scrubbed. Abandoned attempts are physically scrubbed at the next existing nightly maintenance run. Thus expiry is immediate, but unattended ciphertext can remain until that run (normally less than 24 hours); monitor maintenance failures. If stricter physical deletion is required, increase cleanup frequency before rollout.
- Terminal attempt metadata is retained until 24 hours after expiry for confirmation response retries, then purged by maintenance. No permanent media library or new video retention policy is introduced.
- Failed identity checks use existing `failed` status and notifications. Existing cleanup can remove terminal-post media after seven days; recovery is not indefinite. No automatic repost loop was added.
- Connection logs contain only event names and attempt IDs. Upload verification failures contain an account ID and a fixed error code. They never include raw Google errors, OAuth codes, tokens or state. Use these events for rollout monitoring.
- `channels.list` adds lookup quota/latency at callback, confirmation, explicit refresh and verified uploads, not every account-list render or Shorts poll. Keep the cohort small until this cost is measured.
- For UI problems, stop new attempts by clearing confirmation allowlists/disabling the flag; preserve versioned callback/pending handlers and the encryption key until attempts drain. Old signed callback handling remains for pre-rollout attempts.
- Do not drop additive tables on rollback or revert account credentials/data. Do not disable the shared worker. A known identity mismatch must remain blocked; fix or hold affected YouTube posts rather than bypassing the guard for those accounts.

## Deliberately separate follow-ups

Google OAuth scope minimization, a shared OAuth redesign, generalized publishing retry/idempotency changes, and the long-form clipping/ChatGPT plugin work are not part of this implementation. This change preserves their existing contracts and does not claim to solve pre-existing ambiguous upload-timeout duplication risks.
