module.exports = {
  presets: [
    [
      '@babel/preset-env',
      {
        targets: {
          // Support des navigateurs modernes + IE11
          browsers: [
            '> 1%',
            'last 2 versions',
            'not dead',
            'ie >= 11',
            'chrome >= 60',
            'firefox >= 60',
            'safari >= 12',
            'edge >= 79'
          ]
        },
        useBuiltIns: 'usage',
        corejs: 3,
        modules: false, // Laisse Vite gérer les modules
        debug: false
      }
    ],
    [
      '@babel/preset-react',
      {
        runtime: 'automatic',
        development: process.env.NODE_ENV === 'development'
      }
    ],
    [
      '@babel/preset-typescript',
      {
        isTSX: true,
        allExtensions: true
      }
    ]
  ],
  plugins: [
    // Plugin pour les polyfills manquants
    [
      '@babel/plugin-transform-runtime',
      {
        corejs: 3,
        helpers: true,
        regenerator: true,
        useESModules: false
      }
    ]
  ],
  env: {
    development: {
      plugins: [
        'react-refresh/babel'
      ]
    },
    production: {
      plugins: [
        // Optimisations pour la production
        '@babel/plugin-transform-react-constant-elements',
        '@babel/plugin-transform-react-inline-elements'
      ]
    }
  }
};
