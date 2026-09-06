import assert from "node:assert/strict";
import { test } from "node:test";
import { externalUserIdFromSub } from "./external-user-id";

test("hashes Auth0 sub into the pymthouse charset", async () => {
  const id = await externalUserIdFromSub("github|12345");
  assert.equal(
    id,
    "eu_2e47a2d124d5a54e2a598a641ff373212fbf69103b1b8c3da775ad449e0f3faa"
  );
});

test("is deterministic and case-sensitive on sub", async () => {
  const a = await externalUserIdFromSub("auth0|abc");
  const b = await externalUserIdFromSub("auth0|abc");
  const c = await externalUserIdFromSub("auth0|Abc");
  assert.equal(a, b);
  assert.notEqual(a, c);
});
