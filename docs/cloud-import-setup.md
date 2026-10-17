# Google Drive and Dropbox import: setup

The code ships dark. Each button appears only once its env vars are set, so the branch can be
merged before any of this is done.

## How it works

1. The upload page shows **Google Drive** and **Dropbox** buttons under "Import from URL"
   ([CloudImportButtons.tsx](../src/app/uploads/CloudImportButtons.tsx)).
2. The user picks a video in the provider's own picker. The browser sends `/api/imports/cloud`
   a short-lived credential: a Drive access token (scope `drive.file`, which opens only the
   picked file, lasts 1 hour) or a Dropbox direct link (lasts 4 hours).
3. The route ([route.ts](../src/app/api/imports/cloud/route.ts)) asks the provider for the real
   name and size, checks the 2 GB cap and the plan's storage, creates an `import_jobs` row, stores
   the credential in `import_job_secrets` (RLS on, no policies), and dispatches
   `import-cloud.yml` with **only `job_id`**.
4. The workflow reads the credential from the DB, masks it, downloads to the runner's disk with
   no secret on any command line, deletes the credential row, checks that the file is a video,
   and uploads it to the `clips` bucket **as-is** (no re-encode, like a direct upload). Then it
   creates the `uploads` row.
5. The same progress modal as URL import tracks the job. "Schedule this video" loads it into
   the form.

The repo is public, so Actions inputs and logs are readable by anyone. Never pass the
credential as an input or echo it.

## One-time setup

### 1. Database
Run [supabase/migrations/20261016_import_jobs_cloud.sql](../supabase/migrations/20261016_import_jobs_cloud.sql)
in the Supabase SQL editor. It assumes `import_jobs.id` is a `uuid`; if it isn't, change the
`job_id` column type to match.

### 2. Workflow on main
`/api/imports/cloud` dispatches `import-cloud.yml` on `ref: main`. GitHub can only dispatch a
workflow that exists on that branch, so imports fail with a dispatch error until this branch is
merged.

### 3. Dropbox
1. https://www.dropbox.com/developers/apps → **Create app** → Scoped access → Full Dropbox
   (the Chooser doesn't use the app's API scopes) → name it, e.g. "Clip Dash".
2. Settings → **Chooser / Saver / Embedder domains**: add `clipdash.org`,
   `clip-scheduler.vercel.app` and `localhost`.
3. Copy the **App key** (not the secret) → Vercel env `NEXT_PUBLIC_DROPBOX_APP_KEY`, and the same
   in `.env.local`.

Known limit: Dropbox Business teams whose admin blocks shared links can't use the Chooser.

### 4. Google Drive
In the Google Cloud project that already holds the YouTube OAuth client:
1. **APIs & Services → Library**: enable **Google Drive API** and **Google Picker API**.
2. **Credentials → Create credentials → API key**. Restrict it to *HTTP referrers*
   `https://clipdash.org/*`, `https://clip-scheduler.vercel.app/*` and `http://localhost:3000/*`,
   and to the APIs *Google Picker API* and *Google Drive API*.
   → `NEXT_PUBLIC_GOOGLE_PICKER_API_KEY`.
3. **Credentials → the existing OAuth web client**: add **Authorized JavaScript origins**
   `https://clipdash.org`, `https://clip-scheduler.vercel.app` and `http://localhost:3000`.
   Copy its client ID → `NEXT_PUBLIC_GOOGLE_CLIENT_ID` (the same value as `GOOGLE_CLIENT_ID`;
   client IDs are public).
4. **OAuth consent screen → Data access**: add the scope
   `https://www.googleapis.com/auth/drive.file`. Google lists it as non-sensitive, so it doesn't
   need the restricted-scope security assessment. If the console asks for re-verification, the
   justification is: "Users pick a video in the Google Picker; we download only that file once to
   schedule it to their social accounts."
5. **Project number** (Cloud console home → Project info) → `NEXT_PUBLIC_GOOGLE_PROJECT_NUMBER`.
   The Picker uses it to grant `drive.file` access to the picked file.

YouTube connect is unaffected: Drive is a separate, incremental token request in the browser,
and no Drive refresh token is ever stored.

### 5. Privacy policy
Google's API user-data policy requires a disclosure. Add something like: "If you import from
Google Drive or Dropbox, Clip Dash downloads only the file you pick, stores it like any upload,
and keeps no ongoing access to your account."

### 6. Test (after merge and deploy)
- [ ] Dropbox: pick an MP4 under 50 MB → progress → "Schedule this video" → preview plays.
- [ ] Drive: first pick shows Google's consent; the second pick within the hour skips it.
- [ ] Drive file in a shared drive.
- [ ] A ~1 GB file (checks Actions transfer time and the Supabase upload).
- [ ] A file over the storage limit is refused before any download.
- [ ] Open the Actions run log: no token or dropboxusercontent link appears.
- [ ] `import_job_secrets` is empty after success and after a failure.
