import { expect, it } from "vitest";
import {
  MAX_GATEWAY_REQUEST_IDS,
  takeGatewayRequestIds,
} from "@/lib/console/gateway-request-ids";

it("keeps the open detail id when a full page would overflow the usage lookup", () => {
  const page = Array.from(
    { length: MAX_GATEWAY_REQUEST_IDS },
    (_, i) => `job_page_${i}`
  );
  const ids = takeGatewayRequestIds(page, "job_detail");
  expect(ids).toHaveLength(MAX_GATEWAY_REQUEST_IDS);
  expect(ids[0]).toBe("job_detail");
  expect(ids).not.toContain("job_page_49");
  expect(ids).toContain("job_page_0");
});

it("does not duplicate a detail id that is already on the page", () => {
  const page = Array.from(
    { length: MAX_GATEWAY_REQUEST_IDS },
    (_, i) => `job_page_${i}`
  );
  const ids = takeGatewayRequestIds(page, "job_page_0");
  expect(ids).toEqual(page);
});
