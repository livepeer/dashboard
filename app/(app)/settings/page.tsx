import { redirect } from "next/navigation";
import { requireConsolePage } from "@/lib/access/page";

export default async function LegacySettingsPage() {
  await requireConsolePage("/settings");
  redirect("/home");
}
