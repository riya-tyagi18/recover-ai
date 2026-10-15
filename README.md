# Recover AI

Autonomous payment recovery agent for the Razorpay Hackathon (Track 3: AI Revenue Recovery). Detect → diagnose → decide → execute, with ₹ recovered computed from batch data.

> **⚠️ Sample data notice**
> All payment data shown in this app is **100% synthetic** and modelled on real Razorpay failure codes.
> It is NOT real merchant data. It is generated deterministically with seed 42 and auto-loaded on first boot.

## Demo login (when DEMO_MODE=true)

| Role | Username / Email | Password | Destination |
|---|---|---|---|
| **Business Owner** | `host` or `host@recover.ai` | `password` | `/overview` (Admin Dashboard) |
| **Customer** | `customer@recover.ai` or `customer` | `password` | `/customer/dashboard` (My Payments) |

In production mode (`DEMO_MODE=false`), demo accounts are disabled and registration creates `user` accounts only. Owner accounts are created via seed script or owner invitation.

## Quick start

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). You will be redirected to the login page. Sign in with the demo credentials above.

The app auto-seeds 100 synthetic payments on first boot — no manual steps required.

## Navigation

- **Dashboard** — KPI cards, recovery funnel, failure reasons, strategy performance
- **All Payments** — full table of 100 sample payments with status
- **Strategy Comparison** — bar chart + table of recovery rate per strategy with plain-English explanation
- **Activity Log** — searchable per-payment timeline of agent decisions (diagnosis, action, retry count, stop reason)
- **Settings (sidebar)** — "Connect payment account" card labelled _Coming soon_ (Razorpay/Stripe/PayU)

## Data model

Amounts are integer **paise**. Dashboard ₹ recovered is `sum(recovered_amount_paise) / 100` dynamically computed in `lib/analytics.ts`.

## Where retries stop

`lib/stopping.ts` and `services/agent/stopping.py` — `MAX_AUTOMATED_ATTEMPTS = 3`.

## Contact

riyatyag06@gmail.com


## Run (Phase 2)

```bash
npm install
cp .env.example .env
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). It redirects to **Simulation Center**.

1. Seed `42`, count `100`
2. Click **Generate batch**
3. Click **Run Recovery Pipeline** to autonomously process all payments via the LangGraph backend.
4. Navigate to the **Overview**, **Strategy Lab**, and **Payment Details** to see real computed analytics and audit trails.

No Postgres or Razorpay keys are required for this checkpoint. Data is stored in `.data/store.json` (gitignored).

### Python Agent Backend (Required for Run)

```bash
cd services/agent
python -m venv .venv
# Windows: .venv\Scripts\activate
# Mac/Linux: source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

`GET http://127.0.0.1:8000/health` — LangGraph nodes process each payment synchronously.

## Env vars

See `.env.example`.

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Hosted PostgreSQL (Neon / Supabase). On Vercel serverless, sessions, rate limits, OTPs, and lockouts live in Postgres. |
| `DEMO_MODE` | `true` to enable demo accounts (`host` / `password`, `customer@recover.ai` / `password`). Default is `false` in production. |
| `OTP_ENABLED` | `true` to require 6-digit email OTP 2FA for owner accounts (and optional for users). |
| `RESEND_API_KEY` | Resend API key for sending real password reset and OTP emails. |
| `RESEND_FROM` | Sender address (e.g. `Recover AI <onboarding@resend.dev>`). |
| `AGENT_URL` | Python agent (`http://127.0.0.1:8000`). |
| `LLM_PROVIDER` | `mock` (deterministic simulation default) or `openai`. |
| `RAZORPAY_KEY_ID` / `SECRET` | Test mode only. |
| `RECOVER_AI_ENV` | `development` or `production`. |

## Where the money figure will come from

Amounts are integer **paise**. Dashboard ₹ recovered is `sum(recovered_amount_paise) / 100` dynamically computed in `lib/analytics.ts` from the post-agent store data.

## Where retries stop

`lib/stopping.ts` and `services/agent/stopping.py` — `MAX_AUTOMATED_ATTEMPTS = 3`. The agent fully computes and executes this stopping rule.

