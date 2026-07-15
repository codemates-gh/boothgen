// app/api/status/route.ts
//
// Feeds the Codemates wallboard dashboard. Read-only, no auth required.
//
// ASSUMPTIONS (adjust to match your actual schema/model names):
//   - An `Operator` model has: { id, name, status: "trial" | "active" | "suspended",
//     plan, stripeConnected: boolean, createdAt, lastLoginAt }
//     — matches the Overview page's Total/Active/Trial/Suspended cards.
//   - An `EmailLog` model has: { id, status: "sent" | "failed", subject, createdAt }
//     — matches the "Email Logs (2)" badge in your nav, used here as the
//     nearest thing to an error signal since there's no dedicated error log visible.
//     If you have Sentry or another error tracker instead, swap this block for
//     a Sentry API call (keep the token server-side, same as here).

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma/client"; // adjust import to your actual Prisma client path

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const [total, active, trial, suspended, failedEmails24h, newOperators24h, stripeConnected, lastFailedExecution] =
      await Promise.all([
        // Tenant = operator account
        prisma.tenant.count(),
        prisma.tenant.count({ where: { status: "ACTIVE" } }),
        prisma.tenant.count({ where: { status: "TRIAL" } }),
        prisma.tenant.count({ where: { status: "SUSPENDED" } }),
        // AutomationExecution is the nearest real-time error signal (no dedicated error log)
        prisma.automationExecution.count({
          where: { status: "FAILED", createdAt: { gte: since24h } },
        }),
        prisma.tenant.count({ where: { createdAt: { gte: since24h } } }),
        // Stripe connected = chargesEnabled on linked StripeConnectAccount
        prisma.stripeConnectAccount.count({ where: { chargesEnabled: true } }),
        // Same 24h window as the count — keeps errors24h and lastError consistent
        prisma.automationExecution.findFirst({
          where: { status: "FAILED", createdAt: { gte: since24h } },
          orderBy: { createdAt: "desc" },
          select: { errorMessage: true, createdAt: true },
        }),
      ]);

    // Suspended operators are a business concern, not a platform outage —
    // only failed automation executions (a real technical failure) affect overall status.
    const overallStatus: "operational" | "degraded" | "down" = failedEmails24h > 0 ? "degraded" : "operational";

    // errorMessage may be a JSON string like {"name":"...","message":"..."} — extract the
    // human-readable part. Fall back to the raw string if it isn't valid JSON.
    function parseErrorMessage(raw: string | null | undefined): string | null {
      if (!raw) return null;
      try {
        const parsed = JSON.parse(raw);
        return parsed?.message ?? parsed?.name ?? raw;
      } catch {
        return raw;
      }
    }

    const buildInfo = await fetch(
      new URL("/build-info.json", process.env.NEXT_PUBLIC_SITE_URL || "https://boothgenius.com")
    )
      .then((r) => r.json())
      .catch(() => null);

    return withCors(
      NextResponse.json({
        status: overallStatus,
        errors24h: failedEmails24h,
        // null when errors24h is 0 — no contradiction between the two fields
        lastError: failedEmails24h > 0 ? parseErrorMessage(lastFailedExecution?.errorMessage) : null,
        lastDeploy: buildInfo?.builtAt ?? null,
        uptimePct: null,
        newSignups24h: newOperators24h,
        metrics: [
          { label: "Total Operators", value: String(total) },
          { label: "Active", value: String(active), status: "operational" },
          { label: "Trial", value: String(trial) },
          { label: "Suspended", value: String(suspended), status: suspended > 0 ? "degraded" : "operational" },
          { label: "Stripe Connected", value: String(stripeConnected) },
        ],
      })
    );
  } catch (_err) {
    return withCors(
      NextResponse.json({ status: "down", errors24h: null, lastError: "Status check failed to run", metrics: [] })
    );
  }
}

export async function OPTIONS() {
  return withCors(new NextResponse(null, { status: 204 }));
}

function withCors(res: NextResponse) {
  res.headers.set("Access-Control-Allow-Origin", "*");
  res.headers.set("Access-Control-Allow-Methods", "GET, OPTIONS");
  return res;
}
