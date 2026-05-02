import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pdfjs-dist ships its worker as a sibling .mjs file resolved at runtime.
  // The Next/Turbopack bundler can't trace that, so we keep the package
  // external on the server and let Node resolve it from node_modules normally.
  serverExternalPackages: ["pdfjs-dist"],
};

export default nextConfig;
