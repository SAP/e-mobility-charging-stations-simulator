export default {
  '**/*.{js,jsx,cjs,mjs,ts,tsx,cts,mts}': ['prettier --cache --write', 'eslint --cache --fix'],
  '**/*.{json,md,yml,yaml}': ['prettier --cache --write'],
}
