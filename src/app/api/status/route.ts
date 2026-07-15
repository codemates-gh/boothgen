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
import { prisma } from "@/lib/prisma"; // adjust import to your actual Prisma client path

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const [total, active, trial, suspended, failedEmails24h, newOperators24h, stripeConnected, lastFailedEmail] =
      await Promise.all([
        prisma.operator.count(),
        prisma.operator.count({ where: { status: "active" } }),
        prisma.operator.count({ where: { status: "trial" } }),
        prisma.operator.count({ where: { status: "suspended" } }),
        prisma.emailLog.count({
          where: { status: "failed", createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
        }),
        prisma.operator.count({
          where: { createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
        }),
        prisma.operator.count({ where: { stripeConnected: true } }),
        prisma.emailLog.findFirst({ where: { status: "failed" }, orderBy: { createdAt: "desc" } }),
      ]);

    // Suspended operators are a business concern, not a platform outage —
    // only failed emails (a real technical failure) affect overall status.
    const overallStatus: "operational" | "degraded" | "down" = failedEmails24h > 0 ? "degraded" : "operational";

    const buildInfo = await fetch(
      new URL("/build-info.json", process.env.NEXT_PUBLIC_SITE_URL || "https://boothgenius.com")
    )
      .then((r) => r.json())
      .catch(() => null);

    return withCors(
      NextResponse.json({
        status: overallStatus,
        errors24h: failedEmails24h,
        lastError: lastFailedEmail ? `Email failed: ${lastFailedEmail.subject}` : null,
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
  } catch (err) {
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
