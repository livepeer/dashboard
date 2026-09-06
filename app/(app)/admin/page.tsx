import { redirect } from "next/navigation";
import AccessManager from "@/components/admin/AccessManager";
import AdminWorkspace from "@/components/admin/AdminWorkspace";
import { getAdminWaitlistSummary } from "@/lib/waitlist/admin";
import { getAdminPrincipal } from "@/lib/admin/auth";
import { getAuthenticatedIdentity } from "@/lib/authentication/session";
import { consoleSignInHref } from "@/lib/console/auth-login";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const admin = await getAdminPrincipal();
  if (!admin) {
    if (!(await getAuthenticatedIdentity()))
      redirect(consoleSignInHref({ returnTo: "/admin" }));
    redirect("/waitlist");
  }
  const summary = await getAdminWaitlistSummary();
  return (
    <main
      id="main-content"
      className="flex min-h-full flex-1 flex-col bg-dark text-fg"
    >
      <section className="w-full px-5 py-8 sm:px-7">
        <AdminWorkspace>
          <dl className="mt-8 grid grid-cols-1 gap-x-6 gap-y-8 min-[480px]:grid-cols-2 xl:grid-cols-4">
            {[
              ["Total signups", summary.totalSignups],
              ["Verified signups", summary.confirmedSignups],
              ["Total verified referrals", summary.totalVerifiedReferrals],
              ["Newsletter opt-ins", summary.newsletterSubscribers],
            ].map(([label, value]) => (
              <div key={label}>
                <dt className="whitespace-nowrap text-xs text-fg-muted">
                  {label}
                </dt>
                <dd className="mt-2 text-3xl font-light tabular-nums">
                  {Number(value).toLocaleString()}
                </dd>
              </div>
            ))}
          </dl>
          <AccessManager />
        </AdminWorkspace>
      </section>
    </main>
  );
}
