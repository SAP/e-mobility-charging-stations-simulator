/* eslint-disable n/no-unpublished-import */
import { env } from 'node:process'

import chalk from 'chalk'
import { build } from 'esbuild'
import { clean } from 'esbuild-plugin-clean'
import { copy } from 'esbuild-plugin-copy'

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
    'date-fns/*',
    'http-status-codes',
    'logform',
    'mnemonist',
    'mongodb',
    'node:*',
    'poolifier',
    'rambda',
    'tar',
    'winston',
    'winston/*',
    'winston-daily-rotate-file',
    'ws'
  ],
  treeShaking: true,
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
        './dist/assets/ui-protocol',
        './dist/assets/configs-docker'
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
        },
        {
          from: ['./src/assets/configs-docker/*.json'],
          to: ['./assets/configs-docker']
        }
      ]
    })
  ]
})
console.timeEnd('Build time')
