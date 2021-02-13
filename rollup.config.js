import analyze from 'rollup-plugin-analyzer';
import copy from 'rollup-plugin-copy';
import del from 'rollup-plugin-delete';
import typescript from 'rollup-plugin-typescript2';

const isDevelopmentBuild = process.env.BUILD === 'development';

export default {
  input: ['src/start.ts', 'src/charging-station/StationWorker.ts'],
  output: {
    dir: 'dist',
    format: 'cjs',
    exports: 'auto',
    sourcemap: true,
    preserveModules: true,
    preserveModulesRoot: 'src'
  },
  external: ['crypto', 'perf_hooks', 'fs', 'path', 'poolifier', 'uuid', 'ws', 'winston-daily-rotate-file', 'winston/lib/winston/transports', 'winston', 'worker_threads'],
  plugins: [
    typescript({
      tsconfig: 'tsconfig.json'
    }),
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
