import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow the dev server's internal assets (HMR, RSC payloads, /_next/*)
  // to be requested over Tailscale from any device on the tailnet.
  // The wildcard matches one subdomain label (e.g. ninads-macbook-pro,
  // ninads-mac-mini) under the tailnet domain.
  allowedDevOrigins: ["*.tailab7ee1.ts.net"],
};

export default nextConfig;
