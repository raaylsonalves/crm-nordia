/** @type {import("next").NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  // Pacotes do monorepo consumidos como TypeScript puro (sem build próprio):
  // o Next precisa compilá-los com o mesmo pipeline do app, não só
  // resolvê-los como dependência pronta.
  transpilePackages: ["@crm/core", "@crm/db", "@crm/adapters"],

  webpack: (config) => {
    // Nossos pacotes importam arquivos irmãos com extensão ".js" mesmo
    // sendo ".ts" — convenção ESM do Node, que o `tsx` e o `tsc` já sabem
    // resolver. O webpack não sabe por padrão: sem isto, toda importação
    // relativa dentro de @crm/core, @crm/db e @crm/adapters falha com
    // "Module not found" no build (embora funcione em dev com tsx).
    config.resolve.extensionAlias = {
      ...config.resolve.extensionAlias,
      ".js": [".ts", ".tsx", ".js"],
    };
    return config;
  },
};
export default nextConfig;
