import { createRequire } from "node:module";

import type { NextConfig } from "next";

const require = createRequire(import.meta.url);

const nextConfig: NextConfig = {
  webpack: (config) => {
    // @coral-xyz/anchor ships no "exports" map, so Node resolves its CJS build
    // ("main") — which is what @txsettle/sdk's compiled ESM default-import was
    // built against. Webpack would instead pick the "browser"/"module" ESM
    // builds, which have no default export and break that import. Pin the bare
    // specifier to the CJS build to mirror Node resolution.
    config.resolve.alias = {
      ...config.resolve.alias,
      "@coral-xyz/anchor$": require.resolve("@coral-xyz/anchor/dist/cjs/index.js"),
    };
    // Node builtins anchor's CJS build touches only on lazy, node-only paths
    // (NodeWallet, workspace loading, TextDecoder fallback) — stub them out.
    config.resolve.fallback = { ...config.resolve.fallback, fs: false, path: false, util: false, process: false };
    return config;
  },
};

export default nextConfig;
