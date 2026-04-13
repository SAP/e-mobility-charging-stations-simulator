/* eslint-disable n/no-unpublished-import */

import { build } from 'esbuild'
import { clean } from 'esbuild-plugin-clean'
import { readFileSync } from 'node:fs'
import { env } from 'node:process'

const pkg = JSON.parse(readFileSync('./package.json', 'utf8'))

const isDevelopmentBuild = env.BUILD === 'development'

await build({
  banner: {
    js: '#!/usr/bin/env node',
  },
  bundle: true,
  define: {
    __CLI_VERSION__: JSON.stringify(pkg.version),
  },
  entryPoints: ['src/cli.ts'],
  external: Object.keys(pkg.dependencies ?? {}).filter(dep => dep !== 'ui-common'),
  format: 'esm',
  minify: !isDevelopmentBuild,
  outfile: 'dist/cli.js',
  platform: 'node',
  plugins: [clean({ patterns: ['dist'] })],
  sourcemap: isDevelopmentBuild,
  target: 'node22',
  treeShaking: true,
})
