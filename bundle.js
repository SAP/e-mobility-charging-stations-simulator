/* eslint-disable n/no-unpublished-import */
import { env } from 'node:process'

import chalk from 'chalk'
import { build } from 'esbuild'
import { clean } from 'esbuild-plugin-clean'
import { copy } from 'esbuild-plugin-copy'
;(async () => {
  const isDevelopmentBuild = env.BUILD === 'development'
  const sourcemap = !!isDevelopmentBuild
  console.info(chalk.green(`Building in ${isDevelopmentBuild ? 'development' : 'production'} mode`))
  console.time('Build time')
  await build({
    entryPoints: ['./src/start.ts', './src/charging-station/ChargingStationWorker.ts'],
    bundle: true,
    platform: 'node',
    format: 'esm',
    external: [
      '@mikro-orm/*',
      'ajv',
      'ajv-formats',
      'basic-ftp',
      'chalk',
      'date-fns',
      'http-status-codes',
      'just-merge',
      'logform',
      'mnemonist',
      'mnemonist/*',
      'mongodb',
      'node:*',
      'poolifier',
      'tar',
      'winston',
      'winston/*',
      'winston-daily-rotate-file',
      'ws'
    ],
    minify: true,
    sourcemap,
    entryNames: '[name]',
    outdir: './dist',
    plugins: [
      clean({
        patterns: [
          './dist/*',
          '!./dist/assets',
          './dist/assets/*.json',
          './dist/assets/json-schemas',
          './dist/assets/station-templates',
          './dist/assets/ui-protocol'
        ]
      }),
      copy({
        assets: [
          {
            from: ['./src/assets/config.json'],
            to: ['./assets']
          },
          {
            from: ['./src/assets/idtags!(-template)*.json'],
            to: ['./assets']
          },
          {
            from: ['./src/assets/json-schemas/**/*.json'],
            to: ['./assets/json-schemas']
          },
          {
            from: ['./src/assets/station-templates/**/*.json'],
            to: ['./assets/station-templates']
          }
        ]
      })
    ]
  })
  console.timeEnd('Build time')
})()
