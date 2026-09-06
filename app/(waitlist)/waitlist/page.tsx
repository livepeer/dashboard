import { AgentScrollerPage } from "@/components/livepeer-ui/agent-scroller-page";
import {
  capabilities,
  networkImages,
} from "@/components/livepeer-ui/frozen-content";
import { WaitlistSessionProvider } from "@/components/livepeer-ui/waitlist-session";
import { getCurrentWaitlistSession } from "@/lib/waitlist/current-session";

export default async function WaitlistPage() {
  const initialSession = await getCurrentWaitlistSession();

  return (
    <WaitlistSessionProvider initialSession={initialSession}>
      <AgentScrollerPage
        capabilities={capabilities}
        networkImages={networkImages}
      />
    </WaitlistSessionProvider>
  );
}
