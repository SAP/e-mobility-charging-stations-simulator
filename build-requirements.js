const chalk = require('chalk');
// eslint-disable-next-line node/no-unpublished-require
const SemVer = require('semver');

const enginesNodeVersion = require('./package.json').engines.node;

if (SemVer.satisfies(process.version, enginesNodeVersion) === false) {
  console.error(
    chalk.red(
      `Required node version ${enginesNodeVersion} not satisfied with current version ${process.version}.`
    )
  );
  // eslint-disable-next-line no-process-exit
  process.exit(1);
}
