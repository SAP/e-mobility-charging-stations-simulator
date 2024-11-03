export default {
  '**/*.{json,md}': ['prettier --cache --write'],
  '**/*.{py,pyi}': ['poetry run task format'],
}
