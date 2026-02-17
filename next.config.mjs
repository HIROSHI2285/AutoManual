/** @type {import('next').NextConfig} */
const nextConfig = {
    webpack: (config, { isServer, webpack }) => {
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

            // Use NormalModuleReplacementPlugin to strip "node:" prefix
            // This allows the fallback (e.g. fs: false) to kick in for "node:fs" imports
            config.plugins.push(
                new webpack.NormalModuleReplacementPlugin(
                    /^node:/,
                    (resource) => {
                        resource.request = resource.request.replace(/^node:/, '');
                    }
                )
            );
        }
        return config;
    },
};

export default nextConfig;
