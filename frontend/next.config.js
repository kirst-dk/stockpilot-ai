/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "export",
  images: {
    unoptimized: true,
  },
  transpilePackages: ["@0xsquid/widget", "@0xsquid/react-hooks", "@reservoir0x/relay-kit-ui", "@reservoir0x/relay-sdk"],
};

module.exports = nextConfig;
