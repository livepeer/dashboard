"use client";

import { useEffect, useState } from "react";
import { Plus, X } from "lucide-react";
import { toast } from "sonner";
import SectionHeader from "@/components/console/SectionHeader";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { AdminTeamList, AdminTeamMember } from "@/lib/platform/contracts";
import SelectionCheckbox from "./SelectionCheckbox";

const ERROR_MESSAGES: Record<string, string> = {
  admin_account_not_eligible:
    "That email must belong to an active, verified Console account before it can be added as an admin.",
  admin_access_revoked:
    "That account’s Console access is revoked. Restore Console access before adding it as an admin.",
  cannot_revoke_self: "You can’t revoke your own administrator access.",
  admin_member_not_found: "That team member is no longer an active admin.",
  admin_required:
    "Your administrator session is unavailable. Sign in to Console again.",
};

async function responseError(response: Response, fallback: string) {
  try {
    const body = (await response.json()) as { error?: string };
    return (body.error && ERROR_MESSAGES[body.error]) || fallback;
  } catch {
    return fallback;
  }
}

export default function TeamManager({
  embedded = false,
}: {
  embedded?: boolean;
}) {
  const [list, setList] = useState<AdminTeamList | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [addError, setAddError] = useState("");
  const [revokeTarget, setRevokeTarget] = useState<AdminTeamMember | null>(
    null
  );
  const [revokeError, setRevokeError] = useState("");
  const [working, setWorking] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    void fetch("/api/admin/team", {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok)
          throw new Error(
            await responseError(response, "Could not load the admin team.")
          );
        const result = (await response.json()) as AdminTeamList;
        if (!Array.isArray(result.members))
          throw new Error("Could not load the admin team.");
        if (!controller.signal.aborted) {
          setList(result);
          setSelected((current) =>
            result.members.some((item) => item.grantId === current)
              ? current
              : null
          );
        }
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted)
          setError(
            cause instanceof Error
              ? cause.message
              : "Could not load the admin team."
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [reload]);

  const selectedMember =
    list?.members.find((item) => item.grantId === selected) ?? null;

  async function submitAdmin(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (working || !email.trim()) return;
    setWorking(true);
    setAddError("");
    try {
      const response = await fetch("/api/admin/team", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      if (!response.ok)
        throw new Error(
          await responseError(response, "Could not add this administrator.")
        );
      const result = (await response.json()) as {
        member: AdminTeamMember;
        outcome: "added" | "restored" | "unchanged";
      };
      setAddOpen(false);
      setEmail("");
      setAddError("");
      setList((current) =>
        current
          ? {
              members: [
                result.member,
                ...current.members.filter(
                  (member) => member.grantId !== result.member.grantId
                ),
              ],
            }
          : current
      );
      toast.success(
        result.outcome === "unchanged"
          ? `${result.member.email} is already an admin.`
          : `${result.member.email} was added as an admin.`
      );
      setReload((value) => value + 1);
    } catch (cause) {
      const message =
        cause instanceof Error
          ? cause.message
          : "Could not add this administrator.";
      setAddError(message);
      toast.error(message);
    } finally {
      setWorking(false);
    }
  }

  async function confirmRevoke() {
    if (working || !revokeTarget) return;
    setWorking(true);
    setRevokeError("");
    try {
      const response = await fetch("/api/admin/team", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ grantId: revokeTarget.grantId }),
      });
      if (!response.ok)
        throw new Error(
          await responseError(
            response,
            "Could not revoke administrator access."
          )
        );
      setList((current) =>
        current
          ? {
              members: current.members.filter(
                (member) => member.grantId !== revokeTarget.grantId
              ),
            }
          : current
      );
      toast.success(
        `${revokeTarget.email} no longer has administrator access.`
      );
      setRevokeTarget(null);
      setRevokeError("");
      setSelected(null);
      setReload((value) => value + 1);
    } catch (cause) {
      const message =
        cause instanceof Error
          ? cause.message
          : "Could not revoke administrator access.";
      setRevokeError(message);
      toast.error(message);
    } finally {
      setWorking(false);
    }
  }

  return (
    <section className={embedded ? "mt-6" : "mt-12"} aria-label="Team">
      <SectionHeader
        variant="default"
        title={embedded ? "Administrators" : "Team"}
        description="Admins can grant or revoke platform access, as well as add or remove other admins."
        descriptionClassName="max-w-md"
        className="flex items-start justify-between gap-3 border-b border-hairline pb-4"
        action={
          <Button
            type="button"
            size="sm"
            className="rounded-sm"
            onClick={() => {
              setError("");
              setAddError("");
              setAddOpen(true);
            }}
          >
            <Plus className="size-3.5" aria-hidden="true" />
            Add admin
          </Button>
        }
      />
      <div
        className="mt-3 flex h-12 items-center justify-end gap-2"
        data-testid="team-selection-toolbar"
      >
        {selectedMember && (
          <button
            type="button"
            className="inline-flex items-center gap-1 rounded-[4px] border border-hairline px-1.5 py-0.5 text-[11.5px] text-fg-muted transition-colors hover:bg-hover focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            aria-label="Clear team selection"
            onClick={() => setSelected(null)}
          >
            <span>1 selected</span>
            <X className="size-3" aria-hidden="true" />
          </button>
        )}
        {selectedMember && !selectedMember.isCurrentUser && (
          <Button
            type="button"
            variant="outline"
            size="lg"
            className="h-12 rounded-sm px-4"
            disabled={working}
            onClick={() => {
              setRevokeError("");
              setRevokeTarget(selectedMember);
            }}
          >
            Revoke access
          </Button>
        )}
      </div>
      {error && (
        <p className="mt-4 text-sm text-red-500" role="alert">
          {error}
        </p>
      )}
      <div
        className="-mx-5 mt-4 overflow-x-auto sm:-mx-7"
        style={{ overscrollBehaviorY: "auto", overscrollBehaviorX: "contain" }}
        aria-busy={loading}
      >
        <table
          aria-label="Admin team members"
          className="w-full min-w-[420px] text-left text-[12.5px]"
        >
          <colgroup>
            <col className="w-12" />
            <col />
            <col />
          </colgroup>
          <thead className="sr-only">
            <tr>
              <th scope="col">Selection</th>
              <th scope="col">Email</th>
              <th scope="col">Added</th>
            </tr>
          </thead>
          <tbody>
            {list?.members.map((item) => (
              <tr
                key={item.grantId}
                data-selected={selected === item.grantId}
                className="transition-colors hover:bg-hover"
              >
                <td className="py-2.5 pl-5 pr-3 sm:pl-7">
                  <SelectionCheckbox
                    aria-label={`Select ${item.email}`}
                    checked={selected === item.grantId}
                    disabled={working}
                    onChange={(event) =>
                      setSelected(event.target.checked ? item.grantId : null)
                    }
                  />
                </td>
                <td className="px-3 py-2.5 font-medium text-fg-strong">
                  {item.email}
                  {item.isCurrentUser && (
                    <span className="ml-2 font-normal text-fg-faint">You</span>
                  )}
                </td>
                <td className="whitespace-nowrap py-2.5 pl-3 pr-5 text-right text-fg-faint tabular-nums sm:pr-7">
                  {new Date(item.grantedAt).toLocaleDateString()}
                </td>
              </tr>
            ))}
            {(!list || !list.members.length) && (
              <tr>
                <td className="p-6 text-fg-muted" colSpan={3}>
                  {loading
                    ? "Loading team…"
                    : error
                      ? "Team unavailable."
                      : "No administrators found."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Dialog
        open={addOpen}
        onOpenChange={(open) => {
          if (!working) {
            setAddOpen(open);
            if (!open) setAddError("");
          }
        }}
      >
        <DialogContent>
          <form onSubmit={submitAdmin} className="grid gap-6">
            <DialogHeader>
              <DialogTitle>Add an admin</DialogTitle>
              <DialogDescription>
                Enter the email for an active, verified Console account. This
                person will be able to manage Console access and the admin team.
              </DialogDescription>
            </DialogHeader>
            <div>
              <label
                htmlFor="admin-email"
                className="mb-2 block text-xs font-medium text-fg-muted"
              >
                Email address
              </label>
              <Input
                id="admin-email"
                name="email"
                type="email"
                autoComplete="email"
                autoFocus
                required
                maxLength={320}
                placeholder="admin@example.com"
                value={email}
                disabled={working}
                onChange={(event) => setEmail(event.target.value)}
              />
              {addError && (
                <p className="mt-2 text-xs text-red-500" role="alert">
                  {addError}
                </p>
              )}
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                disabled={working}
                onClick={() => setAddOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={working || !email.trim()}>
                {working ? "Adding…" : "Add admin"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!revokeTarget}
        onOpenChange={(open) => {
          if (!open && !working) {
            setRevokeTarget(null);
            setRevokeError("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Revoke administrator access?</DialogTitle>
            <DialogDescription>
              {revokeTarget?.email} will immediately lose access to this admin
              area. Their regular Console access will not be changed.
            </DialogDescription>
          </DialogHeader>
          {revokeError && (
            <p className="text-xs text-red-500" role="alert">
              {revokeError}
            </p>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={working}
              onClick={() => {
                setRevokeTarget(null);
                setRevokeError("");
              }}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={working}
              onClick={() => void confirmRevoke()}
            >
              {working ? "Revoking…" : "Revoke access"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
