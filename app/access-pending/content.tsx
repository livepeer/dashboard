import { AuthScreen } from "@/components/console/auth/AuthScreen";
import { AuthCard } from "@/components/console/auth/AuthCard";
import { AccountAvatar } from "@/components/console/auth/AccountAvatar";
import { ReferralCard } from "@/components/console/ReferralCard";

export type WaitingState =
  | "pending"
  | "verify-email"
  | "revoked"
  | "disabled"
  | "enrollment-attention"
  | "unavailable";

export const waitingCopy: Record<WaitingState, { title: string }> = {
  pending: { title: "You’re on the waitlist." },
  "verify-email": { title: "Verify your email to continue." },
  revoked: { title: "Your Console access is paused." },
  disabled: { title: "Your account is disabled." },
  "enrollment-attention": { title: "We couldn’t connect your waitlist entry." },
  unavailable: { title: "We can’t check your access right now." },
};

export function WaitingContent({
  state,
  referralUrl = null,
  email,
  avatarUrl,
}: {
  state: WaitingState;
  referralUrl?: string | null;
  email?: string;
  avatarUrl?: string;
}) {
  const copy = waitingCopy[state];
  return (
    <AuthScreen>
      <AuthCard label={copy.title}>
        <div className="pt-2 text-center">
          <h1
            id="access-title"
            className="mb-5 text-xl font-medium text-balance"
          >
            {copy.title}
          </h1>
          <AccountAvatar email={email} avatarUrl={avatarUrl} />
          <p className="mt-3 break-words text-sm text-muted-foreground">
            {email || "Signed-in account"}
          </p>
        </div>
        {state === "pending" && (
          <div className="mt-6 flex justify-center">
            <ReferralCard referralUrl={referralUrl} compact />
          </div>
        )}
        <div className="mt-6 text-center text-sm">
          <a
            className="text-muted-foreground underline underline-offset-4 hover:text-foreground"
            href="/auth/logout"
          >
            Sign out
          </a>
        </div>
      </AuthCard>
    </AuthScreen>
  );
}
