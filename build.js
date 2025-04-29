import * as esbuild from 'esbuild';
import { readFileSync } from 'fs';

async function main() {
  const pkg = JSON.parse(readFileSync('package.json', 'utf8'));

  await esbuild.build({
    entryPoints: ['src/index.ts'],
    bundle: true,
    platform: 'node',
    target: 'node20',
    format: 'esm',
    outfile: 'dist/index.js',
    define: {
      __VERSION__: JSON.stringify(pkg.version),
      'process.env.NODE_ENV': JSON.stringify('production')
    },
    banner: {
      js: `
        // Asana MCP Server v${pkg.version}
        import { createRequire } from 'module';
        const require = createRequire(import.meta.url);
      `
    },
    external: [
      'url',
      'http',
      'https',
      'stream',
      'zlib',
      'util',
      'events',
      'buffer',
      'querystring',
      'fs',
      'net',
      'asana',
      'jsdom',
      'express',
      'body-parser',
      'depd',
      'send',
      'serve-static',
      'cookie',
      'cookie-signature'
    ]
  });
}

main().catch(console.error);