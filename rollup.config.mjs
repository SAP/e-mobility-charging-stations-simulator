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
    'async_hooks',
    'basic-ftp',
    'chalk',
    'http',
    'http-status-codes',
    'just-clone',
    'just-merge',
    'mnemonist/lru-map-with-delete',
    'moment',
    'mongodb',
    'node:crypto',
    'node:fs',
    'node:path',
    'node:url',
    'node:util',
    'perf_hooks',
    'poolifier',
    'proper-lockfile',
    'tar',
    'winston',
    'winston-daily-rotate-file',
    'winston/lib/winston/transports',
    'worker_threads',
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
