import assert from "node:assert/strict";
import { test } from "node:test";

import {
  parseFalInputSchema,
  resolveFalCatalogEntry,
} from "./fal-input-schema";

const document = {
  paths: {
    "/fal-ai/example": {
      post: {
        requestBody: {
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/Input" },
            },
          },
        },
      },
    },
  },
  components: {
    schemas: {
      Input: {
        type: "object",
        required: ["prompt"],
        properties: {
          prompt: {
            type: "string",
            description: "Describe the output.",
          },
          image_size: {
            description: "The size of the generated image.",
            anyOf: [
              { $ref: "#/components/schemas/ImageSize" },
              { type: "string", enum: ["square", "landscape_16_9"] },
            ],
            default: "square",
          },
          keyframes: {
            type: "array",
            items: { $ref: "#/components/schemas/Keyframe" },
          },
        },
      },
      ImageSize: {
        type: "object",
        properties: {
          width: { type: "integer", minimum: 1, maximum: 4096 },
          height: { type: "integer", minimum: 1, maximum: 4096 },
        },
      },
      Keyframe: {
        type: "object",
        required: ["image_url", "timestamp_seconds"],
        properties: {
          image_url: { type: "string", description: "A frame image." },
          timestamp_seconds: { type: "number", minimum: 0 },
        },
      },
    },
  },
};

test("parses nested, array, enum, constraint, default, and required metadata", () => {
  const schema = parseFalInputSchema(document, "fal-ai/example", "hash");
  assert.ok(schema);
  assert.deepEqual(
    schema.fields.find((field) => field.path === "image_size"),
    {
      path: "image_size",
      title: null,
      description: "The size of the generated image.",
      required: false,
      types: ["object", "string"],
      options: ["square", "landscape_16_9"],
      defaultValue: "square",
    }
  );
  assert.equal(
    schema.fields.find((field) => field.path === "prompt")?.required,
    true
  );
  assert.deepEqual(
    schema.fields.find((field) => field.path === "image_size.width"),
    {
      path: "image_size.width",
      title: null,
      description: null,
      required: false,
      types: ["integer"],
      options: [],
      minimum: 1,
      maximum: 4096,
    }
  );
  assert.equal(
    schema.fields.find((field) => field.path === "keyframes.*.image_url")
      ?.description,
    "A frame image."
  );
});

test("resolves advertised capabilities by app id or provider endpoint id", () => {
  assert.equal(
    resolveFalCatalogEntry({ capability: "fal-ai/flux/schnell" })?.name,
    "livepeer-example/fal-flux-schnell"
  );
  assert.equal(
    resolveFalCatalogEntry({
      capability: "livepeer-example/fal-flux-schnell",
    })?.endpointId,
    "fal-ai/flux/schnell"
  );
});
