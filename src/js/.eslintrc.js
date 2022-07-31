module.exports = {
  root: true,
  parserOptions: {
    sourceType: 'script'
  },
  env: {
    browser: true,
    es2016: true
  },
  extends: [
    'standard',
    'plugin:compat/recommended'
  ],
  rules: {
    'object-shorthand': [
      'error',
      'always'
    ]
  }
}
