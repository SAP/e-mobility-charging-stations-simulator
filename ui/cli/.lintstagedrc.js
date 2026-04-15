export default {
  '*.{css,json,md,yml,yaml,html,js,jsx,cjs,mjs,ts,tsx,cts,mts}': 'prettier --cache --write',
  '*.{js,jsx,cjs,mjs,ts,tsx,cts,mts}': 'eslint --cache --fix',
}
