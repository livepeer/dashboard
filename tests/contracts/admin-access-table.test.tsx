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
import AccessManager from "@/components/admin/AccessManager";

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast }));

afterEach(() => {
  cleanup();
  toast.success.mockReset();
  toast.error.mockReset();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it("uses distinct, simplified MCP approval and revocation dialogs", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      Response.json({
        rows: [
          {
            id: "00000000-0000-4000-8000-000000000001",
            email: "alex@example.com",
            waitlistStatus: "confirmed",
            accessState: "pending",
            joinedAt: "2026-09-04T00:00:00Z",
            userId: null,
            newsletterSubscribed: false,
          },
        ],
        total: 1,
        page: 1,
        pageSize: 50,
      })
    )
  );
  render(<AccessManager />);
  fireEvent.click(
    await screen.findByRole("checkbox", { name: "Select alex@example.com" })
  );
  fireEvent.click(screen.getByRole("button", { name: "Allow" }));

  let dialog = await screen.findByRole("dialog");
  expect(within(dialog).getByText("Approve MCP access?")).toBeTruthy();
  expect(dialog.textContent).toContain(
    "Give 1 selected person access to Livepeer through MCP."
  );
  expect(
    within(dialog).getByRole("button", { name: "Approve MCP access" })
  ).toBeTruthy();
  expect(dialog.querySelector("img")?.getAttribute("src")).toBe(
    "/images/console/explore/flux-schnell.webp"
  );
  expect(dialog.className).toContain("sm:max-w-sm");
  expect(
    dialog.querySelector("[data-slot='dialog-close']")?.className
  ).toContain("bg-transparent");
  expect(
    within(dialog).getByRole("button", { name: "Cancel" }).className
  ).toContain("h-12");
  expect(
    within(dialog).getByRole("button", { name: "Approve MCP access" }).className
  ).toContain("h-12");
  expect(dialog.querySelector("details")).toBeNull();
  fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

  fireEvent.click(screen.getByRole("button", { name: "Approved" }));
  fireEvent.click(
    await screen.findByRole("checkbox", { name: "Select alex@example.com" })
  );
  fireEvent.click(screen.getByRole("button", { name: "Revoke selected" }));
  dialog = await screen.findByRole("dialog");
  expect(within(dialog).getByText("Revoke MCP access?")).toBeTruthy();
  expect(dialog.textContent).toContain(
    "Remove MCP access for 1 selected person. Running jobs won’t be stopped."
  );
  expect(
    within(dialog).getByRole("button", { name: "Revoke MCP access" })
  ).toBeTruthy();
  expect(dialog.querySelector("img")?.getAttribute("src")).toBe(
    "/images/console/explore/stable-video-diffusion.webp"
  );
});

it("settles a successful access change, refreshes the table, and shows a toast", async () => {
  const id = "00000000-0000-4000-8000-000000000001";
  let approved = false;
  const fetch = vi.fn(async (input: string, options?: RequestInit) => {
    if (input === "/api/admin/access" && options?.method === "POST") {
      const request = JSON.parse(String(options.body));
      approved = true;
      return Response.json({
        requestId: request.requestId,
        outcomes: [{ signupId: id, outcome: "approved" }],
      });
    }
    return Response.json({
      rows: approved
        ? []
        : [
            {
              id,
              email: "alex@example.com",
              waitlistStatus: "confirmed",
              accessState: "pending",
              joinedAt: "2026-09-04T00:00:00Z",
              userId: null,
              newsletterSubscribed: false,
            },
          ],
      total: approved ? 0 : 1,
      page: 1,
      pageSize: 50,
    });
  });
  vi.stubGlobal("fetch", fetch);
  render(<AccessManager />);

  fireEvent.click(
    await screen.findByRole("checkbox", { name: "Select alex@example.com" })
  );
  fireEvent.click(screen.getByRole("button", { name: "Allow" }));
  const dialog = await screen.findByRole("dialog");
  fireEvent.click(
    within(dialog).getByRole("button", { name: "Approve MCP access" })
  );

  await waitFor(() =>
    expect(toast.success).toHaveBeenCalledWith(
      "MCP access approved for 1 person."
    )
  );
  await screen.findByText("No matching entries.");
  expect(
    screen.queryByRole("region", { name: "Bulk action results" })
  ).toBeNull();
  expect(screen.queryByRole("button", { name: "Allow" })).toBeNull();
  expect(
    (screen.getByRole("button", { name: "Approved" }) as HTMLButtonElement)
      .disabled
  ).toBe(false);
});

