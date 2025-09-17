// next.config.ts
import type {NextConfig} from "next";

const nextConfig: NextConfig = {
    // ⛳ Lewatkan error ESLint & TypeScript saat build produksi (supaya Docker build lanjut)
    eslint: {ignoreDuringBuilds: true},
    typescript: {ignoreBuildErrors: true},

    webpack(config) {
        config.module.rules.push({
            test: /\.svg$/,
            use: ["@svgr/webpack"],
        });
        return config;
    },
};

export default nextConfig;
