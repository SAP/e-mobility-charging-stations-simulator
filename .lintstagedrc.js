export default {
  '**/*.{js,jsx,cjs,mjs}': ['prettier --write', 'eslint --fix'],
  '**/*.{json,md,yml,yaml}': ['prettier --write'],
  '{src,tests}/**/*.{ts,tsx,cts,mts}': ['prettier --write', 'eslint --fix'],
}
