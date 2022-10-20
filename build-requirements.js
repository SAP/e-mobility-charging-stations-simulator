const chalk = require('chalk');
// eslint-disable-next-line n/no-unpublished-require
const SemVer = require('semver');

const enginesNodeVersion = require('./package.json').engines.node;

/**
 * Check if the current node version match the required engines version.
 */
function checkNodeVersion() {
  if (SemVer.satisfies(process.version, enginesNodeVersion) === false) {
    console.error(
      chalk.red(
        `Required node version ${enginesNodeVersion} not satisfied with current version ${process.version}.`
      )
    );
    // eslint-disable-next-line n/no-process-exit
    process.exit(1);
  }
}

checkNodeVersion();

module.exports = { checkNodeVersion };
