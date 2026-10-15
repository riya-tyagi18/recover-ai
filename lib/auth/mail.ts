import { isDemoMode } from "@/lib/auth/seed";

export type EmailPayload = {
  to: string;
  subject: string;
  text: string;
  html?: string;
};

export function hasMailProvider(): boolean {
  if (process.env.RESEND_API_KEY && process.env.RESEND_API_KEY.trim() !== "") {
    return true;
  }
  if (
    process.env.SMTP_HOST &&
    process.env.SMTP_USER &&
    process.env.SMTP_PASS
  ) {
    return true;
  }
  return false;
}

/**
 * Send an email via Resend API or SMTP if configured.
 * When in demo mode without mail credentials, logs to console and returns demo flag.
 */
export async function sendEmail(
  payload: EmailPayload,
): Promise<{ success: boolean; demoMode: boolean; error?: string }> {
  const { to, subject, text, html } = payload;
  const demo = isDemoMode();

  // 1. Resend provider
  if (process.env.RESEND_API_KEY && process.env.RESEND_API_KEY.trim() !== "") {
    try {
      const from = process.env.RESEND_FROM || "Recover AI <onboarding@resend.dev>";
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from,
          to: [to],
          subject,
          text,
          html: html || `<p>${text}</p>`,
        }),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        console.error("Resend API error:", errJson);
        return { success: false, demoMode: demo, error: "Failed to send email via mail service." };
      }
      return { success: true, demoMode: false };
    } catch (err) {
      console.error("Resend fetch exception:", err);
      return { success: false, demoMode: demo, error: "Email provider error." };
    }
  }

  // 2. Demo mode fallback when no mail provider configured
  if (demo) {
    console.log(`[DEMO_EMAIL_DELIVERY] To: ${to} | Subject: ${subject}`);
    console.log(`[DEMO_EMAIL_DELIVERY] Body: ${text}`);
    return { success: true, demoMode: true };
  }

  // In production without mail provider
  console.warn("No mail provider configured (RESEND_API_KEY missing) in production environment.");
  return {
    success: false,
    demoMode: false,
    error: "No email delivery service configured.",
  };
}
