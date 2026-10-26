import nx from '@nx/eslint-plugin';

/**
 * Architecture is enforced, not just documented: these dependency
 * constraints make it a lint error for a remote to import the shell's
 * platform internals, for the Ext JS remote to depend on React libraries,
 * or for shared contracts to depend on anything at all.
 */
export default [
  ...nx.configs['flat/base'],
  ...nx.configs['flat/typescript'],
  ...nx.configs['flat/javascript'],
  {
    ignores: [
      '**/dist',
      '**/out-tsc',
      '**/coverage',
      '**/public/vendor/**',
      '**/vitest.config.*.timestamp*',
      'tools/scripts/**',
    ],
  },
  {
    files: ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx'],
    rules: {
      '@nx/enforce-module-boundaries': [
        'error',
        {
          enforceBuildableLibDependency: true,
          // Build configs may import the shared dev-server / share-policy settings.
          allow: ['^.*/eslint(\\.base)?\\.config\\.[cm]?[jt]s$', '^\\.\\./\\.\\./tools/mf/.*$'],
          depConstraints: [
            { sourceTag: 'type:contracts', onlyDependOnLibsWithTags: ['type:contracts'] },
            { sourceTag: 'type:util', onlyDependOnLibsWithTags: ['type:util'] },
            { sourceTag: 'type:tokens', onlyDependOnLibsWithTags: ['type:tokens'] },
            {
              sourceTag: 'type:platform',
              onlyDependOnLibsWithTags: ['type:contracts', 'type:util', 'type:tokens'],
            },
            {
              sourceTag: 'type:ui',
              onlyDependOnLibsWithTags: ['type:tokens', 'type:util', 'type:contracts'],
            },
            {
              sourceTag: 'type:sdk',
              onlyDependOnLibsWithTags: ['type:contracts', 'type:ui', 'type:util', 'type:tokens'],
            },
            {
              sourceTag: 'type:dev-host',
              onlyDependOnLibsWithTags: [
                'type:platform',
                'type:contracts',
                'type:tokens',
                'type:util',
              ],
            },
            {
              sourceTag: 'type:remote',
              onlyDependOnLibsWithTags: [
                'type:contracts',
                'type:sdk',
                'type:ui',
                'type:util',
                'type:tokens',
                'type:dev-host',
              ],
            },
            {
              sourceTag: 'type:app',
              onlyDependOnLibsWithTags: [
                'type:contracts',
                'type:platform',
                'type:sdk',
                'type:ui',
                'type:util',
                'type:tokens',
              ],
            },
            {
              sourceTag: 'type:server',
              onlyDependOnLibsWithTags: ['type:contracts', 'type:util', 'type:tokens'],
            },
            { sourceTag: 'framework:extjs', notDependOnLibsWithTags: ['framework:react'] },
          ],
        },
      ],
      '@typescript-eslint/consistent-type-imports': ['warn', { fixStyle: 'inline-type-imports' }],
    },
  },
];
