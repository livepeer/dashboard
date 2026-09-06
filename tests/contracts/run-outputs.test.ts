import { expect, it } from "vitest";
import { extractRunOutputs } from "@/lib/runs/outputs";

it("recognizes multiple output objects in returned arrays without treating prompts as assets", () => {
  expect(
    extractRunOutputs({
      data: [
        { images: [{ url: "https://media.example.com/a.png" }] },
        { video: { url: "https://media.example.com/b.mp4" } },
        { prompt: "https://media.example.com/not-an-output.png" },
      ],
    })
  ).toEqual([
    { url: "https://media.example.com/a.png", mediaKind: "image" },
    { url: "https://media.example.com/b.mp4", mediaKind: "video" },
  ]);
});
