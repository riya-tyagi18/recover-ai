import { NextResponse } from "next/server";
import { isDemoMode } from "@/lib/auth/seed";

/**
 * Public endpoint: returns server-side configuration flags for the login page.
 * Does NOT require authentication.
 */
export async function GET() {
  return NextResponse.json({ demoMode: isDemoMode() });
}
