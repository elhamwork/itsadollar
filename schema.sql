-- It's a Dollar — data schema
-- Run via `npm run migrate` (scripts/migrate.js) against your Vercel Postgres database.

create table if not exists members (
  id serial primary key,
  stripe_customer_id text unique not null,
  email text not null,
  first_name text not null,
  last_name text not null,
  referral_code text unique not null,
  referred_by_member_id integer references members(id),
  points integer not null default 0,
  unsubscribed boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists referrals (
  id serial primary key,
  referrer_member_id integer not null references members(id),
  referred_member_id integer not null unique references members(id),
  points_awarded integer not null default 10,
  created_at timestamptz not null default now()
);

create table if not exists cycles (
  id serial primary key,
  label text not null,
  status text not null default 'open',
  emails_sent_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists causes (
  id serial primary key,
  cycle_id integer not null references cycles(id),
  name text not null,
  description text,
  created_at timestamptz not null default now()
);

-- One row per member per cycle. The free vote starts weight at 1; boosting
-- (spending points on your own pick) increases weight on this same row.
create table if not exists votes (
  id serial primary key,
  cycle_id integer not null references cycles(id),
  member_id integer not null references members(id),
  cause_id integer not null references causes(id),
  weight integer not null default 1,
  created_at timestamptz not null default now(),
  unique (cycle_id, member_id)
);

create table if not exists donations (
  id serial primary key,
  cycle_id integer not null unique references cycles(id),
  cause_id integer not null references causes(id),
  amount_cents integer not null,
  proof_url text,
  note text,
  donated_at timestamptz not null default now()
);

-- Real-money boosts, paid via Stripe. stripe_session_id is unique so the
-- webhook can safely apply the weight bump exactly once even if Stripe
-- redelivers the event.
create table if not exists paid_boosts (
  id serial primary key,
  stripe_session_id text unique not null,
  member_id integer not null references members(id),
  cycle_id integer not null references cycles(id),
  vote_id integer not null references votes(id),
  amount_cents integer not null,
  points integer not null,
  created_at timestamptz not null default now()
);

create table if not exists admin_login_attempts (
  id serial primary key,
  ip text not null,
  success boolean not null,
  attempted_at timestamptz not null default now()
);

create index if not exists idx_admin_attempts_ip_time on admin_login_attempts(ip, attempted_at);
