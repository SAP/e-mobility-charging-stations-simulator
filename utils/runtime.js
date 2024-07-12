export const runtimes = {
  bun: 'bun',
  deno: 'deno',
  node: 'node',
  workerd: 'workerd',
  browser: 'browser'
}

const isBun = !!globalThis.Bun || !!globalThis.process?.versions?.bun
const isDeno = !!globalThis.Deno
const isNode = globalThis.process?.release?.name === 'node'
// eslint-disable-next-line n/no-unsupported-features/node-builtins
const isWorkerd = globalThis.navigator?.userAgent === 'Cloudflare-Workers'
// eslint-disable-next-line n/no-unsupported-features/node-builtins
const isBrowser = !!globalThis.navigator

export const runtime = (() => {
  if (isBun) return runtimes.bun
  if (isDeno) return runtimes.deno
  if (isNode) return runtimes.node
  if (isWorkerd) return runtimes.workerd
  if (isBrowser) return runtimes.browser

  return 'unknown'
})()
