/* eslint-disable n/no-unpublished-import */

import { build } from 'esbuild'
import { clean } from 'esbuild-plugin-clean'
import { readFileSync } from 'node:fs'
import { env } from 'node:process'

const pkg = JSON.parse(readFileSync('./package.json', 'utf8'))

const isDevelopmentBuild = env.BUILD === 'development'

await build({
  banner: {
    js: "#!/usr/bin/env node\nimport { createRequire } from 'node:module'; const require = createRequire(import.meta.url);",
  },
  bundle: true,
  define: {
    __CLI_VERSION__: JSON.stringify(pkg.version),
    'process.env.WS_NO_BUFFER_UTIL': JSON.stringify('1'),
    'process.env.WS_NO_UTF_8_VALIDATE': JSON.stringify('1'),
  },
  entryPoints: ['src/cli.ts'],
  external: ['bufferutil', 'utf-8-validate'],
  format: 'esm',
  minify: !isDevelopmentBuild,
  outfile: 'dist/cli.js',
  platform: 'node',
  plugins: [clean({ patterns: ['dist'] })],
  sourcemap: isDevelopmentBuild,
  target: 'node22',
  treeShaking: true,
})
