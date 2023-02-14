import json from '@rollup/plugin-json';
import analyze from 'rollup-plugin-analyzer';
import copy from 'rollup-plugin-copy';
import del from 'rollup-plugin-delete';
import { terser } from 'rollup-plugin-terser';
import ts from 'rollup-plugin-ts';

const isDevelopmentBuild = process.env.BUILD === 'development';

export default {
  input: ['src/start.ts', 'src/charging-station/ChargingStationWorker.ts'],
  output: [
    {
      dir: 'dist',
      format: 'esm',
      exports: 'auto',
      sourcemap: true,
      preserveModules: true,
      preserveModulesRoot: 'src',
      entryFileNames: '[name].mjs',
      ...(!isDevelopmentBuild && { plugins: [terser({ numWorkers: 2 })] }),
    },
    {
      dir: 'dist',
      format: 'cjs',
      exports: 'auto',
      sourcemap: true,
      preserveModules: true,
      preserveModulesRoot: 'src',
      entryFileNames: '[name].cjs',
      ...(!isDevelopmentBuild && { plugins: [terser({ numWorkers: 2 })] }),
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
    'mnemonist/lru-map-with-delete',
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
    'winston/lib/winston/transports',
    'ws',
  ],
  plugins: [
    json(),
    ts({
      tsconfig: 'tsconfig.json',
      browserslist: false,
    }),
    del({
      targets: [
        'dist/*',
        '!dist/assets',
        'dist/assets/*.json',
        'dist/assets/station-templates',
        'dist/assets/json-schemas',
      ],
    }),
    copy({
      targets: [{ src: 'src/assets', dest: 'dist/' }],
    }),
    isDevelopmentBuild && analyze(),
  ],
};
