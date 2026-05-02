import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Browser preview / Cascade proxy uses 127.0.0.1 — allow HMR from there.
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  productionBrowserSourceMaps: false,
};

export default nextConfig;
