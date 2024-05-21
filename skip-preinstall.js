import { env, exit } from 'node:process'

const skipPreinstall = Number.parseInt(env.SKIP_PREINSTALL) || env.VCAP_APPLICATION != null
if (skipPreinstall) {
  // eslint-disable-next-line n/no-process-exit
  exit()
} else {
  // eslint-disable-next-line n/no-process-exit
  exit(1)
}
