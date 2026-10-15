# Recover AI

**An AI agent that finds revenue at risk from failed payments, works out why it failed, picks the right recovery action, and shows how much money it got back.**


**Live demo:** https://recover-ai-sooty.vercel.app/login
**Demo login:** username `host`, password `password`

---

## The problem

Businesses lose money quietly. A card expires, a bank has a temporary outage, a customer runs short of funds, and a subscription payment fails. Most teams find out late, retry blindly, or never follow up. Retrying too aggressively annoys customers and can breach contact rules.

## What Recover AI does

For every failed payment, the agent works through the same loop:

**Detect > Diagnose > Decide > Execute > Measure**

1. **Detect** the failed payment and the revenue at risk.
2. **Diagnose** the cause: temporary bank issue, insufficient funds, expired card, permanent decline, and so on.
3. **Decide** the best action for that customer: retry now, retry later, send a nudge, ask for a new payment method, or stop.
4. **Execute** the action within strict limits.
5. **Measure** the result as real rupees recovered, computed from the data.

Every decision is explained in plain language and recorded in an audit trail.

## Features

- **Dashboard analytics:** KPIs for failed payments, value at risk, amount recovered and recovery rate, plus donut and line/area charts for failure reasons, recovery over time and more. All figures are calculated from the dataset.
- **All Payments:** searchable list of every failed payment with status, failure type and value at risk.
- **Strategy Comparison:** compares recovery strategies by recovery rate and amount recovered, so you can see what works best.
- **Activity Log:** a per-payment timeline of what the agent did and why, including the reason it stopped.
- **Payment Recovery Analyst chatbot:** ask questions in plain English, such as "tell me about CUST_42_005" or "which failure reason costs the most?". It understands customer IDs and names, retrieves the relevant records from the dataset, and answers only from that data. It uses an LLM when an API key is configured and falls back to data-only answers when it is not. One-click buttons cover Customer Risk Analysis, Top Failure Reasons, Revenue at Risk and Recovery Recommendations.
- **Customer risk segmentation:** each customer is classified as High Value, Recovery on Retry, High Failure Frequency, High Risk or Healthy, using transparent rules. The response lists which rules triggered, and an interactive scatter chart plus segment cards let you explore customers.
- **Hinglish nudges:** short, polite recovery messages for payment failures. Delivery is simulated and no real customer is ever contacted.

## Safety and compliance by design

- **3-attempt stopping rule:** the agent never retries endlessly. After three automated attempts it stops and shows the reason.
- **Bounded escalation:** contact attempts are limited and visible.
- **Full audit trail:** every action is logged with what happened, why, and what comes next.
- **Test mode only:** no real payments, no real money, and no card numbers or CVVs are stored.

## About the data

The payments in this project are **synthetic sample data**, modelled on real Razorpay failure categories. Real merchant data is confidential, so the sample set lets the recovery logic be measured and demonstrated safely. All dashboard numbers are computed from this dataset. The app labels it as sample data, and no figure here represents real merchant revenue.

## Tech stack

- Next.js and React frontend
- PostgreSQL
- LangGraph for the agent workflow
- Razorpay Test Mode (no production credentials)
- Deployed on Vercel

## Run locally

```bash
git clone https://github.com/riya-tyagi18/recover-ai.git
cd recover-ai
npm install
cp .env.example .env.local   # then fill in values
npm run dev
```

Open http://localhost:3000 and sign in with `host` / `password`.

### Environment variables

Secrets live in environment variables and are never committed or exposed to the browser.

| Variable | Required | Purpose |
|---|---|---|
| `GROQ_API_KEY`, `OPENAI_API_KEY` or `GEMINI_API_KEY` | Optional | Enables LLM-written chatbot answers. Without one, the chatbot answers from the data directly. |

See `.env.example` for the full list.

### Build

```bash
npm run build
```

## Known limitations

- Connecting a real payment account (Razorpay, Stripe or PayU) is shown as "coming soon". The app runs on sample data.
- The login is a demo account for evaluation, not production authentication.
- Message delivery (WhatsApp and email) is simulated.
- Forecasts and recovery figures reflect the sample dataset, not live business performance.

## Roadmap

- Live Test Mode webhook ingestion for `payment.failed` events
- Real payment-account connection and production authentication
- Checkout abandonment, B2B overdue receivables and promise-to-pay workflows
- Sandbox integrations for WhatsApp and email
