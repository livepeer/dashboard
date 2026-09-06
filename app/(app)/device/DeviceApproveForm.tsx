"use client";

import { useState, type ReactNode } from "react";
import Button from "@/components/design-system/Button";
import ConsolePageHeader from "@/components/console/ConsolePageHeader";

export function DevicePageChrome({ children }: { children: ReactNode }) {
  return (
    <>
      <ConsolePageHeader title="Device sign-in" />
      <div className="mx-auto w-full max-w-5xl px-6 py-8">{children}</div>
    </>
  );
}

export default function DeviceApproveForm({
  iss,
  targetLinkUri,
  userCode,
  clientId,
}: {
  iss: string;
  targetLinkUri: string;
  userCode: string;
  clientId: string;
}) {
  const [phase, setPhase] = useState<"idle" | "submitting" | "ok" | "error">(
    "idle"
  );
  const [error, setError] = useState("");

  async function approve() {
    setError("");
    setPhase("submitting");
    try {
      const response = await fetch("/api/v1/auth/device/approve", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          iss,
          target_link_uri: targetLinkUri,
        }),
      });
      const json = (await response.json()) as {
        ok?: boolean;
        error?: string;
      };
      if (!response.ok || !json.ok) {
        setPhase("error");
        setError(json.error ?? "Approval failed");
        return;
      }
      setPhase("ok");
    } catch {
      setPhase("error");
      setError("We couldn’t confirm device approval. Please try again.");
    }
  }

  if (phase === "ok") {
    return (
      <p className="text-sm text-fg-strong">
        Device approved. Return to your agent — polling will finish on its own.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-fg-muted">
        Approve this device code for app{" "}
        <code className="font-mono text-fg-strong">{clientId}</code>.
      </p>
      <p className="text-base font-semibold tabular-nums tracking-wider">
        {userCode}
      </p>
      <Button
        type="button"
        variant="white"
        size="sm"
        disabled={phase === "submitting"}
        onClick={() => void approve()}
      >
        {phase === "submitting" ? "Approving…" : "Approve device"}
      </Button>
      {error ? (
        <p role="alert" className="text-sm text-red-400">
          {error}
        </p>
      ) : null}
    </div>
  );
}
