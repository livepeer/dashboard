// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  ThemeProvider,
  useTheme,
  THEME_OPTIONS,
} from "@/components/console/ThemeContext";

let dark = false;
let listeners: Set<() => void>;
beforeEach(() => {
  dark = false;
  listeners = new Set();
  localStorage.clear();
  vi.stubGlobal("matchMedia", () => ({
    matches: dark,
    addEventListener: (_: string, fn: () => void) => listeners.add(fn),
    removeEventListener: (_: string, fn: () => void) => listeners.delete(fn),
  }));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  localStorage.clear();
  delete document.documentElement.dataset.theme;
});
function Controls() {
  const { preference, setPreference } = useTheme();
  return (
    <>
      {THEME_OPTIONS.map(({ value, label }) => (
        <button
          key={value}
          aria-pressed={value === preference}
          onClick={() => setPreference(value)}
        >
          {label}
        </button>
      ))}
    </>
  );
}
it("restores explicit preference, persists changes, and ignores OS changes while pinned", () => {
  localStorage.setItem("theme", "dark");
  render(
    <ThemeProvider>
      <Controls />
    </ThemeProvider>
  );
  expect(document.documentElement.dataset.theme).toBe("dark");
  expect(listeners.size).toBe(0);
  fireEvent.click(screen.getByRole("button", { name: "Light" }));
  expect(localStorage.getItem("theme")).toBe("light");
  expect(document.documentElement.dataset.theme).toBe("light");
  expect(listeners.size).toBe(0);
});
it("follows OS updates in system mode and detaches on explicit selection", () => {
  render(
    <ThemeProvider>
      <Controls />
    </ThemeProvider>
  );
  expect(document.documentElement.dataset.theme).toBe("light");
  act(() => {
    dark = true;
    listeners.forEach((fn) => fn());
  });
  expect(document.documentElement.dataset.theme).toBe("dark");
  fireEvent.click(screen.getByRole("button", { name: "Light" }));
  expect(listeners.size).toBe(0);
  fireEvent.click(screen.getByRole("button", { name: "System" }));
  expect(document.documentElement.dataset.theme).toBe("dark");
  expect(localStorage.getItem("theme")).toBe("system");
});
it("applies choices for the session when storage is unavailable", () => {
  vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
    throw Error("blocked");
  });
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw Error("blocked");
  });
  render(
    <ThemeProvider>
      <Controls />
    </ThemeProvider>
  );
  fireEvent.click(screen.getByRole("button", { name: "Dark" }));
  expect(document.documentElement.dataset.theme).toBe("dark");
});
it("uses identical pre-paint bootstraps that preserve saved choices and tolerate blocked storage", () => {
  const scripts = ["app/layout.tsx", "app/(app)/layout.tsx"].map(
    (path) =>
      readFileSync(path, "utf8").match(
        /const THEME_INIT_SCRIPT = `([^`]+)`;/
      )![1]
  );
  expect(scripts[0]).toBe(scripts[1]);
  for (const saved of ["light", "dark", "system", "invalid", null]) {
    for (const osDark of [true, false]) {
      const doc = {
        documentElement: { dataset: {} as Record<string, string> },
      };
      runInNewContext(scripts[0], {
        document: doc,
        localStorage: { getItem: () => saved },
        matchMedia: () => ({ matches: osDark }),
      });
      expect(doc.documentElement.dataset.theme).toBe(
        saved === "light" || saved === "dark"
          ? saved
          : osDark
            ? "dark"
            : "light"
      );
    }
  }
  const doc = { documentElement: { dataset: {} as Record<string, string> } };
  runInNewContext(scripts[0], {
    document: doc,
    localStorage: {
      getItem: () => {
        throw Error("blocked");
      },
    },
    matchMedia: () => ({ matches: false }),
  });
  expect(doc.documentElement.dataset.theme).toBe("light");
});
