/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@gprn/i18n", "@gprn/rbac", "@gprn/domain"],
  webpack(config) {
    config.resolve.extensionAlias = {
      ...config.resolve.extensionAlias,
      ".js": [".ts", ".tsx", ".js"],
      ".mjs": [".mts", ".mjs"]
    };

    return config;
  }
};

export default nextConfig;
