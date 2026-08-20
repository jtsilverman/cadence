import type { NextConfig } from "next";

// SITE_PREVIEW=1 serves the rebuilt main page out of public/main.html at `/`,
// so the whole site can be walked in one place before that page is wired into
// app/ for real. It is off by default because the eval server reads this same
// config, and with the rewrite always on, five landing evals hit the static
// page instead of the app route and fail.
const preview = process.env.SITE_PREVIEW === "1";

const nextConfig: NextConfig = {
  async rewrites() {
    // beforeFiles: the default bucket runs after filesystem routes, so
    // app/page.tsx would keep winning `/`.
    return {
      beforeFiles: preview ? [{ source: "/", destination: "/main.html" }] : [],
      afterFiles: [],
      fallback: [],
    };
  },
};

export default nextConfig;
