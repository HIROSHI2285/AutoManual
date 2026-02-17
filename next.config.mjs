/** @type {import('next').NextConfig} */
const nextConfig = {
    webpack: (config) => {
        config.resolve.fallback = { fs: false };
        // Handle "node:" scheme imports (like node:fs)
        config.resolve.alias = {
            ...config.resolve.alias
        };
        // Add rule to ignore node: imports in client side code if needed more aggressively, but usually fallback is enough.
        // For "node:fs", webpack 5 might need this:
        config.plugins.push(
            new (class {
                apply(compiler) {
                    compiler.hooks.normalModuleFactory.tap("NodeSchemePlugin", (nmf) => {
                        nmf.hooks.createModule.tap("NodeSchemePlugin", (createData) => {
                            if (createData.resource && createData.resource.startsWith("node:")) {
                                createData.resource = createData.resource.replace("node:", "");
                            }
                        });
                    });
                }
            })()
        );

        return config;
    },
};

export default nextConfig;
