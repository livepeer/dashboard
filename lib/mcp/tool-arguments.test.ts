import assert from "node:assert/strict";
import { test } from "node:test";

import { defaultOmittedToolArguments } from "./tool-arguments";

test("tools/call without arguments gets an empty object", () => {
  const body = {
    jsonrpc: "2.0",
    id: 1,
    method: "tools/call",
    params: { name: "get_recent_assets" },
  };
  assert.deepEqual(defaultOmittedToolArguments(body), {
    ...body,
    params: { name: "get_recent_assets", arguments: {} },
  });
});

test("tools/call keeps supplied arguments", () => {
  const body = {
    jsonrpc: "2.0",
    id: 1,
    method: "tools/call",
    params: { name: "search_assets", arguments: { query: "flux" } },
  };
  assert.equal(defaultOmittedToolArguments(body), body);
});

test("non-tool JSON-RPC messages are unchanged", () => {
  const initialize = {
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: { protocolVersion: "2025-03-26" },
  };
  assert.equal(defaultOmittedToolArguments(initialize), initialize);
  assert.equal(defaultOmittedToolArguments(null), null);
  assert.deepEqual(
    defaultOmittedToolArguments([
      initialize,
      {
        jsonrpc: "2.0",
        id: 2,
        method: "tools/call",
        params: { name: "list_capabilities" },
      },
    ]),
    [
      initialize,
      {
        jsonrpc: "2.0",
        id: 2,
        method: "tools/call",
        params: { name: "list_capabilities", arguments: {} },
      },
    ]
  );
});
