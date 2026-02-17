/** @type {import('next').NextConfig} */
const nextConfig = {
    webpack: (config, { isServer }) => {
        if (!isServer) {
            config.resolve.fallback = {
                ...config.resolve.fallback,
                fs: false,
                net: false,
                tls: false,
                child_process: false,
                https: false,
                http: false,
                crypto: false,
                os: false,
                path: false,
                stream: false,
                zlib: false,
                dgram: false,
                dns: false,
            };

            // Specifically ignore node: imports
            config.resolve.alias = {
                ...config.resolve.alias,
                'node:fs': false,
                'node:https': false,
                'node:path': false,
                'node:util': false,
                'node:stream': false,
                'node:buffer': false,
                'node:url': false,
                'node:os': false,
                'node:net': false,
                'node:tls': false,
                'node:assert': false,
                'node:events': false,
                'node:process': false,
            };
        }
        return config;
    },
};

export default nextConfig;
