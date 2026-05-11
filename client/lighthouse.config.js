module.exports = {
  ci: {
    collect: {
      url: ['http://localhost:5173'],
      numberOfRuns: 3,
      settings: {
        chromeFlags: '--no-sandbox --disable-setuid-sandbox --headless'
      }
    },
    assert: {
      assertions: {
        'categories:performance': ['warn', { minScore: 0.8 }],
        'categories:accessibility': ['error', { minScore: 0.9 }],
        'categories:best-practices': ['warn', { minScore: 0.8 }],
        'categories:seo': ['warn', { minScore: 0.8 }],
        'categories:pwa': ['warn', { minScore: 0.6 }],
        
        // Métriques de performance spécifiques
        'first-contentful-paint': ['warn', { maxNumericValue: 2000 }],
        'largest-contentful-paint': ['warn', { maxNumericValue: 2500 }],
        'cumulative-layout-shift': ['warn', { maxNumericValue: 0.1 }],
        'total-blocking-time': ['warn', { maxNumericValue: 300 }],
        'speed-index': ['warn', { maxNumericValue: 3000 }],
        
        // Accessibilité
        'color-contrast': 'error',
        'image-alt': 'error',
        'label': 'error',
        'link-name': 'error',
        'button-name': 'error',
        'html-has-lang': 'error',
        'meta-viewport': 'error',
        
        // Bonnes pratiques
        'uses-https': 'warn',
        'no-vulnerable-libraries': 'warn',
        'csp-xss': 'warn',
        'is-on-https': 'warn',
        
        // SEO
        'document-title': 'warn',
        'meta-description': 'warn',
        'hreflang': 'warn',
        'canonical': 'warn',
        
        // PWA
        'installable-manifest': 'warn',
        'service-worker': 'warn',
        'splash-screen': 'warn',
        'themed-omnibox': 'warn',
        'content-width': 'warn'
      }
    },
    upload: {
      target: 'filesystem',
      outputDir: './test-results/lighthouse'
    }
  }
};
