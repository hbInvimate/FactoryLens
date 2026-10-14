import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    agentFeedback: true,
  },
  cacheComponents: true,
  // PGlite (tests and demos only, FL_STORAGE=memory) loads its own WebAssembly files at run time.
  serverExternalPackages: ["@electric-sql/pglite"],
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async redirects() {
    // The old scripted demo lived here.
    return [{ source: "/monitor", destination: "/", permanent: false }];
  },
};

export default nextConfig;