it("scopes actions and selections to the selected status section", async () => {
  const fetch = vi.fn(async () =>
    Response.json({
      rows: [
        {
          id: "00000000-0000-4000-8000-000000000001",
          email: "alex@example.com",
          waitlistStatus: "confirmed",
          accessState: "pending",
          joinedAt: "2026-09-04T00:00:00Z",
          userId: null,
          newsletterSubscribed: false,
        },
      ],
      total: 1,
      page: 1,
      pageSize: 50,
    })
  );
  vi.stubGlobal("fetch", fetch);
  render(<AccessManager />);
  fireEvent.click(screen.getByRole("button", { name: "Waitlist" }));
  const selected = await screen.findByRole("checkbox", {
    name: "Select alex@example.com",
  });
  expect(selected.className).toContain("bg-white");
  expect(selected.className).not.toContain("emerald");
  expect(
    screen.getByRole("checkbox", { name: "Select all" }).className
  ).toContain("checked:border-black");
  expect(
    screen
      .getByRole("button", { name: "Waitlist" })
      .getAttribute("aria-pressed")
  ).toBe("true");
  expect(screen.queryByRole("button", { name: "All entries" })).toBeNull();
  expect(
    screen.getByRole("group", { name: "Selection actions" }).className
  ).toContain("h-12");
  expect(screen.queryByRole("button", { name: "Refresh list" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Allow" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Clear selection" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Export CSV" })).toBeNull();
  expect(
    screen.queryByRole("checkbox", { name: "Select this page" })
  ).toBeNull();
  expect(screen.getByRole("checkbox", { name: "Select all" })).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Revoke selected" })).toBeNull();
  fireEvent.click(selected);
  expect(
    selected.parentElement
      ?.querySelector("svg")
      ?.classList.contains("text-white")
  ).toBe(true);
  expect(selected.className).not.toContain("hover:");
  expect(
    (screen.getByRole("checkbox", { name: "Select all" }) as HTMLInputElement)
      .indeterminate
  ).toBe(true);
  expect(
    screen.getByRole("button", { name: "Clear selection" }).textContent
  ).toBe("1 selected");
  expect(selected.closest("tr")?.getAttribute("data-selected")).toBe("true");
  expect(selected.closest("tr")?.className).toBe(
    "transition-colors hover:bg-hover"
  );
  expect(
    screen.getByRole("group", { name: "Selection actions" }).className
  ).toContain("ml-auto");
  expect(screen.getByRole("button", { name: "Allow" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Allow" }).className).toContain(
    "h-12"
  );
  expect(
    screen.getByRole("button", { name: "Allow" }).getAttribute("data-slot")
  ).toBe("button");
  expect(selected.className).toContain("checked:bg-black");
  const csvButton = screen.getByRole("button", { name: "Export CSV" });
  expect(csvButton.textContent).toBe(".csv");
  expect(
    screen.getByRole("group", { name: "Selection actions" }).lastElementChild
      ?.textContent
  ).toBe("Allow");
  expect(
    csvButton.querySelector("svg.lucide-arrow-down-to-line")
  ).not.toBeNull();
  expect(
    screen.getByRole("button", { name: "Clear selection" }).className
  ).toContain("px-1.5");
  expect(screen.getByRole("button", { name: "Clear selection" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Export CSV" })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Approved" }));
  await waitFor(() =>
    expect(fetch).toHaveBeenLastCalledWith(
      expect.stringContaining("state=approved"),
      expect.anything()
    )
  );
  expect(screen.getByRole("status").textContent).toContain("0 selected");
  expect(screen.queryByRole("button", { name: "Allow" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Revoke selected" })).toBeNull();
  fireEvent.click(
    await screen.findByRole("checkbox", { name: "Select alex@example.com" })
  );
  expect(screen.getByRole("button", { name: "Revoke selected" })).toBeTruthy();
  expect(
    screen.getByRole("button", { name: "Revoke selected" }).className
  ).toContain("border-border");
  expect(
    screen.getByRole("group", { name: "Selection actions" }).lastElementChild
      ?.textContent
  ).toBe("Revoke selected");
  fireEvent.click(screen.getByRole("button", { name: "Waitlist" }));
  await waitFor(() =>
    expect(fetch).toHaveBeenLastCalledWith(
      expect.stringContaining("state=waiting"),
      expect.anything()
    )
  );
  fireEvent.click(screen.getByRole("button", { name: "Subscribed" }));
  await waitFor(() =>
    expect(fetch).toHaveBeenLastCalledWith(
      expect.stringContaining("state=subscribed"),
      expect.anything()
    )
  );
  expect(
    screen
      .getByRole("button", { name: "Waitlist" })
      .getAttribute("aria-pressed")
  ).toBe("false");
  expect(
    screen
      .getByRole("button", { name: "Subscribed" })
      .getAttribute("aria-pressed")
  ).toBe("true");
  expect(screen.queryByRole("button", { name: "Allow" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Revoke selected" })).toBeNull();
  expect(screen.queryByRole("combobox")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Unverified" }));
  await waitFor(() =>
    expect(fetch).toHaveBeenLastCalledWith(
      expect.stringContaining("state=unverified"),
      expect.anything()
    )
  );
  expect(screen.queryByRole("button", { name: "Allow" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Revoke selected" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Active" })).toBeNull();
});

it("lets vertical scrolling pass through the horizontally scrollable table", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      Response.json({ rows: [], total: 0, page: 1, pageSize: 50 })
    )
  );
  render(<AccessManager />);
  fireEvent.click(screen.getByRole("button", { name: "Waitlist" }));
  await screen.findByText("No matching entries.");
  const wrapper = screen.getByRole("table", {
    name: "Access entries",
  }).parentElement!;
  expect(wrapper.className).toContain("overflow-x-auto");
  expect(wrapper.className).toContain("-mx-5");
  expect(wrapper.querySelector("tbody")!.className).not.toContain("divide-");
  expect(
    Array.from(wrapper.querySelectorAll("th")).map((cell) => cell.textContent)
  ).toEqual(["Selection", "Email", "Joined"]);
  expect(wrapper.querySelector("thead")!.className).toBe("sr-only");
  expect(wrapper.style.overscrollBehaviorY).toBe("auto");
  expect(wrapper.style.overscrollBehaviorX).toBe("contain");
});

it("selects across pages and exports only the frozen IDs in bounded chunks", async () => {
  const ids = Array.from(
    { length: 501 },
    (_, index) =>
      `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`
  );
  const fetch = vi.fn(async (input: string, options?: RequestInit) => {
    if (input.startsWith("/api/admin/access/selection"))
      return Response.json({ signupIds: ids, total: ids.length });
    if (input === "/api/admin/access/export") {
      const { signupIds } = JSON.parse(String(options?.body));
      return Response.json({
        rows: signupIds.map((id: string) => ({
          email: `${id}@example.com`,
          joinedAt: "2026-09-04",
        })),
      });
    }
    return Response.json({
      rows: [
        {
          id: ids[0],
          email: "alex@example.com",
          joinedAt: "2026-09-04",
          accessState: "pending",
          waitlistStatus: "confirmed",
        },
      ],
      total: ids.length,
      page: 1,
      pageSize: 50,
    });
  });
  const create = vi.fn(() => "blob:fixture");
  vi.stubGlobal(
    "URL",
    class extends URL {
      static createObjectURL = create;
      static revokeObjectURL = vi.fn();
    }
  );
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  vi.stubGlobal("fetch", fetch);
  render(<AccessManager />);
  fireEvent.click(screen.getByRole("button", { name: "Waitlist" }));
  await screen.findByRole("checkbox", { name: "Select alex@example.com" });
  fireEvent.click(screen.getByRole("checkbox", { name: "Select all" }));
  await waitFor(() =>
    expect(screen.getByRole("status").textContent).toBe("501 selected")
  );
  fireEvent.click(screen.getByRole("button", { name: "Export CSV" }));
  await waitFor(() => expect(create).toHaveBeenCalledOnce());
  const chunks = fetch.mock.calls
    .filter(([url]) => url === "/api/admin/access/export")
    .map(([, options]) => JSON.parse(String(options?.body)).signupIds);
  expect(chunks.map((chunk) => chunk.length)).toEqual([500, 1]);
  expect(chunks.flat()).toEqual(ids);
  fireEvent.click(screen.getByRole("button", { name: "Clear selection" }));
  expect(screen.queryByRole("button", { name: "Allow" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Export CSV" })).toBeNull();
});
