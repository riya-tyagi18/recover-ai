import { seedAuthAccounts, DEMO_OWNER_EMAIL, DEMO_CUSTOMER_EMAIL } from "../lib/auth/seed";

async function main() {
  console.log("Seeding Recover AI authentication accounts...");
  const { owner, customer } = await seedAuthAccounts();
  console.log(`✓ Owner created: ${owner.name} (${owner.email}) - role: ${owner.role}`);
  console.log(`✓ Customer created: ${customer.name} (${customer.email}) - role: ${customer.role} - customerId: ${customer.customerId}`);
  console.log("Seeding completed successfully.");
}

main().catch((err) => {
  console.error("Failed to seed auth accounts:", err);
  process.exit(1);
});
