module.exports = {
  root: true,
  parserOptions: {
    ecmaVersion: 9 // 2018
  },
  env: {
    node: true
  },
  extends: [
    'standard'
  ],
  rules: {
    'object-shorthand': [
      'error',
      'always'
    ]
  }
}
