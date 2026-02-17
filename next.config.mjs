/** @type {import('next').NextConfig} */
const nextConfig = {
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
    };
}
return config;
    },
};

export default nextConfig;
