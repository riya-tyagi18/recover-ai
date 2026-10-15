import { Pool } from "pg";
import crypto from "crypto";
import { mutateStore, readStore } from "@/lib/db/store";
import type {
  User,
  Session,
  RateLimitRecord,
  PasswordResetToken,
  EmailOtp,
  AuthAuditLog,
  Payment,
} from "@/lib/types";

let pool: Pool | null = null;
let pgInitialized = false;

function getPgPool(): Pool | null {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl || dbUrl.trim() === "") return null;
  if (!pool) {
    pool = new Pool({
      connectionString: dbUrl,
      ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : undefined,
    });
  }
  return pool;
}

async function initPgTables(p: Pool): Promise<void> {
  if (pgInitialized) return;
  await p.query(`
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
      customer_id text,
      otp_secret text,
      otp_enabled boolean not null default false
    );

    create table if not exists sessions (
      id text primary key,
      user_id text not null references users(id) on delete cascade,
      created_at timestamptz not null default now(),
      expires_at timestamptz not null,
      last_active_at timestamptz not null default now(),
      user_agent text,
      ip_address text
    );

    create table if not exists rate_limits (
      key text primary key,
      count integer not null default 1,
      reset_at timestamptz not null,
      created_at timestamptz not null default now()
    );

    create table if not exists password_resets (
      id text primary key,
      user_id text not null references users(id) on delete cascade,
      expires_at timestamptz not null,
      used boolean not null default false,
      created_at timestamptz not null default now()
    );

    create table if not exists email_otps (
      id text primary key,
      user_id text not null references users(id) on delete cascade,
      code_hash text not null,
      expires_at timestamptz not null,
      attempts integer not null default 0,
      used boolean not null default false,
      created_at timestamptz not null default now()
    );

    create table if not exists auth_audit_logs (
      id text primary key,
      user_id text,
      event text not null,
      ip text,
      user_agent text,
      detail jsonb,
      created_at timestamptz not null default now()
    );
  `);
  pgInitialized = true;
}

// -----------------------------------------------------------------------
// Users
// -----------------------------------------------------------------------

export async function findUserByEmail(email: string): Promise<User | null> {
  const norm = email.trim().toLowerCase();
  const p = getPgPool();
  if (p) {
    await initPgTables(p);
    const res = await p.query(
      `select id, name, email, password_hash as "passwordHash", role, created_at as "createdAt",
              email_verified as "emailVerified", failed_attempts as "failedAttempts",
              locked_until as "lockedUntil", customer_id as "customerId",
              otp_secret as "otpSecret", otp_enabled as "otpEnabled"
       from users where lower(email) = $1 limit 1`,
      [norm],
    );
    if (res.rows.length === 0) return null;
    return res.rows[0] as User;
  }

  const store = await readStore();
  const user = store.users.find((u) => u.email.toLowerCase() === norm);
  return user ?? null;
}

export async function findUserById(id: string): Promise<User | null> {
  const p = getPgPool();
  if (p) {
    await initPgTables(p);
    const res = await p.query(
      `select id, name, email, password_hash as "passwordHash", role, created_at as "createdAt",
              email_verified as "emailVerified", failed_attempts as "failedAttempts",
              locked_until as "lockedUntil", customer_id as "customerId",
              otp_secret as "otpSecret", otp_enabled as "otpEnabled"
       from users where id = $1 limit 1`,
      [id],
    );
    if (res.rows.length === 0) return null;
    return res.rows[0] as User;
  }

  const store = await readStore();
  const user = store.users.find((u) => u.id === id);
  return user ?? null;
}

