// eslint-disable-next-line no-undefined
const isCi = process.env.CI !== undefined;
// eslint-disable-next-line no-undefined
const isCloudFoundry = process.env.VCAP_APPLICATION !== undefined;
if (!isCloudFoundry && !isCi) {
  // eslint-disable-next-line node/no-unpublished-require
  require('husky').install();
}
