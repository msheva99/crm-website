import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  experimental: {
    allowedDevOrigins: ["stomachy-prosurrender-darwin.ngrok-free.dev"],
  },
};

export default nextConfig;