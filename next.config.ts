import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // App is designed to run as an installable PWA from /shift-planner when nested,
  // but defaults to root when deployed as its own project.
  reactStrictMode: true,
  headers: async () => [
    {
      source: "/sw.js",
      headers: [
        { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
        { key: "Service-Worker-Allowed", value: "/" },
      ],
    },
    {
      source: "/manifest.webmanifest",
      headers: [{ key: "Content-Type", value: "application/manifest+json" }],
    },
  ],
};

export default nextConfig;
