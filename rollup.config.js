import analyze from 'rollup-plugin-analyzer';
import copy from 'rollup-plugin-copy';
import del from 'rollup-plugin-delete';
import istanbul from 'rollup-plugin-istanbul';
import json from '@rollup/plugin-json';
import { terser } from 'rollup-plugin-terser';
import ts from 'rollup-plugin-ts';

const isDevelopmentBuild = process.env.BUILD === 'development';

export default {
  input: ['src/start.ts', 'src/charging-station/ChargingStationWorker.ts'],
  output:
  {
    dir: 'dist',
    format: 'cjs',
    exports: 'auto',
    sourcemap: true,
    preserveModules: true,
    preserveModulesRoot: 'src',
    ...!isDevelopmentBuild && { plugins: [terser({ numWorkers: 2 })] }
  },
  external: ['basic-ftp', 'chalk', 'crypto', 'fs', '@mikro-orm/core', '@mikro-orm/reflection', 'mongodb', 'path', 'perf_hooks', 'poolifier', 'proper-lockfile', 'reflect-metadata', 'tar', 'url', 'uuid', 'ws', 'winston-daily-rotate-file', 'winston/lib/winston/transports', 'winston', 'worker_threads'],
  plugins: [
    json(),
    ts({
      tsconfig: 'tsconfig.json',
      browserslist: false
    }),
    isDevelopmentBuild && istanbul(),
    del({
      targets: 'dist/*'
    }),
    copy({
      targets: [
        { src: 'src/assets', dest: 'dist/' }
      ]
    }),
    isDevelopmentBuild && analyze()
  ]
};
