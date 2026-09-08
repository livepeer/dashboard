import { notFound } from "next/navigation";
import AccessManager from "@/components/admin/AccessManager";
import AdminWorkspace from "@/components/admin/AdminWorkspace";
import TeamManager from "@/components/admin/TeamManager";

export const dynamic = "force-dynamic";

export default function AdminPreviewPage() {
  if (
    process.env.NODE_ENV === "production" ||
    process.env.CONSOLE_DEV_MOCK !== "1"
  )
    notFound();

  const summary = [
    ["Total signups", 1842],
    ["Verified signups", 1376],
    ["Total verified referrals", 492],
    ["Newsletter opt-ins", 918],
  ] as const;

  return (
    <main
      id="main-content"
      className="flex min-h-full flex-1 flex-col bg-dark text-fg"
    >
      <section className="w-full px-5 py-8 sm:px-7">
        <AdminWorkspace team={<TeamManager />}>
          <dl className="mt-8 grid grid-cols-1 gap-x-6 gap-y-8 min-[480px]:grid-cols-2 xl:grid-cols-4">
            {summary.map(([label, value]) => (
              <div key={label}>
                <dt className="whitespace-nowrap text-xs text-fg-muted">
                  {label}
                </dt>
                <dd className="mt-2 text-3xl font-light tabular-nums">
                  {value.toLocaleString()}
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
