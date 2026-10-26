import type { NextConfig } from "next";
const nextConfig: NextConfig = { transpilePackages: ["@qvill/shared"], output: "export", assetPrefix: "./" };
export default nextConfig;
