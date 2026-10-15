-- Migration 002: Authentication, RBAC, Sessions, Rate Limits, and Security Audit

-- 1. Users table
create table if not exists users (
  id text primary key,
  name text not null,
  email text unique not null,
  password_hash text not null,
  role text not null check (role in ('user', 'owner')),
  created_at timestamptz not null default now(),
  email_verified boolean not null default false,
  failed_attempts integer not null default 0,
  locked_until timestamptz,
  customer_id text references customers(id) on delete set null,
  otp_secret text,
  otp_enabled boolean not null default false
);

create index if not exists users_email_idx on users (email);
create index if not exists users_role_idx on users (role);

-- 2. Sessions table (server-side hashed sessions with sliding expiry)
create table if not exists sessions (
  id text primary key, -- SHA-256 hash of random session token
  user_id text not null references users(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  last_active_at timestamptz not null default now(),
  user_agent text,
  ip_address text
);

create index if not exists sessions_user_id_idx on sessions (user_id);
create index if not exists sessions_expires_at_idx on sessions (expires_at);

-- 3. Rate limits (DB-backed, survives serverless restarts)
create table if not exists rate_limits (
  key text primary key, -- e.g. "login:ip:1.2.3.4" or "login:account:email@domain"
  count integer not null default 1,
  reset_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists rate_limits_reset_at_idx on rate_limits (reset_at);

-- 4. Password reset tokens (single-use, hashed)
create table if not exists password_resets (
  id text primary key, -- SHA-256 hash of reset token
  user_id text not null references users(id) on delete cascade,
  expires_at timestamptz not null,
  used boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists password_resets_user_id_idx on password_resets (user_id);

-- 5. Email OTP 2FA (hashed 6-digit codes)
create table if not exists email_otps (
  id text primary key,
  user_id text not null references users(id) on delete cascade,
  code_hash text not null,
  expires_at timestamptz not null,
  attempts integer not null default 0,
  used boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists email_otps_user_id_idx on email_otps (user_id);

-- 6. Security & Auth Audit Logs
create table if not exists auth_audit_logs (
  id text primary key,
  user_id text references users(id) on delete set null,
  event text not null,
  ip text,
  user_agent text,
  detail jsonb,
  created_at timestamptz not null default now()
);

create index if not exists auth_audit_logs_event_idx on auth_audit_logs (event);
create index if not exists auth_audit_logs_created_at_idx on auth_audit_logs (created_at desc);
create index if not exists auth_audit_logs_ip_idx on auth_audit_logs (ip);

-- 7. Add user_id reference to customers and payments
alter table customers add column if not exists user_id text references users(id) on delete set null;
alter table payments add column if not exists user_id text references users(id) on delete set null;
