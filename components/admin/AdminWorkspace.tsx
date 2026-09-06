"use client";

import { useRef, useState, type ReactNode } from "react";
import RunsPreview from "./RunsPreview";

const sections = ["Waitlist", "History"] as const;

export default function AdminWorkspace({ children }: { children: ReactNode }) {
  const [active, setActive] = useState<(typeof sections)[number]>("Waitlist");
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  return (
    <>
      <h1 className="sr-only">Administration</h1>
      <div className="py-5">
        <div
          role="tablist"
          aria-label="Administration sections"
          className="mx-auto flex w-fit rounded-full bg-muted p-0.5"
        >
          {sections.map((section, index) => (
            <button
              key={section}
              ref={(node) => {
                tabs.current[index] = node;
              }}
              type="button"
              role="tab"
              id={`admin-tab-${section.toLowerCase()}`}
              aria-controls={`admin-panel-${section.toLowerCase()}`}
              aria-selected={active === section}
              tabIndex={active === section ? 0 : -1}
              onClick={() => setActive(section)}
              onKeyDown={(event) => {
                if (
                  !["ArrowLeft", "ArrowRight", "Home", "End"].includes(
                    event.key
                  )
                )
                  return;
                event.preventDefault();
                const next =
                  event.key === "Home"
                    ? 0
                    : event.key === "End"
                      ? 1
                      : 1 - index;
                setActive(sections[next]);
                tabs.current[next]?.focus();
              }}
              className={`h-7 min-w-20 rounded-full px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${active === section ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
            >
              {section}
            </button>
          ))}
        </div>
      </div>
      <div
        role="tabpanel"
        id="admin-panel-waitlist"
        aria-labelledby="admin-tab-waitlist"
        hidden={active !== "Waitlist"}
      >
        {children}
      </div>
      <div
        role="tabpanel"
        id="admin-panel-history"
        aria-labelledby="admin-tab-history"
        hidden={active !== "History"}
      >
        {active === "History" && <RunsPreview />}
      </div>
    </>
  );
}
