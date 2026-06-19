/** @type {import('next').NextConfig} */
const nextConfig = {
  // 独立产物输出,便于 Docker 镜像最小化
  output: "standalone",
  // better-sqlite3 是原生模块,需排除出打包(Next 14 用 experimental 键)
  experimental: {
    serverComponentsExternalPackages: ["better-sqlite3"],
  },
  reactStrictMode: true,
};

export default nextConfig;
