import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "*.supabase.co" },
      // imagens no Cloudflare R2 (endereço público r2.dev)
      { protocol: "https", hostname: "**.r2.dev" },
    ],
  },
  experimental: {
    serverActions: { bodySizeLimit: "12mb" },
    // uploads de até 10 MB passam pelo proxy (padrão corta em 10 MB)
    proxyClientMaxBodySize: "12mb",
  },
};

export default nextConfig;
