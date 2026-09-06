import { getAdminWaitlistRows } from "@/lib/waitlist/admin";
import { getAdminSession } from "@/lib/waitlist/admin-auth";

export const runtime = "nodejs";

function csvCell(value: string | number | boolean | null) {
  let text = value === null ? "" : String(value);
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

export async function GET() {
  if (!(await getAdminSession())) {
    return Response.json({ message: "Not found." }, { status: 404 });
  }

  const rows = await getAdminWaitlistRows(5000);
  const header = [
    "email",
    "status",
    "newsletter_subscribed",
    "referral_code",
    "referred_by_email",
    "verified_referrals",
    "pending_referrals",
    "points",
    "first_seen_at",
    "confirmed_at",
  ];
  const lines = [
    header.map(csvCell).join(","),
    ...rows.map((row) =>
      [
        row.email,
        row.status,
        row.marketingConsent,
        row.referralCode,
        row.referredByEmail,
        row.verifiedReferrals,
        row.pendingReferrals,
        row.points,
        row.firstSeenAt.toISOString(),
        row.confirmedAt?.toISOString() ?? null,
      ]
        .map(csvCell)
        .join(",")
    ),
  ];

  return new Response(`\uFEFF${lines.join("\r\n")}\r\n`, {
    headers: {
      "cache-control": "private, no-store",
      "content-disposition": 'attachment; filename="livepeer-waitlist.csv"',
      "content-type": "text/csv; charset=utf-8",
    },
  });
}
