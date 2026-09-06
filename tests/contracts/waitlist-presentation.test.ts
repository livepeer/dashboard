import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  fitLogoOrbitRadius,
  logoOrbitPose,
  ORBIT_PERSPECTIVE,
} from "@/components/livepeer-ui/logo-orbit";

describe("waitlist orbit bounds", () => {
  it.each([
    [280, 256, 40],
    [390, 256, 40],
    [550, 336, 48],
    [818, 336, 48],
    [896, 336, 48],
    [896, 672, 96],
  ])(
    "keeps every projected logo and blur inside %ix%i with %ipx logos",
    (width, height, logoSize) => {
      const radius = fitLogoOrbitRadius(width, height, logoSize);
      expect(radius).toBeGreaterThan(0);
      for (let index = 0; index < 3600; index++) {
        const pose = logoOrbitPose((index / 3600) * Math.PI * 2, radius);
        const projection = ORBIT_PERSPECTIVE / (ORBIT_PERSPECTIVE - pose.z);
        const halfExtent = (logoSize / 2 + 3 * pose.blur) * pose.scale;
        expect((Math.abs(pose.x) + halfExtent) * projection).toBeLessThan(
          width / 2 - 3.5
        );
        expect((Math.abs(pose.y) + halfExtent) * projection).toBeLessThan(
          height / 2 - 3.5
        );
      }
    }
  );
});

describe("display typography isolation", () => {
  it("preserves source waitlist tracking and Console's zero-tracking default", () => {
    const globals = readFileSync(
      new URL("../../app/globals.css", import.meta.url), "utf8"
    );
    const waitlist = readFileSync(
      new URL("../../app/waitlist.css", import.meta.url), "utf8"
    );
    for (const size of ["sm", "md", "lg", "fluid"]) {
      expect(globals).toContain(
        `--text-display-${size}--letter-spacing: var(--display-tracking, 0);`
      );
    }
    expect(waitlist).toMatch(
      /\.waitlist-surface\s*\{[^}]*--display-tracking: -0\.045em;/
    );
    expect(waitlist).not.toMatch(/\.font-display\s*\{/);
  });
});
