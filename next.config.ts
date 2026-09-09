import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // subset-font loads its HarfBuzz WASM binary at runtime on the Node server.
  serverExternalPackages: ["subset-font"],
};

export default nextConfig;
