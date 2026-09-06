import type { ReactNode } from "react";
import { AuthMediaRing } from "./AuthMediaRing";

export function AuthScreen({ children }: { children: ReactNode }) {
  return (
    <main className="relative flex min-h-screen flex-col overflow-hidden bg-background font-sans text-foreground">
      <AuthMediaRing />
      <div className="relative z-10 flex flex-1 items-center justify-center px-4 py-10 sm:px-6">
        {children}
      </div>
    </main>
  );
}
