import js from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

export default defineConfig([
  globalIgnores([
    'dist/',
    'coverage/',
    'worker/',
    'shots-output/',
    'playwright-report/',
    'test-results/',
  ]),
  js.configs.recommended,
  tseslint.configs.recommended,
  prettier,
  {
    // Spec 031 (ADR-18): a text shown on screen lives in the catalogue of
    // src/i18n, in both languages, never in the markup.
    files: ['src/**/*.tsx'],
    ignores: ['src/**/*.test.tsx'],
    rules: {
      'no-restricted-syntax': [
        'warn',
        ...[
          'JSXText[value=/[A-Za-zÀ-ÿ]/]',
          'JSXElement > JSXExpressionContainer > Literal[value=/[A-Za-zÀ-ÿ]/]',
          'JSXElement > JSXExpressionContainer > TemplateLiteral',
          'JSXElement > JSXExpressionContainer > ConditionalExpression > Literal[value=/[A-Za-zÀ-ÿ]/]',
          'JSXAttribute[name.name=/^(aria-label|title|placeholder|alt|label)$/] > Literal[value=/[A-Za-zÀ-ÿ]/]',
          'JSXAttribute[name.name=/^(aria-label|title|placeholder|alt|label)$/] > JSXExpressionContainer > Literal[value=/[A-Za-zÀ-ÿ]/]',
          'JSXAttribute[name.name=/^(aria-label|title|placeholder|alt|label)$/] > JSXExpressionContainer > TemplateLiteral',
        ].map((selector) => ({
          selector,
          message:
            'A text shown on screen comes from the catalogue: msg() of src/i18n, with its French entry.',
        })),
      ],
    },
  },
]);
