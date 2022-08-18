import json from '@rollup/plugin-json';
import analyze from 'rollup-plugin-analyzer';
import copy from 'rollup-plugin-copy';
import del from 'rollup-plugin-delete';
import istanbul from 'rollup-plugin-istanbul';
import { terser } from 'rollup-plugin-terser';
import ts from 'rollup-plugin-ts';

const isDevelopmentBuild = process.env.BUILD === 'development';

export default {
  input: ['src/start.ts', 'src/ui/httpd/start.ts', 'src/charging-station/ChargingStationWorker.ts'],
  output: [
    {
      dir: 'dist',
      format: 'es',
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
    'ajv-draft-04',
    'ajv-formats',
    'basic-ftp',
    'chalk',
    'crypto',
    'express',
    'fs',
    'mnemonist/lru-map-with-delete',
    'moment',
    'mongodb',
    'path',
    'perf_hooks',
    'poolifier',
    'proper-lockfile',
    'reflect-metadata',
    'tar',
    'url',
    'uuid',
    'winston',
    'winston-daily-rotate-file',
    'winston/lib/winston/transports/index.js',
    'worker_threads',
    'ws',
  ],
  plugins: [
    json(),
    ts({
      tsconfig: 'tsconfig.json',
      browserslist: false,
    }),
    isDevelopmentBuild && istanbul(),
    del({
      targets: ['dist/*', '!dist/assets', 'dist/assets/*.json', 'dist/assets/station-templates'],
    }),
    copy({
      targets: [{ src: 'src/assets', dest: 'dist/' }],
    }),
    isDevelopmentBuild && analyze(),
  ],
};
