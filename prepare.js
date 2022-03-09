const isCi = process.env.CI !== undefined;
const isCloudFoundry = process.env.VCAP_APPLICATION !== undefined;
if (!isCloudFoundry && !isCi) {
  // eslint-disable-next-line node/no-unpublished-require
  require('husky').install();
}
