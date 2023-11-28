import chalk from 'chalk';
import semVer from 'semver';
import packageJson from './package.json' assert { type: 'json' };
import { version, exit } from 'node:process';

/**
 * Check if the current node version match the required engines version.
 */
export const checkNodeVersion = () => {
  const enginesNodeVersion = packageJson.engines.node;
  if (semVer.satisfies(version, enginesNodeVersion) === false) {
    console.error(
      chalk.red(
        `Required node version ${enginesNodeVersion} not satisfied with current version ${version}.`,
      ),
    );
    // eslint-disable-next-line n/no-process-exit
    exit(1);
  }
};

checkNodeVersion();
