# Recover AI

Autonomous payment recovery agent for the Razorpay Hackathon (Track 3: AI Revenue Recovery). Detect → diagnose → decide → execute, with ₹ recovered computed from batch data.

**Current checkpoint: Phase 1** — seeded failed-payment simulation + Simulation Center table.

## Run (Phase 1)

```bash
npm install
cp .env.example .env
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). It redirects to **Simulation Center**.

1. Seed `42`, count `100`
2. Click **Generate batch**
3. Confirm the table fills (IDs, amounts, failure categories, A/B strategies)
4. Generate again with the same seed — you should see the same IDs and amounts (reused batch)

No Postgres or Razorpay keys are required for this checkpoint. Data is stored in `.data/store.json` (gitignored).

### Optional Python agent stub

```bash
cd services/agent
python -m venv .venv
# Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

`GET http://127.0.0.1:8000/health` — LangGraph nodes land in Phase 2.

## Env vars

See `.env.example`. For Phase 1 they can stay empty except `RECOVER_AI_ENV=simulation`.

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Postgres/Supabase (unused in Phase 1) |
| `AGENT_URL` | Python agent |
| `LLM_PROVIDER` | `mock` (default) or a later provider |
| `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` | Test mode only, Phase 2+ |

## Where the money figure will come from

Amounts are integer **paise**. Dashboard ₹ recovered will be `sum(recovered_amount_paise) / 100` over stored payments — never a constant. Schema: `supabase/migrations/001_init.sql`.

## Where retries stop

`lib/stopping.ts` and `services/agent/stopping.py` — `MAX_AUTOMATED_ATTEMPTS = 3`. Wired into the agent in Phase 2.

## Known limitations (Phase 1)

- File store, not Postgres yet
- Agent does not process payments yet
- Razorpay Test Mode not called
- Overview / Strategy Lab / Agent graph are placeholders
