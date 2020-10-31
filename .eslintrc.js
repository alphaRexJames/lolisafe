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
    'no-throw-literal': 0,
    'object-shorthand': [
      'error',
      'always'
    ],
    'node/no-callback-literal': 0
  }
}
