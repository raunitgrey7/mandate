import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: { root: __dirname },
  serverExternalPackages: ["@electric-sql/pglite", "@paypal/agent-toolkit"],
};

export default nextConfig;
