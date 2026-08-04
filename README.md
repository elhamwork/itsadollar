# It's a Dollar

A $1/month membership site. Static front end (no build step) + two Vercel
serverless functions in `/api` that create and look up Stripe Checkout
Sessions for the $1/month subscription.

## Deploy to Vercel

1. **Import the repo.** In the [Vercel dashboard](https://vercel.com/new),
   import this GitHub repository. No build settings are needed — it's
   detected as a static site with `/api` functions automatically.
2. **Set the environment variable.** In Project Settings → Environment
   Variables, add:
   - `STRIPE_SECRET_KEY` — a Stripe **test** secret key (`sk_test_...`) from
     https://dashboard.stripe.com/test/apikeys. Apply it to Production,
     Preview, and Development.
3. **Deploy.** Vercel builds and gives you a URL. Open `/join.html` there and
   complete a checkout with a [Stripe test card](https://stripe.com/docs/testing),
   e.g. `4242 4242 4242 4242`, any future expiry, any CVC.

Or via CLI, from the repo root:

```
npm i -g vercel
vercel link
vercel env add STRIPE_SECRET_KEY
vercel --prod
```

## Local development

```
npm install
vercel dev
```

`vercel dev` serves the static pages and the `/api` functions together on
one local port, matching production. It reads `STRIPE_SECRET_KEY` from
`.env` — copy `.env.example` to `.env` and fill in a test key first.

## Apple Pay

Apple Pay appears automatically on Stripe's hosted Checkout page for
visitors on Safari (macOS or iOS) with a card in Wallet — no domain
verification needed, since Checkout runs on Stripe's own verified domain.

## Going live

This uses a `price_data` object created inline per checkout, so nothing
needs to be pre-configured in the Stripe dashboard. When ready for real
charges, swap `STRIPE_SECRET_KEY` for a live key (`sk_live_...`) — everything
else stays the same.

Worth reading before flipping to live: standard card fees (~2.9% + $0.30)
take roughly a third of every $1 charge. Batching to an annual charge
presented as "$1/month," or using a zero-fee donation platform, avoids that.
