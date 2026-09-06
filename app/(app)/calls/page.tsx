import { redirect } from "next/navigation";
import { requireConsolePage } from "@/lib/access/page";

/**
 * `/calls` folded into `/home` for the creator pilot — the call log now
 * renders on Home rather than as its own destination.
 *
 * The route stays as a redirect because `?request=<id>` links to a single call
 * are already in the wild (the app-detail log table, the Home activity panel
 * before it was removed, anything anyone bookmarked). The param carries over
 * so those still open the call drawer, just on Home.
 */
export default async function CallsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const request = params.request;
  const id = Array.isArray(request) ? request[0] : request;
  await requireConsolePage(
    id ? `/calls?request=${encodeURIComponent(id)}` : "/calls"
  );
  redirect(id ? `/home?request=${encodeURIComponent(id)}` : "/home");
}
