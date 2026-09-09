import js from '@eslint/js'
import react from 'eslint-plugin-react'
import reactHooks from 'eslint-plugin-react-hooks'
import globals from 'globals'

export default [
  { ignores: ['dist/**', 'node_modules/**'] },
  js.configs.recommended,
  react.configs.flat.recommended,
  react.configs.flat['jsx-runtime'],
  {
    files: ['**/*.{js,jsx}'],
    languageOptions: {
      ...react.configs.flat.recommended.languageOptions,
      globals: { ...globals.browser, ...globals.es2021 },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      // Only the two classic hooks rules — catching missing/incorrect
      // dependency arrays is the actual goal here. eslint-plugin-react-hooks'
      // "recommended" bundles also pull in a battery of new React Compiler
      // readiness rules (purity, set-state-in-effect, immutability, ...)
      // that flag a lot of this codebase's idiomatic pre-Compiler patterns
      // (e.g. setState inside an effect syncing a MediaQueryList listener)
      // as errors — noise unrelated to the bug class we're guarding against.
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      'react/prop-types': 'off',
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      // Empty catch(e) {} blocks are a deliberate pattern throughout this
      // codebase for best-effort sessionStorage/localStorage writes.
      'no-empty': ['error', { allowEmptyCatch: true }],
    },
    settings: { react: { version: 'detect' } },
  },
  {
    files: ['api/**/*.js'],
    languageOptions: { globals: globals.node },
  },
]
