import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier/flat';

export default tseslint.config(
  // Not linted (build output, coverage, generated docs). node_modules is ignored by default.
  { ignores: ['**/dist/**', 'coverage/**', 'docs/**'] },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  {
    languageOptions: {
      globals: { ...globals.node },
      sourceType: 'module',
      ecmaVersion: 2022,
    },
    rules: {
      // The IMVU wire format is dynamic; the deserialization layer leans on `any`.
      '@typescript-eslint/no-explicit-any': 'off',
      // TypeScript resolves identifiers/imports; ESLint's no-undef is redundant and wrong for types.
      'no-undef': 'off',
      // Standard lenient unused-vars: allow `_`-prefixed intentional placeholders and unused catch bindings.
      '@typescript-eslint/no-unused-vars': [
        'error',
        // `args: none` — many imq callback/interface signatures have unused params by contract.
        { args: 'none', varsIgnorePattern: '^_', caughtErrors: 'none' },
      ],
    },
  },

  // Prettier owns formatting — turn off any conflicting stylistic rules. Keep last.
  prettier
);
