module.exports = {
  root: true,
  env: {
    node: true,
    es2020: true
  },
  extends: [
    'standard'
  ],
  rules: {
    'object-shorthand': [
      'error',
      'always'
    ],
    'n/no-unsupported-features/es-builtins': 'error',
    'n/no-unsupported-features/es-syntax': 'error',
    'n/no-unsupported-features/node-builtins': 'error'
  }
}
