# It's a Dollar — API (Stripe sandbox)

Creates a Stripe Checkout Session for the $1/month membership and hands the
join flow a URL to redirect to. Card entry (including Apple Pay / Google Pay,
where the browser supports them) happens on Stripe's own hosted page — no
card data ever touches this server or the static site.

## Setup

```
cd server
npm install
cp .env.example .env
```

Edit `.env` and set `STRIPE_SECRET_KEY` to a **test** secret key from
https://dashboard.stripe.com/test/apikeys (starts with `sk_test_`).

## Run

```
npm start
```

Listens on `http://localhost:4242` by default.

## Serving the site alongside it

The static site (in the repo root) needs to point at this API. Open
`assets/js/checkout.js` and confirm `API_BASE` matches where this server is
running (defaults to `http://localhost:4242`). Serve the site itself with
any static server, e.g. from the repo root:

```
python3 -m http.server 8123
```

Then open `http://localhost:8123/join.html` and complete a checkout using a
[Stripe test card](https://stripe.com/docs/testing), e.g. `4242 4242 4242 4242`
with any future expiry, any CVC, and any ZIP.

## Apple Pay

Apple Pay appears automatically on Stripe's hosted Checkout page when the
visitor is on Safari (macOS or iOS) with a card in Wallet — no domain
verification or extra integration is required, since Checkout runs on
Stripe's already-verified domain. It won't appear in other browsers, or in
Chromium screenshots/headless testing.
