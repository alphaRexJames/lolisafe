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
    'no-undefined': 'error',
    'no-void': 0,
    'object-shorthand': [
      'error',
      'always'
    ]
  }
}
