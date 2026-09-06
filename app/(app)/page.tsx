import { redirect } from "next/navigation";
import { identitySyncPath } from "@/lib/identity/sync-return";

export const dynamic = "force-dynamic";

export default async function RootPage({
  searchParams,
}: {
  searchParams: Promise<{ ref?: string }>;
}) {
  const params = await searchParams;
  if (params.ref?.trim())
    redirect(`/waitlist?ref=${encodeURIComponent(params.ref.trim())}`);
  redirect(identitySyncPath("/home"));
}
