import { env, exit } from 'node:process'

const skipPreinstall = Number.parseInt(env.SKIP_PREINSTALL) || env.VCAP_APPLICATION != null
if (skipPreinstall) {
  exit()
} else {
  exit(1)
}
