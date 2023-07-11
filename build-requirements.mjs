import chalk from 'chalk';
import semVer from 'semver';
import packageJson from './package.json' assert { type: 'json' };

/**
 * Check if the current node version match the required engines version.
 */
export function checkNodeVersion() {
  const enginesNodeVersion = packageJson.engines.node;
  if (semVer.satisfies(process.version, enginesNodeVersion) === false) {
    console.error(
      chalk.red(
        `Required node version ${enginesNodeVersion} not satisfied with current version ${process.version}.`,
      ),
    );
    // eslint-disable-next-line n/no-process-exit
    process.exit(1);
  }
}

checkNodeVersion();
