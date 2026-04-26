/** @type {import('next').NextConfig} */
const backendUrl = process.env.BACKEND_URL || "http://localhost:8000";

const nextConfig = {
    eslint: {
        ignoreDuringBuilds: true,
    },
    images: {
        remotePatterns: [
            { protocol: "https", hostname: "**" },
            { protocol: "http", hostname: "**" },
        ],
    },
    async rewrites() {
        return [
            {
                source: "/api/courts",
                destination: `${backendUrl}/matches/courts`,
            },
            {
                source: "/api/courts/:path*",
                destination: `${backendUrl}/matches/courts/:path*`,
            },
            {
                source: "/api/psgc/:path*",
                destination: `${backendUrl}/psgc/:path*`,
            },
            {
                source: "/api/:path*",
                destination: `${backendUrl}/:path*`,
            },
            {
                source: "/static/:path*",
                destination: `${backendUrl}/static/:path*`,
            },
        ];
    },
};

export default nextConfig;
