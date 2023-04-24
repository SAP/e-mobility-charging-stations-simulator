module.exports = {
  '*.{json,md,yml,yaml}': 'prettier --cache --write',
  '*.{js,jsx,vue,cjs,mjs,ts,tsx,cts,mts}':
    'eslint . --cache --ext .vue,.js,.jsx,.cjs,.mjs,.ts,.tsx,.cts,.mts --fix --ignore-path .gitignore',
};
