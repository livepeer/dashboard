import type { Metadata } from "next";
import type { CSSProperties } from "react";
import { Toaster } from "sonner";
import "./globals.css";

const SITE_TITLE = "Livepeer Early Access";
const SITE_DESCRIPTION =
  "Explore Livepeer AI apps, manage API access, and track usage during early access.";

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : "https://earlyaccess.livepeer.org"
  ),
  title: SITE_TITLE,
  description: SITE_DESCRIPTION,
  applicationName: SITE_TITLE,
  icons: {
    icon: "/icon.svg",
  },
  openGraph: {
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    siteName: SITE_TITLE,
    type: "website",
    images: [
      {
        url: "/opengraph-image",
        width: 1200,
        height: 630,
        alt: SITE_TITLE,
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    images: ["/opengraph-image"],
  },
};

// FOUT prevention — runs synchronously before paint so dual-source CSS
// variables resolve from the saved preference or OS theme immediately. ThemeProvider in the
// console layout keeps this in sync after hydration.
const THEME_INIT_SCRIPT = `(function(){var p='system';try{var s=localStorage.getItem('theme');if(s==='light'||s==='dark')p=s;}catch(e){}try{document.documentElement.dataset.theme=p==='system'?(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'):p;}catch(e){document.documentElement.dataset.theme='dark';}})();`;
const TOASTER_STYLE = { "--width": "max-content" } as CSSProperties;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://rsms.me" crossOrigin="anonymous" />
        <link rel="stylesheet" href="https://rsms.me/inter/inter.css" />
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="min-h-screen bg-background font-sans text-foreground antialiased">
        {children}
        <Toaster
          position="bottom-center"
          theme="system"
          className="console-toaster"
          style={TOASTER_STYLE}
          closeButton={false}
          visibleToasts={3}
          toastOptions={{
            duration: 1800,
            className: "font-sans text-sm whitespace-nowrap",
            style: {
              background: "var(--popover)",
              border: "1px solid var(--border)",
              color: "var(--popover-foreground)",
              boxShadow:
                "0 14px 40px rgba(0, 0, 0, 0.16), 0 2px 8px rgba(0, 0, 0, 0.08)",
              maxWidth: "calc(100vw - 24px)",
              minWidth: "max-content",
              width: "max-content",
              whiteSpace: "nowrap",
            },
          }}
        />
      </body>
    </html>
  );
}
