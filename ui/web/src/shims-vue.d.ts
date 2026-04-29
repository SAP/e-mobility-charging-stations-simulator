export type {}

declare module '*.css' {
  const _default: unknown
  export default _default
}

declare module 'vue' {
  export interface GlobalComponents {
    RouterLink: (typeof import('vue-router'))['RouterLink']
    RouterView: (typeof import('vue-router'))['RouterView']
  }
}
