# Supabase auth emails and redirect URLs

Settings that live in the Supabase dashboard, not in this repo.

## Why the email links matter

The browser client (`@supabase/ssr`) uses the PKCE flow. A default Supabase email link
ends in `?code=...`, and that code can only be used in the **same browser** that asked
for the email, because the browser stored a secret when the user clicked the button.
Opening a "Forgot password" email on a phone after requesting it on a laptop therefore
fails.

Links with a **token hash** work in any browser. The app handles them at `/auth/confirm`
(`src/app/auth/confirm/page.tsx`).

## Email templates (Authentication → Emails → Templates)

**Reset password**: make the link:

```
{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery
```

**Confirm signup**: make the link:

```
{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email
```

Keep the rest of each template's wording as it is. The old `{{ .ConfirmationURL }}`
links keep working through `/auth/callback` until the templates are changed.

## Redirect URLs (Authentication → URL Configuration)

Supabase only sends people back to addresses on this list. Anything else falls back to
the Site URL root (`https://clipdash.org/?code=...`); the middleware now forwards that to
`/auth/callback`, but a `?code=` link opened on a different site than the one that asked
for it still can't work.

- Production: `https://clipdash.org/**`
- Vercel previews: `https://clip-scheduler-*-<vercel-account-slug>.vercel.app/**`.
  Copy the slug from a preview URL. Don't use `https://clip-scheduler-*.vercel.app/**`:
  anyone can create a Vercel project whose address matches that, and would then receive
  sign-in links.
