import { env } from 'node:process';

// eslint-disable-next-line n/no-unpublished-import
import { install } from 'husky';

const isCIEnvironment = env.CI !== undefined;
const isCFEnvironment = env.VCAP_APPLICATION !== undefined;
if (isCFEnvironment === false && isCIEnvironment === false) {
  install();
}
