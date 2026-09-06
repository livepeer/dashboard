import { redirect } from "next/navigation";
import { requireConsolePage } from "@/lib/access/page";

export default async function LegacyUsagePage() {
  await requireConsolePage("/usage");
  redirect("/home");
}
