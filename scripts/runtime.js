export const JSRuntime = {
  browser: 'browser',
  bun: 'bun',
  deno: 'deno',
  node: 'node',
  workerd: 'workerd',
}

const isBun = !!globalThis.Bun || !!globalThis.process?.versions?.bun
const isDeno = !!globalThis.Deno
const isNode = globalThis.process?.release?.name === 'node'
// eslint-disable-next-line n/no-unsupported-features/node-builtins
const isWorkerd = globalThis.navigator?.userAgent === 'Cloudflare-Workers'
// eslint-disable-next-line n/no-unsupported-features/node-builtins
const isBrowser = !!globalThis.window && !!globalThis.navigator

export const runtime = (() => {
  if (isBun) return JSRuntime.bun
  if (isDeno) return JSRuntime.deno
  if (isNode) return JSRuntime.node
  if (isWorkerd) return JSRuntime.workerd
  if (isBrowser) return JSRuntime.browser

  return 'unknown'
})()
