import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getAuthenticatedIdentity } from "@/lib/authentication/session";
import { safeReturnTo } from "@/lib/console/auth-login";
import LoginPage from "@/components/console/LoginPage";
import { identitySyncPath } from "@/lib/identity/sync-return";

export const metadata: Metadata = {
  title: "Sign up — Livepeer Early Access",
};

export default async function SignupRoute({
  searchParams,
}: {
  searchParams: Promise<{ returnTo?: string }>;
}) {
  const params = await searchParams;
  const returnTo = safeReturnTo(params.returnTo);
  const identity = await getAuthenticatedIdentity();
  if (identity) redirect(identitySyncPath(returnTo));
  return <LoginPage mode="signup" returnTo={returnTo} />;
}
