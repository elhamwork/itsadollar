# It's a Dollar

A $1/month membership site. Static front end (no build step) + Vercel
serverless functions in `/api` for:

- Stripe Checkout for the $1/month subscription, billed on the **15th of
  every month** for everyone (first charge happens immediately at signup)
- A monthly **vote**: once a cycle's money is in, every member gets emailed
  a link to pick which of 2–4 causes it goes to
- A **referral** system: sharing your link earns 10 points when someone
  joins through it; 10 points buys an extra vote in the current cycle
- A public, provable **donations log** (`impact.html`) showing what was
  actually given each cycle
- A password-protected **admin page** (`/admin.html`, not linked from the
  site) to open a cycle with its causes, and to close a cycle by recording
  the real donation made

## Setup overview

This needs four things provisioned before it fully works: Stripe (checkout
+ webhook), a Postgres database, an email sender (Resend), and a handful of
generated secrets. None of these can be set up on your behalf from a chat
session — they all require accounts only you can create. Steps below.

### 1. Vercel Postgres

In your Vercel project → **Storage** tab → **Create Database** → **Postgres**.
This auto-injects `POSTGRES_URL` (and related vars) into your project's
environment — no manual copy-pasting needed for deployed environments.

Then run the schema once:

```
vercel env pull .env.local
npm install
npm run migrate
```

(`npm run migrate` runs `schema.sql` against whatever `POSTGRES_URL` is in
`.env.local`.)

> Note: `@vercel/postgres` is deprecated in favor of Vercel's native Neon
> integration, but still works today against the same "Postgres" storage
> you create above. If Vercel removes it later, swapping to
> `@neondatabase/serverless` is a small change — same `sql` tagged-template
> API by design.

### 2. Stripe

- **Secret key**: `STRIPE_SECRET_KEY` — a **test** key (`sk_test_...`) from
  https://dashboard.stripe.com/test/apikeys to start.
- **Webhook**: Stripe Dashboard → Developers → Webhooks → **Add endpoint**,
  URL = `https://<your-domain>/api/webhooks/stripe`, event =
  `checkout.session.completed`. Copy the signing secret it gives you into
  `STRIPE_WEBHOOK_SECRET`. This webhook is what actually creates a member
  record and credits referral points after a successful payment — without
  it, nobody shows up in the database.

### 3. Resend (vote-link emails)

Sign up at https://resend.com (fastest via GitHub, no card) and create an
API key → `RESEND_API_KEY`. For real delivery to arbitrary member inboxes
(not just your own account email), verify a sending domain under **Domains**
and set `EMAIL_FROM` to an address on it, e.g.
`EMAIL_FROM="It's a Dollar <hello@yourdomain.org>"`. Until you do, emails
send from Resend's shared test address and may not reliably reach inboxes
outside your own Resend account.

### 4. Generated secrets

Run `openssl rand -hex 32` three times for:

- `ADMIN_PASSWORD` — actually, make this a real memorable-but-long
  passphrase you'll type in, not a hex string
- `ADMIN_SESSION_SECRET`
- `VOTE_TOKEN_SECRET`
- `CRON_SECRET` (optional but recommended — see below)

Add all of the above as environment variables in Vercel Project Settings →
Environment Variables (Production + Preview + Development), or via
`vercel env add <NAME>`.

## Deploy to Vercel

1. **Import the repo** at https://vercel.com/new — no build settings needed,
   it's detected as a static site with `/api` functions automatically.
2. **Set every environment variable** from the setup steps above.
3. **Deploy.**
4. Open `/join.html` on the deployed URL and complete a checkout with a
   [Stripe test card](https://stripe.com/docs/testing), e.g.
   `4242 4242 4242 4242`, any future expiry/CVC. Confirm a row appears in
   your `members` table (via Vercel's Postgres dashboard, or
   `psql "$POSTGRES_URL" -c 'select * from members;'`).

Or via CLI, from the repo root:

```
npm i -g vercel
vercel link
vercel env add STRIPE_SECRET_KEY
vercel env add STRIPE_WEBHOOK_SECRET
vercel env add ADMIN_PASSWORD
vercel env add ADMIN_SESSION_SECRET
vercel env add VOTE_TOKEN_SECRET
vercel env add RESEND_API_KEY
vercel env add CRON_SECRET
vercel --prod
```

## Running a cycle

1. Go to `/admin.html`, log in, and open a cycle with 2–4 cause names.
2. On the 15th, Vercel Cron (configured in `vercel.json`) automatically
   emails every member a link to `/vote.html` shortly after that day's
   charges land.
3. Members vote. Anyone with 10+ points can spend them for an extra pick.
4. When you've actually sent the money, go back to `/admin.html`, pick the
   winning cause, enter the amount and a proof link, and close the cycle.
   It immediately appears on `/impact.html`.

Only one cycle can be open at a time — close the current one before
opening the next.

## Local development

```
npm install
vercel env pull .env.local
vercel dev
```

`vercel dev` serves the static pages and the `/api` functions together on
one local port, matching production, and reads env vars from `.env.local`.

## Apple Pay

Apple Pay appears automatically on Stripe's hosted Checkout page for
visitors on Safari (macOS or iOS) with a card in Wallet — no domain
verification needed, since Checkout runs on Stripe's own verified domain.

## Billing: everyone lands on the 15th

`api/create-checkout-session.js` sets a `billing_cycle_anchor` on the
subscription to the next occurrence of the 15th (15:00 UTC), with
`proration_behavior: "none"`. That means: the first charge is a full $1
today, and every charge after that — including the second one — lands on
the 15th. The vote-email cron is scheduled for 16:00 UTC on the 15th, an
hour after the anchor, to give that day's charges time to settle.

## Going live

When ready for real charges, swap `STRIPE_SECRET_KEY` (and the webhook's
signing secret) for live-mode equivalents — everything else stays the same.

Worth reading before flipping to live: standard card fees (~2.9% + $0.30)
take roughly a third of every $1 charge. Batching to an annual charge
presented as "$1/month," or using a zero-fee donation platform, avoids that.

## What I couldn't test myself

This was all built and reviewed in an environment with no outbound access
to Stripe, Postgres, Resend, or Vercel — I verified every pure function
(token signing/verification, referral code generation) with unit-style
checks, and every page's UI with mocked API responses, but the real,
end-to-end path — webhook delivery, billing anchor behavior, cron firing,
email delivery — needs verification against your actual deployment. Test
one full cycle (join → webhook creates member → vote email → vote →
close cycle → shows on `/impact.html`) before relying on it.
