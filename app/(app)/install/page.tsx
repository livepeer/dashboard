import { requireConsolePage } from "@/lib/access/page";
import InstallContent from "./InstallContent";

export const dynamic = "force-dynamic";
export default async function InstallPage() {
  await requireConsolePage("/install");
  return <InstallContent />;
}
