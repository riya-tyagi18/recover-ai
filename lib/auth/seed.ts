import { hashPassword } from "@/lib/auth/password";
import { findUserByEmail, createUser, updateUser } from "@/lib/db/auth-store";
import { mutateStore, readStore } from "@/lib/db/store";
import type { User } from "@/lib/types";

export const DEMO_OWNER_EMAIL = "host@recover.ai";
export const DEMO_OWNER_ALIAS = "host";
export const DEMO_OWNER_PASS = "password";

export const DEMO_CUSTOMER_EMAIL = "customer@recover.ai";
export const DEMO_CUSTOMER_ALIAS = "customer";
export const DEMO_CUSTOMER_PASS = "password";

export function isDemoMode(): boolean {
  // If DEMO_MODE is explicitly set, obey it
  if (process.env.DEMO_MODE === "true") return true;
  if (process.env.DEMO_MODE === "false") return false;
  // If running in production mode, default demo to false unless DEMO_MODE=true
  if (process.env.RECOVER_AI_ENV === "production" || process.env.NODE_ENV === "production") {
    return false;
  }
  // Otherwise in development, demo mode is enabled
  return true;
}

export async function seedAuthAccounts(): Promise<{ owner: User; customer: User }> {
  // Hash the demo passwords with bcrypt cost 12
  const hashedOwnerPassword = await hashPassword(DEMO_OWNER_PASS);
  const hashedCustomerPassword = await hashPassword(DEMO_CUSTOMER_PASS);
  const now = new Date().toISOString();

  // 1. Ensure sample store is seeded so cust_42_000 exists
  const store = await readStore();
  const sampleCustomer = store.customers.find((c) => c.id === "cust_42_000") || store.customers[0];
  const sampleCustomerId = sampleCustomer ? sampleCustomer.id : "cust_42_000";

  // 2. Owner account
  let owner = await findUserByEmail(DEMO_OWNER_EMAIL);
  if (!owner) {
    owner = {
      id: "usr_demo_owner",
      name: "Demo Owner",
      email: DEMO_OWNER_EMAIL,
      passwordHash: hashedOwnerPassword,
      role: "owner",
      createdAt: now,
      emailVerified: true,
      failedAttempts: 0,
      lockedUntil: null,
      customerId: null,
      otpSecret: null,
      otpEnabled: false,
    };
    await createUser(owner);
  } else {
    // Ensure active credentials
    await updateUser(owner.id, {
      passwordHash: hashedOwnerPassword,
      failedAttempts: 0,
      lockedUntil: null,
    });
  }

  // 3. Customer account
  let customer = await findUserByEmail(DEMO_CUSTOMER_EMAIL);
  if (!customer) {
    customer = {
      id: "usr_demo_customer",
      name: sampleCustomer ? sampleCustomer.name : "Aarav Mehta",
      email: DEMO_CUSTOMER_EMAIL,
      passwordHash: hashedCustomerPassword,
      role: "user",
      createdAt: now,
      emailVerified: true,
      failedAttempts: 0,
      lockedUntil: null,
      customerId: sampleCustomerId,
      otpSecret: null,
      otpEnabled: false,
    };
    await createUser(customer);
  } else {
    await updateUser(customer.id, {
      customerId: sampleCustomerId,
      passwordHash: hashedCustomerPassword,
      failedAttempts: 0,
      lockedUntil: null,
    });
  }

  // 4. Link sample payments and customer to user_id without changing totals
  await mutateStore((s) => {
    const cust = s.customers.find((c) => c.id === sampleCustomerId);
    if (cust) {
      cust.userId = customer!.id;
    }
    s.payments.forEach((p) => {
      if (p.customerId === sampleCustomerId) {
        p.userId = customer!.id;
      }
    });
  });

  return { owner, customer };
}
