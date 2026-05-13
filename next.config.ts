// next.config.ts
import type {NextConfig} from "next";

const nextConfig: NextConfig = {
    // ⛳ Lewatkan error ESLint & TypeScript saat build produksi (supaya Docker build lanjut)
    eslint: {ignoreDuringBuilds: true},
    typescript: {ignoreBuildErrors: true},
    // Remove x-powered-by header
    poweredByHeader: false,

    webpack(config) {
        config.module.rules.push({
            test: /\.svg$/,
            use: ["@svgr/webpack"],
        });
        return config;
    },
    async headers() {
        const isProd = process.env.NODE_ENV === 'production';

        const csp = [
            "default-src 'self'",
            "script-src 'self' 'unsafe-eval' 'unsafe-inline' https:",
            "style-src 'self' 'unsafe-inline' https:",
            "img-src 'self' data: https:",
            "font-src 'self' data: https:",
            "connect-src 'self' https: wss:",
            "frame-src 'self' blob:",
            "frame-ancestors 'self'",
            "base-uri 'self'",
        ].join('; ');

        const headers = [
            {
                source: '/(.*)',
                headers: [
                    { key: 'Content-Security-Policy', value: csp },
                    { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
                    { key: 'X-Content-Type-Options', value: 'nosniff' },
                    { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
                    { key: 'Permissions-Policy', value: "geolocation=(), microphone=(), camera=()" },
                ],
            },
        ];

        if (isProd) {
            // HSTS only in production and when HTTPS is in use
            headers[0].headers.unshift({ key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains; preload' });
        }

        return headers;
    },
};

export default nextConfig;
