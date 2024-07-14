import { env } from 'node:process'

const isCIEnvironment = env.CI != null
const isCFEnvironment = env.VCAP_APPLICATION != null
if (isCFEnvironment === false && isCIEnvironment === false) {
  // eslint-disable-next-line n/no-unpublished-import
  import('husky')
    .then(husky => {
      return console.warn(husky.default())
    })
    .catch(console.error)
}
