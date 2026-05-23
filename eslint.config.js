import js from '@eslint/js';
import prettier from 'eslint-plugin-prettier';

export default [
  js.configs.recommended,
  {
    plugins: {
      prettier,
    },
    rules: {
      'prettier/prettier': ['error', {
        semi: true,
        singleQuote: true,
        tabWidth: 2,
        trailingComma: 'es5',
        printWidth: 80,
      }],
    },
    languageOptions: {
      ecmaVersion: 2021,
      globals: {
        require: 'readonly',
        module: 'readonly',
        process: 'readonly',
        console: 'readonly',
      },
    },
  },
];