/* eslint-disable n/no-unpublished-import */
import { env } from 'node:process';

import { build } from 'esbuild';
import { clean } from 'esbuild-plugin-clean';
import { copy } from 'esbuild-plugin-copy';

const isDevelopmentBuild = env.BUILD === 'development';
const sourcemap = !!isDevelopmentBuild;

(async () => {
  await build({
    entryPoints: ['./src/start.ts', './src/charging-station/ChargingStationWorker.ts'],
    bundle: true,
    platform: 'node',
    format: 'esm',
    external: ['@mikro-orm/*'],
    minify: true,
    sourcemap,
    entryNames: '[name]',
    outdir: './dist',
    banner: {
      js: "import { createRequire } from 'module';const require = createRequire(import.meta.url);",
    },
    plugins: [
      clean({
        patterns: [
          './dist/*',
          '!./dist/assets',
          './dist/assets/*.json',
          './dist/assets/json-schemas',
          './dist/assets/station-templates',
          './dist/assets/ui-protocol',
        ],
      }),
      copy({
        assets: [
          {
            from: ['./src/assets/config.json'],
            to: ['./assets'],
          },
          {
            from: ['./src/assets/idtags!(-template)*.json'],
            to: ['./assets'],
          },
          {
            from: ['./src/assets/json-schemas/**/*.json'],
            to: ['./assets/json-schemas'],
          },
          {
            from: ['./src/assets/station-templates/**/*.json'],
            to: ['./assets/station-templates'],
          },
        ],
      }),
    ],
  });
})();
