const { env } = require('node:process');

const isCIEnvironment = env.CI !== undefined;
const isCFEnvironment = env.VCAP_APPLICATION !== undefined;
if (isCFEnvironment === false && isCIEnvironment === false) {
  // eslint-disable-next-line n/no-unpublished-require
  require('husky').install();
}
