// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import TeamManager from "@/components/admin/TeamManager";
import type { AdminTeamMember } from "@/lib/platform/contracts";

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast }));

afterEach(() => {
  cleanup();
  toast.success.mockReset();
  toast.error.mockReset();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const members: AdminTeamMember[] = [
  {
    grantId: "00000000-0000-4000-8000-000000000001",
    signupId: "00000000-0000-4000-8000-000000000011",
    email: "me@example.com",
    grantedAt: "2026-09-01T00:00:00.000Z",
    isCurrentUser: true,
  },
  {
    grantId: "00000000-0000-4000-8000-000000000002",
    signupId: "00000000-0000-4000-8000-000000000012",
    email: "teammate@example.com",
    grantedAt: "2026-09-02T00:00:00.000Z",
    isCurrentUser: false,
  },
];

it("adds and revokes administrators from the team section", async () => {
  let active = [...members];
  const fetch = vi.fn(async (input: string, init?: RequestInit) => {
    if (init?.method === "POST") {
      const added: AdminTeamMember = {
        grantId: "00000000-0000-4000-8000-000000000003",
        signupId: "00000000-0000-4000-8000-000000000013",
        email: JSON.parse(String(init.body)).email,
        grantedAt: "2026-09-08T00:00:00.000Z",
        isCurrentUser: false,
      };
      active.push(added);
      return Response.json({ member: added, outcome: "added" });
    }
    if (init?.method === "DELETE") {
      const { grantId } = JSON.parse(String(init.body));
      active = active.filter((item) => item.grantId !== grantId);
      return Response.json({ grantId, outcome: "revoked" });
    }
    return Response.json({ members: active });
  });
  vi.stubGlobal("fetch", fetch);
  render(<TeamManager />);

  await screen.findByRole("table", { name: "Admin team members" });
  expect(await screen.findByText("teammate@example.com")).toBeTruthy();
  const description = screen.getByText(
    "Admins can grant or revoke platform access, as well as add or remove other admins."
  );
  expect(description.className).toContain("max-w-md");
  expect(description.parentElement?.className).toContain("min-w-0");
  const header = description.parentElement?.parentElement;
  expect(header?.className).toContain("items-start");
  expect(header?.className).toContain("border-b");
  expect(header?.className).toContain("border-hairline");
  expect(header?.className).not.toContain("flex-wrap");
  const selectionToolbar = screen.getByTestId("team-selection-toolbar");
  expect(selectionToolbar.className).toContain("h-12");
  expect(selectionToolbar.className).toContain("mt-3");
  expect(selectionToolbar.className).not.toContain("border-b");

  fireEvent.click(
    screen.getByRole("checkbox", { name: "Select me@example.com" })
  );
  expect(screen.queryByRole("button", { name: "Revoke access" })).toBeNull();
  fireEvent.click(
    screen.getByRole("checkbox", { name: "Select teammate@example.com" })
  );
  fireEvent.click(screen.getByRole("button", { name: "Revoke access" }));
  const revokeDialog = await screen.findByRole("dialog");
  expect(revokeDialog.textContent).toContain("teammate@example.com");
  fireEvent.click(
    within(revokeDialog).getByRole("button", { name: "Revoke access" })
  );
  await waitFor(() =>
    expect(
      fetch.mock.calls.some(
        ([url, init]) => url === "/api/admin/team" && init?.method === "DELETE"
      )
    ).toBe(true)
  );
  expect(toast.success).toHaveBeenCalledWith(
    "teammate@example.com no longer has administrator access."
  );
  await waitFor(() =>
    expect(screen.queryByText("teammate@example.com")).toBeNull()
  );

  fireEvent.click(screen.getByRole("button", { name: "Add admin" }));
  const addDialog = await screen.findByRole("dialog");
  fireEvent.change(within(addDialog).getByLabelText("Email address"), {
    target: { value: "new@example.com" },
  });
  fireEvent.click(within(addDialog).getByRole("button", { name: "Add admin" }));
  await waitFor(() =>
    expect(
      fetch.mock.calls.some(
        ([url, init]) => url === "/api/admin/team" && init?.method === "POST"
      )
    ).toBe(true)
  );
  expect(await screen.findByText("new@example.com")).toBeTruthy();
  expect(toast.success).toHaveBeenCalledWith(
    "new@example.com was added as an admin."
  );
});
