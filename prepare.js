import { env } from 'node:process';

const isCIEnvironment = env.CI !== undefined;
const isCFEnvironment = env.VCAP_APPLICATION !== undefined;
if (isCFEnvironment === false && isCIEnvironment === false) {
  // eslint-disable-next-line n/no-unpublished-import
  import('husky').then(({ install }) => install());
}
