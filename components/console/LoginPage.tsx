"use client";

import { AuthPanel, type AuthMode } from "@/components/console/auth/AuthPanel";
import { AuthScreen } from "@/components/console/auth/AuthScreen";

interface LoginPageProps {
  mode?: AuthMode;
  returnTo?: string;
}

export default function LoginPage({
  mode = "signin",
  returnTo = "/home",
}: LoginPageProps) {
  return (
    <AuthScreen>
      <AuthPanel mode={mode} returnTo={returnTo} />
    </AuthScreen>
  );
}
