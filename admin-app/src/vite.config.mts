import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { checkChunk, readsWordPressReact } from './store-app/hosts/wordpress/bundle-check';
const here = path.dirname(fileURLToPath(import.meta.url));
const shims = path.resolve(here, 'store-app/hosts/wordpress/shims');
function wordpressReactOnly(): Plugin {
    return {
        name: 'rankxai-wordpress-react-only',
        generateBundle(_options, bundle) {
            const chunks = Object.values(bundle).flatMap((c) => (c.type === 'chunk' ? [{ file: c.fileName, code: c.code }] : []));
            const findings = chunks.flatMap((c) => checkChunk(c.file, c.code));
            if (findings.length)
                this.error(`the WordPress build bundles React: ${findings.map((f) => `${f.file}: ${f.marker}`).join('; ')}`);
            if (!readsWordPressReact(chunks.map((c) => c.code)))
                this.error('the WordPress build does not read window.React and window.ReactJSXRuntime (the shims are not wired)');
        },
    };
}
export default defineConfig({
    root: here,
    base: './',
    plugins: [react(), wordpressReactOnly()],
    resolve: {
        alias: [
            { find: /^react\/jsx-runtime$/, replacement: path.join(shims, 'jsx-runtime.ts') },
            { find: /^react\/jsx-dev-runtime$/, replacement: path.join(shims, 'jsx-runtime.ts') },
            { find: /^react-dom\/client$/, replacement: path.join(shims, 'react-dom-client.ts') },
            { find: /^react-dom$/, replacement: path.join(shims, 'react-dom.ts') },
            { find: /^react$/, replacement: path.join(shims, 'react.ts') },
            { find: '@store-host', replacement: path.resolve(here, 'store-app/hosts/wordpress') },
            { find: '@', replacement: path.resolve(here) },
        ],
    },
    publicDir: false,
    build: {
        outDir: 'dist/wordpress',
        emptyOutDir: true,
        manifest: true,
        sourcemap: false,
        target: 'es2020',
        rollupOptions: { input: 'store-app/hosts/wordpress/main.tsx' },
    },
});
