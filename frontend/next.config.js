/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "export",
  images: {
    unoptimized: true,
  },
  transpilePackages: ["@0xsquid/widget", "@0xsquid/react-hooks"],
};

module.exports = nextConfig;
