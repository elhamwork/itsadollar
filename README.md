# It's a Dollar

A $1/month membership site. Static front end (no build step) + Vercel
serverless functions in `/api` for:

- Stripe Checkout for the $1/month subscription, billed on the **15th of
  every month** for everyone (first charge happens immediately at signup)
- A monthly **vote**: once a cycle's money is in, every member gets emailed
  a link to pick which of 2–4 causes it goes to
- A **referral** system: sharing your link earns 10 points when someone
  joins through it. Every vote starts at weight 1; spending points boosts
  your own pick's weight 1:1 (10 points spent = +10 to your cause's tally).
  Anyone can also pay to boost directly with real money — $1 = +1 weight,
  no points required — via a separate one-time Stripe Checkout
- A public, provable **donations log** (`impact.html`) showing what was
  actually given each cycle
- A password-protected **admin page** (`/admin.html`, not linked from the
  site) to open a cycle with its causes, close a cycle by recording the
  real donation made, view every member in a table, push vote-link emails
  on demand instead of waiting for the 15th, and broadcast an announcement
  to every member
- Member **self-service** (`/manage.html`) — enter your email, get dropped
  into Stripe's hosted billing portal to update your card or cancel,
  without emailing anyone
- `/terms.html` and `/privacy.html` — plain-language starting points, not
  reviewed by a lawyer (see the note at the top of each page)

## Setup overview

This needs four things provisioned before it fully works: Stripe (checkout
+ webhook), a Postgres database, an email sender (Brevo), and a handful of
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
  `STRIPE_WEBHOOK_SECRET`. This one event covers both membership signups and
  paid boosts (the handler branches on the session's mode) — without it,
  neither members nor paid boosts ever actually land in the database, even
  though Stripe shows the payment as successful.
- **Customer Portal**: `/manage.html` uses Stripe's hosted Customer Portal,
  which needs a one-time activation at
  https://dashboard.stripe.com/test/settings/billing/portal before it'll
  work — visiting that page and saving the default settings is enough.

### 3. Brevo (vote-link emails)

Sign up at https://www.brevo.com (free tier: 300 emails/day) and create an
API key under **Settings → SMTP & API → API Keys** → `BREVO_API_KEY`. Then
add a sender under **Settings → Senders, Domains & Dedicated IPs → Senders**
— Brevo requires the exact `EMAIL_FROM` address to be a verified sender
before it'll let you send from it (a quick email-confirmation click, no
domain ownership needed for a single address). Set
`EMAIL_FROM="It's a Dollar <hello@yourdomain.org>"` to that verified
address. Sends will fail with an error from Brevo until the sender is
verified.

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

Every public page also loads `/_vercel/insights/script.js` for Vercel Web
Analytics — a free, cookie-free, privacy-friendly pageview tracker with no
banner required. It's a no-op until you flip it on: Vercel dashboard → your
project → **Analytics** tab → **Enable**.

Or via CLI, from the repo root:

```
npm i -g vercel
vercel link
vercel env add STRIPE_SECRET_KEY
vercel env add STRIPE_WEBHOOK_SECRET
vercel env add ADMIN_PASSWORD
vercel env add ADMIN_SESSION_SECRET
vercel env add VOTE_TOKEN_SECRET
vercel env add BREVO_API_KEY
vercel env add CRON_SECRET
vercel --prod
```

## Running a cycle

1. Go to `/admin.html`, log in, and open a cycle with 2–4 cause names.
2. On the 15th, Vercel Cron (configured in `vercel.json`) automatically
   emails every member a link to `/vote.html` shortly after that day's
   charges land. You can also click **Send vote emails now** on the open
   cycle's panel to send them immediately instead of waiting.
3. Members vote (weight 1) and can spend any points they have to boost
   their own pick further — 1 point = +1 weight, or they can pay directly
   ($1 = +1 weight) without needing points at all. `/admin.html` shows live
   tallies with the leading cause highlighted while the cycle is open.
4. When you've actually sent the money, go back to `/admin.html`, pick the
   winning cause, enter the amount and a proof link, and close the cycle.
   It immediately appears on `/impact.html`.

`/admin.html` also has a **Send an announcement** panel — write a subject
and message and it goes out to every current member, for anything outside
the monthly vote cycle (updates, news, anything you want to tell everyone).

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

`api/create-checkout-session.js` charges the full amount today, as a normal
subscription creation — no `billing_cycle_anchor` at this step. Setting the
anchor at creation time with `proration_behavior: "none"` charges nothing
for the stub period and waits until the anchor for the *first* charge,
which isn't what "charged today, then aligned to the 15th" means.

Instead, `api/webhooks/stripe.js` reschedules the anchor *after* payment is
confirmed, via `stripe.subscriptions.update(..., { billing_cycle_anchor,
proration_behavior: "none" })`. Run as an update on an already-paid
subscription, this doesn't trigger a second charge — it just moves which
day future renewals land on. The vote-email cron is scheduled for 16:00
UTC on the 15th, an hour after the anchor, to give that day's charges time
to settle.

## Optional fee coverage

The join form has a checkbox (checked by default) letting a member add 35¢
to their monthly charge to cover Stripe's processing fee — otherwise around
a third of every $1 goes to card fees rather than the cause. Unchecking it
charges exactly $1/month instead. This applies to the whole recurring
subscription amount, not just the first charge.

## Going live

When ready for real charges, swap `STRIPE_SECRET_KEY` (and the webhook's
signing secret) for live-mode equivalents — everything else stays the same.

Worth reading before flipping to live: standard card fees (~2.9% + $0.30)
take roughly a third of every $1 charge. Batching to an annual charge
presented as "$1/month," or using a zero-fee donation platform, avoids that.

## What I couldn't test myself

This was all built and reviewed in an environment with no outbound access
to Stripe, Postgres, Brevo, or Vercel — I verified every pure function
(token signing/verification, referral code generation) with unit-style
checks, and every page's UI with mocked API responses, but the real,
end-to-end path — webhook delivery, billing anchor behavior, cron firing,
email delivery — needs verification against your actual deployment. Test
one full cycle (join → webhook creates member → vote email → vote →
close cycle → shows on `/impact.html`) before relying on it.
