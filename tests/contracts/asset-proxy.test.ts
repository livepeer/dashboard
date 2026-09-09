import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:dns/promises", () => ({ lookup: vi.fn() }));
vi.mock("@/lib/mcp/store", () => ({ getAssetSource: vi.fn() }));

import { lookup } from "node:dns/promises";
import { getAssetSource } from "@/lib/mcp/store";
import { GET } from "@/app/api/assets/[id]/route";

describe("first-party asset proxy", () => {
  beforeEach(() => {
    vi.mocked(lookup).mockReset();
    vi.mocked(getAssetSource).mockReset();
    vi.unstubAllGlobals();
  });

  it("streams stored media and preserves byte-range requests", async () => {
    vi.mocked(getAssetSource).mockResolvedValue({
      url: "https://media.example.test/video.mp4",
      mediaType: "video",
    });
    vi.mocked(lookup).mockResolvedValue([
      { address: "203.0.113.10", family: 4 },
    ] as never);
    const fetcher = vi.fn().mockResolvedValue(
      new Response("bytes", {
        status: 206,
        headers: {
          "content-type": "video/mp4",
          "content-range": "bytes 0-4/10",
        },
      })
    );
    vi.stubGlobal("fetch", fetcher);

    const response = await GET(
      new Request("https://earlyaccess.livepeer.org/api/assets/asset_123", {
        headers: { Range: "bytes=0-4" },
      }),
      { params: Promise.resolve({ id: "asset_123" }) }
    );

    expect(response.status).toBe(206);
    expect(response.headers.get("content-type")).toBe("video/mp4");
    expect(await response.text()).toBe("bytes");
    expect(fetcher).toHaveBeenCalledWith(
      new URL("https://media.example.test/video.mp4"),
      expect.objectContaining({
        credentials: "omit",
        redirect: "manual",
        headers: expect.objectContaining({
          Range: "bytes=0-4",
          "Accept-Encoding": "identity",
        }),
      })
    );
  });

  it("refuses asset origins that resolve to a private address", async () => {
    vi.mocked(getAssetSource).mockResolvedValue({
      url: "https://media.example.test/video.mp4",
      mediaType: "video",
    });
    vi.mocked(lookup).mockResolvedValue([
      { address: "127.0.0.1", family: 4 },
    ] as never);
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);

    const response = await GET(
      new Request("https://earlyaccess.livepeer.org/api/assets/asset_123"),
      { params: Promise.resolve({ id: "asset_123" }) }
    );

    expect(response.status).toBe(502);
    expect(fetcher).not.toHaveBeenCalled();
  });
});
