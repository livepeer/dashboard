import type { NextConfig } from "next";

const posthogProxyPath = "/lpx";

const nextConfig: NextConfig = {
  // Keep production-build checks separate from a running local dev server.
  distDir: process.env.CONSOLE_DIST_DIR || ".next",
  allowedDevOrigins: ["studio.tail0de21e.ts.net"],
  // Bundler-agnostic polling interval for file watching — works with both
  // Turbopack (default in Next 15) and Webpack. Needed because the native
  // file watcher doesn't pick up changes reliably in git worktrees.
  watchOptions: {
    pollIntervalMs: 1000,
  },
  webpack: (config) => {
    // Additional Webpack-specific watch tweaks for git worktree symlinks
    // (only takes effect when Turbopack is disabled).
    config.watchOptions = {
      ...config.watchOptions,
      followSymlinks: true,
      poll: 1000,
      aggregateTimeout: 300,
    };
    return config;
  },
  async rewrites() {
    return [
      {
        source: `${posthogProxyPath}/static/:path*`,
        destination: "https://us-assets.i.posthog.com/static/:path*",
      },
      {
        source: `${posthogProxyPath}/array/:path*`,
        destination: "https://us-assets.i.posthog.com/array/:path*",
      },
      {
        source: `${posthogProxyPath}/:path*`,
        destination: "https://us.i.posthog.com/:path*",
      },
    ];
  },
  skipTrailingSlashRedirect: true,
  async redirects() {
    return [
      // Catalog renamed: a published app's consumer page moved from
      // /models/[id] to /apps/[id] (one noun — "app" — for the object across
      // both the consumer catalog and the operator surfaces).
      {
        source: "/models/:id",
        destination: "/apps/:id",
        permanent: true,
      },
      // The operator console folded into the app page as ownership-gated tabs,
      // so the separate /manage route is gone. Deep-link the console via
      // /apps/[id]?tab=overview instead.
      {
        source: "/apps/:id/manage",
        destination: "/apps/:id?tab=overview",
        permanent: true,
      },
      {
        source: "/settings/:path*",
        destination: "/home",
        permanent: false,
      },
      {
        source: "/usage",
        destination: "/home",
        permanent: false,
      },
      // Old livepeer.org routes → new site equivalents
      {
        source: "/lpt",
        destination: "/token",
        permanent: true,
      },
      {
        source: "/learn",
        destination: "/primer",
        permanent: false,
      },
      {
        source: "/delegate",
        destination: "https://explorer.livepeer.org/",
        permanent: false,
      },
      {
        source: "/orchestrate",
        destination:
          "https://docs.livepeer.org/v1/orchestrators/guides/get-started",
        permanent: false,
      },
      {
        source: "/dev-hub",
        destination: "https://docs.livepeer.org",
        permanent: false,
      },
      {
        source: "/community-hub",
        destination: "https://discord.gg/55SZFEEH5y",
        permanent: false,
      },
      {
        source: "/media-kit",
        destination: "/brand",
        permanent: true,
      },
      {
        source: "/primer-new-design",
        destination: "/primer",
        permanent: true,
      },
      // Legal pages — not yet implemented, redirect to home for now
      {
        source: "/terms-of-service",
        destination: "/",
        permanent: false,
      },
      {
        source: "/privacy-policy",
        destination: "/",
        permanent: false,
      },
      {
        source: "/terms-of-service-p",
        destination: "/",
        permanent: false,
      },
      {
        source: "/privacy-policy-p",
        destination: "/",
        permanent: false,
      },
      // blog.livepeer.org → livepeer.org/blog (path-preserving catch-all)
      {
        source: "/:path*",
        has: [{ type: "host", value: "blog.livepeer.org" }],
        destination: "https://livepeer.org/blog/:path*",
        permanent: true,
      },
      // Renamed blog slugs — old name → new name.
      // Matched with and without /blog/ prefix so they work both from
      // the catch-all above and from any cached bare-path links.
      ...["", "/blog"].flatMap((prefix) => [
        {
          source: `${prefix}/ai-x-open-media-forum-building-new-wave-creativity`,
          destination: "/blog/ai-x-open-media-forum",
          permanent: true,
        },
        {
          source: `${prefix}/livepeer-onchain-builders-streamplace-building-the-video-backbone-of-decentralized-social`,
          destination: "/blog/onchain-builders-streamplace",
          permanent: true,
        },
      ]),
      // Deprecated pages — old marketing/campaign routes, redirect to home
      // to avoid 404s from existing links and search engine indexes
      ...[
        "/pipelines-demo-email",
        "/comfyui-live-video-hacker-program",
        "/learn-about-pipelines",
        "/learn-about-pipelines---dev",
        "/daydream-waitlist",
      ].map((source) => ({
        source,
        destination: "/",
        permanent: true,
      })),
    ];
  },
};

export default nextConfig;
