import type { Metadata } from "next";
import type { CSSProperties } from "react";
import { AuthProvider } from "@/components/console/AuthContext";
import { EnvironmentProvider } from "@/components/console/EnvironmentContext";
import { ThemeProvider } from "@/components/console/ThemeContext";
import ConsoleSidebar from "@/components/console/ConsoleSidebar";
import KeyboardShortcuts from "@/components/console/KeyboardShortcuts";

// FOUT prevention — runs synchronously in the document, before the console
// subtree paints. Restore the saved preference, or follow the OS for system
// mode; ThemeProvider keeps it in sync after hydration.
const THEME_INIT_SCRIPT = `(function(){var p='system';try{var s=localStorage.getItem('theme');if(s==='light'||s==='dark')p=s;}catch(e){}try{document.documentElement.dataset.theme=p==='system'?(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'):p;}catch(e){document.documentElement.dataset.theme='dark';}})();`;

export const metadata: Metadata = {
  title: "Livepeer Early Access",
  description:
    "Explore Livepeer AI apps, manage API access, and track usage during early access.",
};

// Product surfaces use the registry theme's Inter-backed `font-sans`.
// Sidebar width and chrome head height are exposed as custom properties so
// components can reference them.
const consoleOverrides = {
  "--side-w": "256px",
  "--head-h": "44px",
  fontSize: "13.5px",
} as CSSProperties;

export default function ConsoleLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Flush full-bleed shell — no rounded floating panel. Sidebar sits flush
  // against the left edge with a hairline border on the right; main content
  // fills the remaining width.
  return (
    <>
      {/* Inline theme bootstrap — must run before the console subtree
          paints. ThemeProvider below takes over post-hydration. */}
      <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      <ThemeProvider>
        <AuthProvider>
          <EnvironmentProvider>
            <div
              className="flex min-h-screen flex-col overflow-x-clip overscroll-none bg-dark font-sans md:h-screen md:min-h-0 md:flex-row md:overflow-hidden"
              style={consoleOverrides}
            >
              <ConsoleSidebar />
              <div className="flex min-w-0 flex-1 flex-col overflow-x-clip overscroll-none bg-dark border-l border-hairline md:overflow-y-auto">
                {children}
              </div>
              <KeyboardShortcuts />
            </div>
          </EnvironmentProvider>
        </AuthProvider>
      </ThemeProvider>
    </>
  );
}
