import { NextResponse } from "next/server";
import { validateSession } from "@/lib/auth/session";

export async function GET(request: Request) {
  const result = await validateSession(request);
  if (!result) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { user } = result;
  return NextResponse.json({
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      customerId: user.customerId,
    },
  });
}
