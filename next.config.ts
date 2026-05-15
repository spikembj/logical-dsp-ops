import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep both packages external so Node resolves them from node_modules at
  // runtime instead of letting the bundler trace them:
  //   - pdfjs-dist: ships a sibling worker .mjs file the bundler can't trace.
  //   - @napi-rs/canvas: ships a platform-specific native binary that must be
  //     resolved by Node, not bundled. Used by lib/parsing/pdfjs-node-polyfill
  //     to provide DOMMatrix/Path2D/ImageData on Vercel's Node runtime.
  serverExternalPackages: ["pdfjs-dist", "@napi-rs/canvas"],

  // pdfjs-dist resolves its worker file lazily via require.resolve at runtime,
  // which Next's static file-tracer can't follow — so on Vercel the worker
  // .mjs is missing from the deployment ("/var/task/.../pdf.worker.mjs not
  // found"). This config forces it into every serverless function's trace.
  outputFileTracingIncludes: {
    "/**": ["./node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs"],
  },
};

export default nextConfig;
