import del from 'rollup-plugin-delete';
import ts from '@wessberg/rollup-plugin-ts';

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
  external: ['crypto', 'perf_hooks', 'fs', 'poolifier', 'uuid', 'ws', 'winston', 'winston-daily-rotate-file', 'worker_threads'],
  plugins: [
    ts({
      tsconfig: 'tsconfig.json'
    }),
    del({
      targets: 'dist/*'
    })
  ]
};
