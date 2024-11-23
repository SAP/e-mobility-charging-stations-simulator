export default {
  '**/*.{json,md}': ['prettier --cache --write'],
  '**/*.{py,pyi}': ['ruff check --fix', 'ruff format'],
}
