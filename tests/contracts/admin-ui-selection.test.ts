import { describe, expect, it } from "vitest";
import {
  freezeAccessRequests,
  normalizeOutcomes,
  retryableRequests,
  toggleSelection,
} from "@/components/admin/access-selection";

describe("admin explicit selection contract", () => {
  it.each([1, 25, 100, 251])(
    "freezes %i arbitrary IDs into bounded chunks",
    (count) => {
      let sequence = 0;
      const source = new Set(
        Array.from({ length: count }, (_, index) => `signup-${index}`)
      );
      const requests = freezeAccessRequests(
        source,
        "approve",
        () => `request-${sequence++}`
      );
      source.clear();
      expect(requests.flatMap((request) => request.signupIds)).toHaveLength(
        count
      );
      expect(requests.every((request) => request.signupIds.length <= 100)).toBe(
        true
      );
      expect(new Set(requests.map((request) => request.requestId)).size).toBe(
        requests.length
      );
    }
  );

  it("keeps selection across pages and filter changes until explicit replacement", () => {
    const pageOne = toggleSelection(new Set(), ["first", "second"], true);
    const pageTwo = toggleSelection(pageOne, ["third"], true);
    const frozen = freezeAccessRequests(pageTwo, "revoke", () => "stable-key");
    const afterFilterChange = toggleSelection(pageTwo, ["fourth"], true);
    expect(afterFilterChange.size).toBe(4);
    expect(frozen[0].signupIds).toEqual(["first", "second", "third"]);
    expect(toggleSelection(pageTwo, ["first"], false)).toEqual(
      new Set(["second", "third"])
    );
    expect(pageOne).toEqual(new Set(["first", "second"]));
  });

  it("deduplicates and sorts IDs for a stable payload", () => {
    expect(
      freezeAccessRequests(["b", "a", "b"], "approve", () => "key")
    ).toEqual([{ requestId: "key", action: "approve", signupIds: ["a", "b"] }]);
    expect(freezeAccessRequests([], "approve")).toEqual([]);
  });

  it("retries partial failures with original request ID and full payload", () => {
    const requests = freezeAccessRequests(
      ["a", "b"],
      "approve",
      () => "original"
    );
    const retry = retryableRequests(requests, [
      { signupId: "a", outcome: "approved" },
      { signupId: "b", outcome: "failed" },
    ]);
    expect(retry[0]).toBe(requests[0]);
    expect(retry[0].signupIds).toEqual(["a", "b"]);
    expect(retry[0].requestId).toBe("original");
  });

  it("does not repeat completed chunks including ineligible outcomes", () => {
    const requests = freezeAccessRequests(
      ["a", "b"],
      "approve",
      () => "original"
    );
    expect(
      retryableRequests(requests, [
        { signupId: "a", outcome: "unchanged" },
        { signupId: "b", outcome: "ineligible" },
      ])
    ).toEqual([]);
    expect(retryableRequests(requests, [])).toEqual(requests);
  });

  it("only accepts matching per-record results for the matching request", () => {
    const request = freezeAccessRequests(
      ["a", "b"],
      "approve",
      () => "original"
    )[0];
    expect(
      normalizeOutcomes(request, {
        requestId: "original",
        outcomes: [
          { signupId: "a", outcome: "approved" },
          { signupId: "outside", outcome: "approved" },
        ],
      })
    ).toEqual([
      { signupId: "a", outcome: "approved" },
      { signupId: "b", outcome: "failed", code: "invalid_response" },
    ]);
    expect(
      normalizeOutcomes(request, {
        requestId: "wrong",
        outcomes: [{ signupId: "a", outcome: "approved" }],
      }).every((result) => result.outcome === "failed")
    ).toBe(true);
    expect(
      normalizeOutcomes(request, {
        requestId: "original",
        outcomes: [
          { signupId: "a", outcome: "approved" },
          { signupId: "a", outcome: "revoked" },
          { signupId: "b", outcome: "invented" },
        ],
      }).every((result) => result.outcome === "failed")
    ).toBe(true);
  });
});