export async function createUser(user: User): Promise<User> {
  const p = getPgPool();
  if (p) {
    await initPgTables(p);
    await p.query(
      `insert into users (id, name, email, password_hash, role, created_at, email_verified, failed_attempts, locked_until, customer_id, otp_secret, otp_enabled)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [
        user.id,
        user.name,
        user.email.toLowerCase(),
        user.passwordHash,
        user.role,
        user.createdAt,
        user.emailVerified,
        user.failedAttempts,
        user.lockedUntil,
        user.customerId ?? null,
        user.otpSecret ?? null,
        user.otpEnabled ?? false,
      ],
    );
    return user;
  }

  return mutateStore((store) => {
    store.users.push(user);
    return user;
  });
}

export async function updateUser(id: string, updates: Partial<User>): Promise<User | null> {
  const p = getPgPool();
  if (p) {
    await initPgTables(p);
    const setClauses: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (updates.name !== undefined) {
      setClauses.push(`name = $${idx++}`);
      values.push(updates.name);
    }
    if (updates.passwordHash !== undefined) {
      setClauses.push(`password_hash = $${idx++}`);
      values.push(updates.passwordHash);
    }
    if (updates.emailVerified !== undefined) {
      setClauses.push(`email_verified = $${idx++}`);
      values.push(updates.emailVerified);
    }
    if (updates.failedAttempts !== undefined) {
      setClauses.push(`failed_attempts = $${idx++}`);
      values.push(updates.failedAttempts);
    }
    if (updates.lockedUntil !== undefined) {
      setClauses.push(`locked_until = $${idx++}`);
      values.push(updates.lockedUntil);
    }
    if (updates.customerId !== undefined) {
      setClauses.push(`customer_id = $${idx++}`);
      values.push(updates.customerId);
    }
    if (updates.otpEnabled !== undefined) {
      setClauses.push(`otp_enabled = $${idx++}`);
      values.push(updates.otpEnabled);
    }

    if (setClauses.length > 0) {
      values.push(id);
      await p.query(
        `update users set ${setClauses.join(", ")} where id = $${idx}`,
        values,
      );
    }
    return findUserById(id);
  }

  return mutateStore((store) => {
    const idx = store.users.findIndex((u) => u.id === id);
    if (idx === -1) return null;
    store.users[idx] = { ...store.users[idx]!, ...updates };
    return store.users[idx]!;
  });
}

// -----------------------------------------------------------------------
// Sessions
// -----------------------------------------------------------------------

export async function createSession(session: Session): Promise<Session> {
  const p = getPgPool();
  if (p) {
    await initPgTables(p);
    await p.query(
      `insert into sessions (id, user_id, created_at, expires_at, last_active_at, user_agent, ip_address)
       values ($1, $2, $3, $4, $5, $6, $7)`,
      [
        session.id,
        session.userId,
        session.createdAt,
        session.expiresAt,
        session.lastActiveAt,
        session.userAgent ?? null,
        session.ipAddress ?? null,
      ],
    );
    return session;
  }

  return mutateStore((store) => {
    // Evict any existing session with same ID if any
    store.sessions = store.sessions.filter((s) => s.id !== session.id);
    store.sessions.push(session);
    return session;
  });
}

export async function findSessionById(id: string): Promise<Session | null> {
  const p = getPgPool();
  if (p) {
    await initPgTables(p);
    const res = await p.query(
      `select id, user_id as "userId", created_at as "createdAt",
              expires_at as "expiresAt", last_active_at as "lastActiveAt",
              user_agent as "userAgent", ip_address as "ipAddress"
       from sessions where id = $1 limit 1`,
      [id],
    );
    if (res.rows.length === 0) return null;
    return res.rows[0] as Session;
  }

  const store = await readStore();
  const session = store.sessions.find((s) => s.id === id);
  return session ?? null;
}

export async function updateSessionActivity(id: string, newExpiry: string): Promise<void> {
  const now = new Date().toISOString();
  const p = getPgPool();
  if (p) {
    await initPgTables(p);
    await p.query(
      `update sessions set last_active_at = $1, expires_at = $2 where id = $3`,
      [now, newExpiry, id],
    );
    return;
  }

  await mutateStore((store) => {
    const s = store.sessions.find((x) => x.id === id);
    if (s) {
      s.lastActiveAt = now;
      s.expiresAt = newExpiry;
    }
  });
}

export async function deleteSession(id: string): Promise<void> {
  const p = getPgPool();
  if (p) {
    await initPgTables(p);
    await p.query(`delete from sessions where id = $1`, [id]);
    return;
  }

  await mutateStore((store) => {
    store.sessions = store.sessions.filter((s) => s.id !== id);
  });
}

export async function deleteUserSessions(userId: string): Promise<void> {
  const p = getPgPool();
  if (p) {
    await initPgTables(p);
    await p.query(`delete from sessions where user_id = $1`, [userId]);
    return;
  }

  await mutateStore((store) => {
    store.sessions = store.sessions.filter((s) => s.userId !== userId);
  });
}

// -----------------------------------------------------------------------
// DB-backed Rate Limits
// -----------------------------------------------------------------------

export async function checkAndIncrementRateLimit(
  key: string,
  maxLimit: number,
  windowMs: number,
): Promise<{ allowed: boolean; remaining: number; resetAt: string }> {
  const now = new Date();
  const resetTime = new Date(now.getTime() + windowMs).toISOString();

  const p = getPgPool();
  if (p) {
    await initPgTables(p);
    // Remove expired entries for this key
    await p.query(`delete from rate_limits where reset_at < $1`, [now.toISOString()]);

    const res = await p.query(`select count, reset_at from rate_limits where key = $1 limit 1`, [key]);
    if (res.rows.length === 0) {
      await p.query(
        `insert into rate_limits (key, count, reset_at, created_at) values ($1, 1, $2, $3)`,
        [key, resetTime, now.toISOString()],
      );
      return { allowed: true, remaining: maxLimit - 1, resetAt: resetTime };
    }

    const currentCount = res.rows[0].count as number;
    const existingResetAt = new Date(res.rows[0].reset_at).toISOString();

    if (currentCount >= maxLimit) {
      return { allowed: false, remaining: 0, resetAt: existingResetAt };
    }

    const updated = currentCount + 1;
    await p.query(`update rate_limits set count = $1 where key = $2`, [updated, key]);
    return { allowed: true, remaining: maxLimit - updated, resetAt: existingResetAt };
  }

  return mutateStore((store) => {
    const nowIso = now.toISOString();
    store.rateLimits = store.rateLimits.filter((r) => r.resetAt > nowIso);

    const record = store.rateLimits.find((r) => r.key === key);
    if (!record) {
      store.rateLimits.push({ key, count: 1, resetAt: resetTime, createdAt: nowIso });
      return { allowed: true, remaining: maxLimit - 1, resetAt: resetTime };
    }

    if (record.count >= maxLimit) {
      return { allowed: false, remaining: 0, resetAt: record.resetAt };
    }

    record.count += 1;
    return { allowed: true, remaining: maxLimit - record.count, resetAt: record.resetAt };
  });
}

// -----------------------------------------------------------------------
// Password Resets
// -----------------------------------------------------------------------

export async function createPasswordReset(reset: PasswordResetToken): Promise<void> {
  const p = getPgPool();
  if (p) {
    await initPgTables(p);
    await p.query(
      `insert into password_resets (id, user_id, expires_at, used, created_at) values ($1, $2, $3, $4, $5)`,
      [reset.id, reset.userId, reset.expiresAt, reset.used, reset.createdAt],
    );
    return;
  }

  await mutateStore((store) => {
    store.passwordResets.push(reset);
  });
}

export async function findPasswordReset(id: string): Promise<PasswordResetToken | null> {
  const p = getPgPool();
  if (p) {
    await initPgTables(p);
    const res = await p.query(
      `select id, user_id as "userId", expires_at as "expiresAt", used, created_at as "createdAt"
       from password_resets where id = $1 limit 1`,
      [id],
    );
    if (res.rows.length === 0) return null;
    return res.rows[0] as PasswordResetToken;
  }

  const store = await readStore();
  const reset = store.passwordResets.find((r) => r.id === id);
  return reset ?? null;
}

export async function markPasswordResetUsed(id: string): Promise<void> {
  const p = getPgPool();
  if (p) {
    await initPgTables(p);
    await p.query(`update password_resets set used = true where id = $1`, [id]);
    return;
  }

  await mutateStore((store) => {
    const r = store.passwordResets.find((x) => x.id === id);
    if (r) r.used = true;
  });
}

// -----------------------------------------------------------------------
// Email OTP 2FA
// -----------------------------------------------------------------------

export async function createEmailOtp(otp: EmailOtp): Promise<void> {
  const p = getPgPool();
  if (p) {
    await initPgTables(p);
    await p.query(
      `insert into email_otps (id, user_id, code_hash, expires_at, attempts, used, created_at)
       values ($1, $2, $3, $4, $5, $6, $7)`,
      [otp.id, otp.userId, otp.codeHash, otp.expiresAt, otp.attempts, otp.used, otp.createdAt],
    );
    return;
  }

  await mutateStore((store) => {
    store.emailOtps.push(otp);
  });
}

export async function findLatestEmailOtp(userId: string): Promise<EmailOtp | null> {
  const p = getPgPool();
  if (p) {
    await initPgTables(p);
    const res = await p.query(
      `select id, user_id as "userId", code_hash as "codeHash", expires_at as "expiresAt",
              attempts, used, created_at as "createdAt"
       from email_otps where user_id = $1 and used = false and expires_at > now()
       order by created_at desc limit 1`,
      [userId],
    );
    if (res.rows.length === 0) return null;
    return res.rows[0] as EmailOtp;
  }

  const store = await readStore();
  const now = new Date().toISOString();
  const valid = store.emailOtps
    .filter((o) => o.userId === userId && !o.used && o.expiresAt > now)
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  return valid[0] ?? null;
}

export async function incrementOtpAttempts(id: string): Promise<number> {
  const p = getPgPool();
  if (p) {
    await initPgTables(p);
    const res = await p.query(
      `update email_otps set attempts = attempts + 1 where id = $1 returning attempts`,
      [id],
    );
    return res.rows[0]?.attempts ?? 0;
  }

  return mutateStore((store) => {
    const otp = store.emailOtps.find((o) => o.id === id);
    if (otp) {
      otp.attempts += 1;
      return otp.attempts;
    }
    return 0;
  });
}

export async function markOtpUsed(id: string): Promise<void> {
  const p = getPgPool();
  if (p) {
    await initPgTables(p);
    await p.query(`update email_otps set used = true where id = $1`, [id]);
    return;
  }

  await mutateStore((store) => {
    const o = store.emailOtps.find((x) => x.id === id);
    if (o) o.used = true;
  });
}

// -----------------------------------------------------------------------
// Security Audit Logs
// -----------------------------------------------------------------------

export async function logAuthEvent(
  entry: Omit<AuthAuditLog, "id" | "createdAt">,
): Promise<void> {
  const id = `auth_log_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
  const now = new Date().toISOString();

  const p = getPgPool();
  if (p) {
    await initPgTables(p);
    await p.query(
      `insert into auth_audit_logs (id, user_id, event, ip, user_agent, detail, created_at)
       values ($1, $2, $3, $4, $5, $6, $7)`,
      [
        id,
        entry.userId ?? null,
        entry.event,
        entry.ip ?? null,
        entry.userAgent ?? null,
        JSON.stringify(entry.detail ?? {}),
        now,
      ],
    );
    return;
  }

  await mutateStore((store) => {
    store.authAuditLogs.push({
      id,
      userId: entry.userId,
      event: entry.event,
      ip: entry.ip,
      userAgent: entry.userAgent,
      detail: entry.detail,
      createdAt: now,
    });
  });
}

export async function getAuthAuditLogs(limit = 100): Promise<AuthAuditLog[]> {
  const p = getPgPool();
  if (p) {
    await initPgTables(p);
    const res = await p.query(
      `select id, user_id as "userId", event, ip, user_agent as "userAgent",
              detail, created_at as "createdAt"
       from auth_audit_logs order by created_at desc limit $1`,
      [limit],
    );
    return res.rows as AuthAuditLog[];
  }

  const store = await readStore();
  return [...store.authAuditLogs]
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    .slice(0, limit);
}

// -----------------------------------------------------------------------
// Customer Payments (Data Isolation & RBAC)
// -----------------------------------------------------------------------

export async function getCustomerPayments(customerId: string): Promise<Payment[]> {
  const store = await readStore();
  return store.payments
    .filter((p) => p.customerId === customerId)
    .sort((a, b) => (a.failedAt < b.failedAt ? 1 : -1));
}

export async function getCustomerPaymentById(
  customerId: string,
  paymentId: string,
): Promise<Payment | null> {
  const store = await readStore();
  const payment = store.payments.find(
    (p) => p.id === paymentId && p.customerId === customerId,
  );
  return payment ?? null;
}
