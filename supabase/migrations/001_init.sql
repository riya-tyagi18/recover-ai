-- Recover AI schema (Postgres / Supabase)
-- Phase 1 uses a file-backed store with the same entities.
-- Amounts are integer paise so dashboard ₹ totals are exact sums, never hardcoded.

create table if not exists customers (
  id text primary key,
  name text not null,
  segment text not null,
  prior_success_count integer not null default 0,
  prior_success_rate numeric not null default 0,
  payment_method text not null,
  bank text not null,
  created_at timestamptz not null default now()
);

create table if not exists agent_runs (
  id text primary key,
  run_type text not null check (run_type in ('seed', 'recovery')),
  seed integer,
  payment_count integer not null,
  status text not null,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  parent_batch_id text
);

create table if not exists payments (
  id text primary key,
  customer_id text not null references customers (id),
  batch_id text not null references agent_runs (id),
  subscription_id text not null,
  amount_paise integer not null,
  currency text not null default 'INR',
  payment_method text not null,
  bank text not null,
  retry_count integer not null default 0,
  prior_failure_count integer not null default 0,
  status text not null,
  recovered_amount_paise integer not null default 0,
  recovered_at timestamptz,
  stop_reason text,
  subscription_value_paise integer not null,
  failed_at timestamptz not null,
  assigned_strategy text not null
);

create index if not exists payments_batch_id_idx on payments (batch_id);
create index if not exists payments_status_idx on payments (status);

create table if not exists failure_events (
  id text primary key,
  payment_id text not null references payments (id),
  reason text not null,
  category text not null,
  occurred_at timestamptz not null
);

create table if not exists payment_attempts (
  id text primary key,
  payment_id text not null references payments (id),
  attempt_number integer not null,
  scheduled_for timestamptz not null,
  executed_at timestamptz,
  outcome text not null,
  source text not null check (source in ('simulation', 'razorpay_test')),
  reason text not null
);

create table if not exists recovery_decisions (
  id text primary key,
  payment_id text not null references payments (id),
  run_id text not null references agent_runs (id),
  diagnosis_json jsonb not null,
  probability integer not null,
  probability_breakdown jsonb not null,
  strategy text not null,
  retry_timing text not null,
  created_at timestamptz not null default now()
);

create table if not exists recovery_actions (
  id text primary key,
  payment_id text not null references payments (id),
  decision_id text not null references recovery_decisions (id),
  action_type text not null,
  payload jsonb,
  source text not null check (source in ('simulation', 'razorpay_test')),
  result jsonb,
  created_at timestamptz not null default now()
);

create table if not exists ab_experiments (
  id text primary key,
  name text not null,
  strategies jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists experiment_assignments (
  id text primary key,
  experiment_id text not null references ab_experiments (id),
  payment_id text not null references payments (id),
  strategy text not null
);

create table if not exists audit_logs (
  id text primary key,
  payment_id text references payments (id),
  run_id text references agent_runs (id),
  at timestamptz not null default now(),
  action text not null,
  reason text not null,
  detail jsonb
);

-- KPI source of truth (never hardcode in the UI):
-- recovered rupees = sum(recovered_amount_paise) / 100
-- recovery rate   = count(status = 'recovered') / count(*)
-- value at risk   = sum(amount_paise) filter (where status in ('failed','recovering','stopped')) / 100
