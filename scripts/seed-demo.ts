/**
 * Seed demo authentication accounts for Recover AI.
 *
 * Usage:
 *   npm run seed
 *
 * What it does:
 *   - Creates (or resets credentials of) two demo users:
 *       owner  → email: host@recover.ai, username: host, password: password
 *       customer → email: customer@recover.ai, password: password
 *   - Links the demo customer to sample payment data (seed 42) so the
 *     customer portal shows real-looking transactions.
 *   - Safe to run multiple times (idempotent).
 *
 * Environment variables (optional — same as .env.local / Vercel env):
 *   DATABASE_URL  Postgres connection string. If absent, writes to .data/store.json.
 *   DEMO_MODE     Set to "true" to enable demo logins after seeding.
 */

// Load .env files when running outside Next.js (tsx / ts-node context)
import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });

import { seedAuthAccounts, DEMO_OWNER_EMAIL, DEMO_CUSTOMER_EMAIL } from "../lib/auth/seed";

async function main() {
  const db = process.env.DATABASE_URL ? "Postgres" : "local file store (.data/store.json)";
  console.log(`\nSeeding Recover AI demo accounts → ${db}\n`);

  const { owner, customer } = await seedAuthAccounts();

  console.log(`✓ Owner:    ${owner.name}`);
  console.log(`   email:   ${owner.email}`);
  console.log(`   alias:   host`);
  console.log(`   role:    ${owner.role}`);
  console.log(`   pass:    password\n`);

  console.log(`✓ Customer: ${customer.name}`);
  console.log(`   email:   ${customer.email}`);
  console.log(`   role:    ${customer.role}`);
  console.log(`   custId:  ${customer.customerId}`);
  console.log(`   pass:    password\n`);

  console.log("Seeding completed successfully.");
  console.log("Reminder: set DEMO_MODE=true on Vercel (or in .env.local) to enable demo logins.");
}

main().catch((err) => {
  console.error("\nFailed to seed auth accounts:", err instanceof Error ? err.message : err);
  console.error("\nIf using Postgres, make sure DATABASE_URL is set correctly.");
  process.exit(1);
});
