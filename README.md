# Recover AI

**An AI agent that finds revenue at risk from failed payments, works out why it failed, picks the right recovery action, and shows how much money it got back.**

**Live demo:** https://recover-ai-sooty.vercel.app/login

## Demo login (when `DEMO_MODE=true`)

| Role | Username / Email | Password | Destination |
|---|---|---|---|
| **Business Owner** | `host` or `host@recover.ai` | `password` | `/overview` (Admin Dashboard) |
| **Customer** | `customer@recover.ai` or `customer` | `password` | `/customer/dashboard` (My Payments) |

In production mode (`DEMO_MODE=false`), demo accounts are disabled and registration creates regular user accounts only. Owner accounts are created via the seed script or owner invitation.

## The problem

Businesses lose money quietly. A card expires, a bank has a temporary outage, a customer runs short of funds, and a subscription payment fails. Most teams find out late, retry blindly, or never follow up. Retrying too aggressively annoys customers and can breach contact rules.

## What Recover AI does

For every failed payment, the agent works through the same loop:

**Detect → Diagnose → Decide → Execute → Measure**

1. **Detect:** Identify failed payments and the revenue at risk.
2. **Diagnose:** Determine the likely cause, such as a temporary bank issue, insufficient funds, expired card, or permanent decline.
3. **Decide:** Select an appropriate action, such as retrying now or later, sending a reminder, requesting an updated payment method, or stopping.
4. **Execute:** Perform or simulate the action within defined limits.
5. **Measure:** Calculate the amount recovered from the available dataset.

Every decision is explained in plain language and recorded in an audit trail.

## Features

- **Dashboard analytics:** KPIs for failed payments, value at risk, amount recovered, and recovery rate, alongside charts for failure reasons and recovery over time. Figures are calculated from the dataset.
- **All Payments:** Searchable payment records with status, failure type, and value at risk.
- **Strategy Comparison:** Compare recovery strategies by recovery rate and amount recovered.
- **Activity Log:** A per-payment timeline explaining actions taken, why they were taken, and why recovery stopped.
- **Payment Recovery Analyst chatbot:** Ask questions in plain English, such as "Tell me about CUST_42_005" or "Which failure reason costs the most?" The chatbot retrieves relevant records and answers using available dataset information. It uses an LLM when an API key is configured and falls back to data-based answers otherwise.
- **Customer Risk Segmentation:** Classifies customers into segments such as High Value, Recovery on Retry, High Failure Frequency, High Risk, and Healthy using transparent rules. Segment explanations and interactive visualizations help explore customer risk.
- **Hinglish Nudges:** Generates short, polite payment recovery messages. Delivery is simulated; no real customers are contacted.

## Authentication and access control

- Separate customer and owner/admin dashboards.
- Registration and login with database-backed accounts.
- Password hashing and secure session management.
- Email OTP verification when configured.
- Role-based access control and customer payment-data isolation.
- Login rate limiting and account lockout protections.
- Password reset and security audit logging.

The availability of individual security features depends on the application configuration. See `.env.example` for relevant settings.

## Safety and compliance by design

- **Three-attempt stopping rule:** Automated retries stop after three attempts, with the reason recorded.
- **Bounded escalation:** Contact attempts are limited and visible.
- **Full audit trail:** Records what happened, why it happened, and what comes next.
- **Test mode only:** No real payments are processed, no real money is transferred, and no card numbers or CVVs are stored.

## About the data

The payments in this project are **synthetic sample data**, modelled on real Razorpay failure categories. The sample dataset allows recovery logic to be demonstrated and evaluated without exposing confidential merchant information.

Dashboard figures are calculated from this dataset. They do not represent actual merchant revenue or verified real-world recovery performance.

## Tech stack

- **Frontend:** Next.js, React, Tailwind CSS
- **Backend:** Next.js API routes
- **Database:** PostgreSQL
- **AI workflow:** LangGraph
- **LLM integration:** Configurable provider, depending on environment settings
- **Payment integration:** Razorpay Test Mode; no production credentials
- **Deployment:** Vercel
- **Version control and CI/CD:** GitHub with Vercel deployment integration

## Run locally

```bash
git clone https://github.com/riya-tyagi18/recover-ai.git
cd recover-ai
npm install
```

Create a `.env.local` file using `.env.example` as a reference, then configure the required environment variables.

Start the development server:

```bash
npm run dev
```

Open http://localhost:3000 in your browser.

Use the demo credentials above only when demo mode is enabled and the accounts have been seeded.

## Environment variables

See `.env.example` for the full list.

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string, such as a hosted Neon or Supabase database |
| `DEMO_MODE` | Enables demo accounts when explicitly configured |
| `OTP_ENABLED` | Controls email OTP verification, where supported |
| `RESEND_API_KEY` | API key for sending OTP and password-reset emails through Resend |
| `RESEND_FROM` | Sender address for outgoing emails |
| `GROQ_API_KEY`, `OPENAI_API_KEY`, or `GEMINI_API_KEY` | Optional LLM provider credentials |
| `AGENT_URL` | URL of the Python agent service, if used |
| `LLM_PROVIDER` | Selects the configured LLM provider or mock mode |
| `RAZORPAY_KEY_ID` / `RAZORPAY_SECRET` | Razorpay Test Mode credentials only |
| `RECOVER_AI_ENV` | Application environment, such as development or production |

Never commit secrets to GitHub or expose private credentials in client-side code.

## Build and verification

Check TypeScript:

```bash
npx tsc --noEmit
```

Build the application:

```bash
npm run build
```

Run the available tests using the scripts defined in `package.json`.

## Cloud deployment and CI/CD

1. Push the project to GitHub.
2. Import the repository into Vercel.
3. Configure environment variables in the Vercel project settings.
4. Deploy the application and verify the deployment URL.
5. Push subsequent changes to the configured branch to trigger automated deployments.

Check the Vercel build logs if a deployment fails. Ensure that the production database, authentication secrets, and email service are configured correctly.

## Known limitations

- The application uses synthetic payment data; connecting a real payment account is not yet available.
- Payment recovery actions are demonstrated in a controlled test environment and do not guarantee real-world recovery.
- Email and messaging delivery may be simulated when the relevant integrations are not configured.
- Recovery figures and forecasts reflect the sample dataset, not live business performance.
- Production readiness depends on deployment configuration, security testing, and integration verification.

## Roadmap

- Webhook ingestion for `payment.failed` events in Test Mode.
- Payment-account integrations and production-grade authentication.
- Checkout abandonment, B2B overdue receivables, and promise-to-pay workflows.
- Sandbox integrations for WhatsApp and email.
- Expanded recovery evaluation and monitoring.
