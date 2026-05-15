import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep both packages external so Node resolves them from node_modules at
  // runtime instead of letting the bundler trace them:
  //   - pdfjs-dist: ships a sibling worker .mjs file the bundler can't trace.
  //   - @napi-rs/canvas: ships a platform-specific native binary that must be
  //     resolved by Node, not bundled. Used by lib/parsing/pdfjs-node-polyfill
  //     to provide DOMMatrix/Path2D/ImageData on Vercel's Node runtime.
  serverExternalPackages: ["pdfjs-dist", "@napi-rs/canvas"],
};

export default nextConfig;
