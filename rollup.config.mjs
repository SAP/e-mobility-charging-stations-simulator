/* eslint-disable n/no-unpublished-import */
import json from '@rollup/plugin-json';
import terser from '@rollup/plugin-terser';
import typescript from '@rollup/plugin-typescript';
import analyze from 'rollup-plugin-analyzer';
import copy from 'rollup-plugin-copy';
import del from 'rollup-plugin-delete';

const isDevelopmentBuild = process.env.BUILD === 'development';

export default {
  input: ['src/start.ts', 'src/charging-station/ChargingStationWorker.ts'],
  strictDeprecations: true,
  output: [
    {
      dir: 'dist',
      format: 'esm',
      exports: 'auto',
      sourcemap: true,
      preserveModules: true,
      preserveModulesRoot: 'src',
      entryFileNames: '[name].mjs',
      ...(!isDevelopmentBuild && { plugins: [terser({ maxWorkers: 2 })] }),
    },
  ],
  external: [
    '@mikro-orm/core',
    '@mikro-orm/reflection',
    'ajv',
    'ajv-formats',
    'basic-ftp',
    'chalk',
    'http-status-codes',
    'just-clone',
    'just-merge',
    'mnemonist/lru-map-with-delete.js',
    'moment',
    'mongodb',
    'node:async_hooks',
    'node:crypto',
    'node:fs',
    'node:http',
    'node:path',
    'node:perf_hooks',
    'node:stream',
    'node:url',
    'node:util',
    'node:worker_threads',
    'poolifier',
    'proper-lockfile',
    'tar',
    'winston',
    'winston-daily-rotate-file',
    'winston/lib/winston/transports/index.js',
    'ws',
  ],
  plugins: [
    json(),
    typescript({
      tsconfig: 'tsconfig.json',
    }),
    del({
      targets: [
        'dist/*',
        '!dist/assets',
        'dist/assets/*.json',
        'dist/assets/json-schemas',
        'dist/assets/station-templates',
        'dist/assets/ui-protocol',
      ],
    }),
    copy({
      targets: [{ src: 'src/assets', dest: 'dist/' }],
    }),
    isDevelopmentBuild && analyze(),
  ],
};
