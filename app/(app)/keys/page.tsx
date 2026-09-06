import { requireConsolePage } from "@/lib/access/page";
import KeysView from "@/components/console/KeysView";

export const dynamic = "force-dynamic";
export default async function KeysPage() {
  await requireConsolePage("/keys");
  return <KeysView />;
}
