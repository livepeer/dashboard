import { Suspense } from "react";
import { requireConsolePage } from "@/lib/access/page";
import ConsolePageSkeleton from "@/components/console/ConsolePageSkeleton";
import UsageView from "@/components/console/UsageView";

export const dynamic = "force-dynamic";
export default async function HomePage() {
  await requireConsolePage("/home");
  return (
    <Suspense fallback={<ConsolePageSkeleton kpiCount={4} withChart />}>
      <main id="main-content" className="flex flex-1 flex-col bg-dark">
        <div className="flex flex-1 flex-col">
          <UsageView />
        </div>
      </main>
    </Suspense>
  );
}
