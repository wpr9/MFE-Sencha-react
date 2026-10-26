import baseConfig from '../../eslint.config.mjs';

export default [
  ...baseConfig,
  {
    // Idiomatic Sencha Ext JS: global class registry, `var me = this` scoping.
    files: ['src/ext/**/*.js'],
    languageOptions: { globals: { Ext: 'readonly', Blotter: 'readonly' } },
    rules: { 'no-var': 'off', '@typescript-eslint/no-this-alias': 'off' },
  },
];
