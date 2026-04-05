# AI Clips — Extra Minutes Purchasing

**Date:** 2026-04-05
**Status:** Approved

## Overview

Allow Team plan users to purchase additional AI Clips processing minutes beyond the included 300 min/month. Two purchase types: one-time top-up packs and a recurring monthly add-on. Purchased minutes stack on top of the monthly included minutes and never expire. Owner-only purchase permission.

---

## Data Model

### Migration

```sql
ALTER TABLE teams
  ADD COLUMN IF NOT EXISTS extra_clip_minutes INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS stripe_addon_subscription_id TEXT,
  ADD COLUMN IF NOT EXISTS stripe_addon_cancel_at_period_end BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE ai_clip_jobs
  ADD COLUMN IF NOT EXISTS extra_minutes_used FLOAT NOT NULL DEFAULT 0;
```

### `teams.extra_clip_minutes`
Running balance of purchased minutes. Incremented by Stripe webhook on purchase or monthly renewal. Decremented at job prepare time when monthly included minutes are exhausted.

### `teams.stripe_addon_subscription_id`
Set when the team activates the recurring add-on. Cleared when the subscription fully expires. Used to identify renewal invoices and to surface a "cancel add-on" option in settings.

### `teams.stripe_addon_cancel_at_period_end`
Set to `true` when the owner requests cancellation. The subscription stays active until period end; this flag drives the UI ("Cancels at end of period" vs "Cancel add-on"). Cleared alongside `stripe_addon_subscription_id` when `customer.subscription.deleted` fires.

### `ai_clip_jobs.extra_minutes_used`
How many extra (purchased) minutes this job consumed, recorded at prepare time. Used to refund the correct amount back to `extra_clip_minutes` if the job fails.

---

## Credit Logic (`/api/ai-clips/prepare`)

Current: `monthly_used + new_duration <= 300`

New:

1. Fetch `team.extra_clip_minutes` alongside existing plan check
2. `monthly_remaining = max(0, 300 - monthly_used_this_month)`
3. `total_available = monthly_remaining + extra_clip_minutes`
4. If `new_duration > total_available` → reject 429 with remaining breakdown
5. If `new_duration <= monthly_remaining` → allow, `extra_minutes_used = 0`
6. If `new_duration > monthly_remaining` → allow, `overflow = new_duration - monthly_remaining`, decrement `extra_clip_minutes` by overflow, set `extra_minutes_used = overflow` on job row

**Failure refund:** The "Mark failed" step in `ai-clips.yml` already patches the job row via Supabase REST. Add a conditional: if `extra_minutes_used > 0`, increment `teams.extra_clip_minutes` by that amount in the same step.

---

## Stripe Products

Four new Stripe price objects to create in the dashboard:

| Product | Type | Minutes | Price | Env var |
|---------|------|---------|-------|---------|
| Top-up 300 min | one-time | 300 | TBD | `STRIPE_TOPUP_300_PRICE_ID` |
| Top-up 600 min | one-time | 600 | TBD | `STRIPE_TOPUP_600_PRICE_ID` |
| Add-on +300/mo | recurring monthly | 300 | $4.99/mo | `STRIPE_ADDON_300_PRICE_ID` |

Also add `NEXT_PUBLIC_*` variants for all four (needed by frontend checkout calls).

---

## API Routes

### `POST /api/stripe/checkout-credits`

Owner-only. Accepts `{ priceId, minutes }`. Creates a Stripe Checkout session:
- `mode: 'payment'` for top-up price IDs
- `mode: 'subscription'` for the add-on price ID
- `metadata: { team_id, minutes }` on all sessions
- `success_url`: `/settings?tab=billing&credits=success`
- `cancel_url`: `/settings?tab=billing`

Returns `{ url }`.

### `POST /api/stripe/cancel-addon`

Owner-only. Calls `stripe.subscriptions.update({ cancel_at_period_end: true })` on `teams.stripe_addon_subscription_id`. Sets `teams.stripe_addon_cancel_at_period_end = true`. Does NOT clear the subscription ID (needed for future webhook matching). The UI switches from "Cancel add-on" to "Cancels at end of period".

---

## Webhook Additions (`/api/stripe/webhook`)

Add cases to the existing `switch (event.type)` block:

### `checkout.session.completed`

Already handled for subscriptions. Add branch:

```
if session.mode === 'payment' and session.payment_status === 'paid':
  minutes = parseInt(session.metadata.minutes)
  team_id = session.metadata.team_id
  increment teams.extra_clip_minutes by minutes where id = team_id
```

Also handle add-on subscription checkout:
```
if session.mode === 'subscription' and price matches STRIPE_ADDON_300_PRICE_ID:
  increment teams.extra_clip_minutes by 300
  set teams.stripe_addon_subscription_id = session.subscription
```

### `invoice.payment_succeeded`

New case. Fires on every successful recurring charge (including renewals):
```
if invoice.subscription matches a team's stripe_addon_subscription_id:
  skip the first cycle (already credited at checkout.session.completed)
  on renewal: increment teams.extra_clip_minutes by 300
```

To distinguish first vs renewal: check `invoice.billing_reason`. If `'subscription_create'` → skip (already handled). If `'subscription_cycle'` → credit 300.

### `customer.subscription.deleted`

Already handled for plan cancellations. Add branch:
```
if subscription.id matches a team's stripe_addon_subscription_id:
  set teams.stripe_addon_subscription_id = null
  set teams.stripe_addon_cancel_at_period_end = false
```

---

## UI

### AI Clips page — existing "Add more credits" button

Opens a modal with four purchase options laid out as cards:

- 2 top-up packs (one-time): "300 min" and "600 min" at their respective prices
- 1 recurring: "+300 min/mo — $4.99/mo" (badge: "Best value")

Selecting any option calls `POST /api/stripe/checkout-credits` and redirects to the returned Stripe URL.

Modal also shows current balance: "You have X extra minutes + Y monthly minutes remaining."

### Settings > Billing — new "AI Clips Minutes" card

Positioned below the plan card. Shows:
- Monthly included: `X / 300 min used this month`
- Extra balance: `N extra minutes available`
- Same 4 purchase option cards as above
- If `stripe_addon_subscription_id` is set: "Active: +300 min/mo add-on" with a "Cancel add-on" button that calls `POST /api/stripe/cancel-addon`

---

## Error States

- Purchase attempt by non-owner: show "Only the team owner can purchase minutes"
- Stripe checkout failure: toast error, stay on page
- Job rejected for insufficient minutes: existing 429 error message updated to show breakdown: `X monthly + Y extra minutes available, need Z`

---

## Environment Variables

New variables required (add to `.env.local` and Vercel):

```
STRIPE_TOPUP_300_PRICE_ID=
STRIPE_TOPUP_600_PRICE_ID=
STRIPE_ADDON_300_PRICE_ID=
NEXT_PUBLIC_STRIPE_TOPUP_300_PRICE_ID=
NEXT_PUBLIC_STRIPE_TOPUP_600_PRICE_ID=
NEXT_PUBLIC_STRIPE_ADDON_300_PRICE_ID=
```
