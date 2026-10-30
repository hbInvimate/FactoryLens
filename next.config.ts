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
    // There is no start page: a Quality Technician starts a check from an assigned task on Sessions.
    // The old scripted demo lived at /monitor.
    return [
      { source: "/", destination: "/tasks", permanent: false },
      { source: "/monitor", destination: "/tasks", permanent: false },
    ];
  },
};

export default nextConfig;
