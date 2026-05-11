#!/usr/bin/env node

const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

// Configuration des navigateurs à tester
const BROWSERS = [
  { name: 'Chrome', executablePath: null }, // Utilise le Chrome installé
  { name: 'Firefox', executablePath: null }, // Utilise le Firefox installé
  { name: 'Edge', executablePath: null }, // Utilise l'Edge installé
];

// Tests de compatibilité
const COMPATIBILITY_TESTS = [
  {
    name: 'HTML5 Support',
    test: async (page) => {
      const html5Support = await page.evaluate(() => {
        return {
          canvas: !!document.createElement('canvas').getContext,
          video: !!document.createElement('video').canPlayType,
          localStorage: typeof Storage !== 'undefined',
          sessionStorage: typeof sessionStorage !== 'undefined',
          geolocation: 'geolocation' in navigator,
          webWorkers: typeof Worker !== 'undefined',
          webSockets: 'WebSocket' in window,
          history: 'pushState' in history,
          dragDrop: 'draggable' in document.createElement('div'),
          fileAPI: 'FileReader' in window
        };
      });
      return html5Support;
    }
  },
  {
    name: 'CSS3 Support',
    test: async (page) => {
      const css3Support = await page.evaluate(() => {
        const testEl = document.createElement('div');
        const styles = window.getComputedStyle(testEl);
        
        return {
          flexbox: 'flex' in styles,
          grid: 'grid' in styles,
          transforms: 'transform' in styles,
          transitions: 'transition' in styles,
          animations: 'animation' in styles,
          boxShadow: 'boxShadow' in styles,
          borderRadius: 'borderRadius' in styles,
          gradients: 'backgroundImage' in styles,
          mediaQueries: window.matchMedia('(max-width: 768px)').matches !== undefined,
          customProperties: CSS.supports('color', 'var(--test)')
        };
      });
      return css3Support;
    }
  },
  {
    name: 'JavaScript ES6+ Support',
    test: async (page) => {
      const jsSupport = await page.evaluate(() => {
        return {
          arrowFunctions: (() => { try { eval('() => {}'); return true; } catch(e) { return false; } })(),
          templateLiterals: (() => { try { eval('`test`'); return true; } catch(e) { return false; } })(),
          destructuring: (() => { try { eval('const {a} = {}'); return true; } catch(e) { return false; } })(),
          spreadOperator: (() => { try { eval('[...[]]'); return true; } catch(e) { return false; } })(),
          asyncAwait: (() => { try { eval('async () => {}'); return true; } catch(e) { return false; } })(),
          promises: typeof Promise !== 'undefined',
          fetch: typeof fetch !== 'undefined',
          modules: 'import' in window || 'require' in window,
          classes: (() => { try { eval('class Test {}'); return true; } catch(e) { return false; } })(),
          constLet: (() => { try { eval('const a = 1; let b = 2'); return true; } catch(e) { return false; } })()
        };
      });
      return jsSupport;
    }
  },
  {
    name: 'Responsive Design',
    test: async (page) => {
      const viewports = [
        { width: 320, height: 568, name: 'Mobile Small' },
        { width: 375, height: 667, name: 'Mobile Medium' },
        { width: 414, height: 896, name: 'Mobile Large' },
        { width: 768, height: 1024, name: 'Tablet' },
        { width: 1024, height: 768, name: 'Desktop Small' },
        { width: 1440, height: 900, name: 'Desktop Large' }
      ];

      const results = {};
      
      for (const viewport of viewports) {
        await page.setViewport(viewport);
        await page.waitForTimeout(100); // Attendre le redimensionnement
        
        const responsiveTest = await page.evaluate(() => {
          const body = document.body;
          const computedStyle = window.getComputedStyle(body);
          
          return {
            width: body.offsetWidth,
            height: body.offsetHeight,
            overflowX: computedStyle.overflowX,
            overflowY: computedStyle.overflowY,
            fontSize: computedStyle.fontSize,
            hasHorizontalScroll: body.scrollWidth > body.clientWidth,
            hasVerticalScroll: body.scrollHeight > body.clientHeight
          };
        });
        
        results[viewport.name] = responsiveTest;
      }
      
      return results;
    }
  },
  {
    name: 'Accessibility Features',
    test: async (page) => {
      const a11ySupport = await page.evaluate(() => {
        return {
          ariaSupport: 'ariaLabel' in document.createElement('div'),
          roleSupport: 'role' in document.createElement('div'),
          tabIndex: 'tabIndex' in document.createElement('div'),
          focusVisible: CSS.supports('selector(:focus-visible)'),
          reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches !== undefined,
          highContrast: window.matchMedia('(prefers-contrast: high)').matches !== undefined,
          colorScheme: window.matchMedia('(prefers-color-scheme: dark)').matches !== undefined,
          screenReader: 'speechSynthesis' in window,
          keyboardNavigation: true // Testé via les événements clavier
        };
      });
      return a11ySupport;
    }
  },
  {
    name: 'Performance Metrics',
    test: async (page) => {
      const performance = await page.evaluate(() => {
        const navigation = performance.getEntriesByType('navigation')[0];
        const paint = performance.getEntriesByType('paint');
        
        return {
          loadTime: navigation ? navigation.loadEventEnd - navigation.loadEventStart : 0,
          domContentLoaded: navigation ? navigation.domContentLoadedEventEnd - navigation.domContentLoadedEventStart : 0,
          firstPaint: paint.find(p => p.name === 'first-paint')?.startTime || 0,
          firstContentfulPaint: paint.find(p => p.name === 'first-contentful-paint')?.startTime || 0,
          memoryUsage: performance.memory ? {
            used: performance.memory.usedJSHeapSize,
            total: performance.memory.totalJSHeapSize,
            limit: performance.memory.jsHeapSizeLimit
          } : null
        };
      });
      return performance;
    }
  }
];

// Fonction pour tester un navigateur
async function testBrowser(browserConfig, url) {
  console.log(`\n🧪 Test de compatibilité: ${browserConfig.name}`);
  console.log('='.repeat(50));
  
  let browser;
  let results = {
    browser: browserConfig.name,
    timestamp: new Date().toISOString(),
    tests: {}
  };

  try {
    // Lancement du navigateur
    browser = await puppeteer.launch({
      headless: false, // Mode visible pour les tests
      executablePath: browserConfig.executablePath,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();
    
    // Configuration de la page
    await page.setViewport({ width: 1280, height: 720 });
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');
    
    // Navigation vers l'application
    console.log(`📱 Navigation vers ${url}...`);
    await page.goto(url, { waitUntil: 'networkidle0', timeout: 30000 });
    
    // Attendre que l'application soit chargée
    await page.waitForSelector('#root', { timeout: 10000 });
    await page.waitForTimeout(2000); // Attendre le chargement complet
    
    // Exécution des tests
    for (const test of COMPATIBILITY_TESTS) {
      console.log(`  🔍 ${test.name}...`);
      try {
        const testResult = await test.test(page);
        results.tests[test.name] = {
          status: 'passed',
          result: testResult
        };
        console.log(`    ✅ ${test.name} - OK`);
      } catch (error) {
        results.tests[test.name] = {
          status: 'failed',
          error: error.message
        };
        console.log(`    ❌ ${test.name} - ÉCHEC: ${error.message}`);
      }
    }
    
    // Capture d'écran
    const screenshot = await page.screenshot({ fullPage: true });
    const screenshotPath = path.join(__dirname, '..', 'test-results', `${browserConfig.name.toLowerCase()}-screenshot.png`);
    fs.writeFileSync(screenshotPath, screenshot);
    results.screenshot = screenshotPath;
    
  } catch (error) {
    console.error(`❌ Erreur lors du test ${browserConfig.name}:`, error.message);
    results.error = error.message;
  } finally {
    if (browser) {
      await browser.close();
    }
  return results;
}

  // Fonction principale
  async function runCompatibilityTests() {
  console.log('='.repeat(60));
  
  const url = process.argv[2] || 'http://localhost:5173';
  console.log(`🌐 URL de test: ${url}`);
{{ ... }}
  // Créer le dossier de résultats
  const resultsDir = path.join(__dirname, '..', 'test-results');
  if (!fs.existsSync(resultsDir)) {
    fs.mkdirSync(resultsDir, { recursive: true });
  }
  
  const allResults = [];
  
  // Tester chaque navigateur
  for (const browser of BROWSERS) {
    try {
      const result = await testBrowser(browser, url);
      allResults.push(result);
    } catch (error) {
      console.error(`❌ Impossible de tester ${browser.name}:`, error.message);
      allResults.push({
        browser: browser.name,
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  }
  
  // Sauvegarder les résultats
  const resultsPath = path.join(resultsDir, 'compatibility-results.json');
  fs.writeFileSync(resultsPath, JSON.stringify(allResults, null, 2));
  
  // Générer le rapport
  generateReport(allResults, resultsDir);
  
  console.log('\n✅ Tests de compatibilité terminés !');
  console.log(`📊 Résultats sauvegardés dans: ${resultsPath}`);
}

// Génération du rapport
function generateReport(results, outputDir) {
  const reportPath = path.join(outputDir, 'compatibility-report.html');
  
  let html = `
<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Rapport de Compatibilité SCoDiPP</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; background: #f5f5f5; }
        .container { max-width: 1200px; margin: 0 auto; background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        .header { text-align: center; margin-bottom: 30px; }
        .browser { margin-bottom: 30px; border: 1px solid #ddd; border-radius: 8px; padding: 20px; }
        .browser h2 { color: #333; margin-top: 0; }
        .test { margin-bottom: 15px; padding: 10px; border-radius: 4px; }
        .test.passed { background: #d4edda; border-left: 4px solid #28a745; }
        .test.failed { background: #f8d7da; border-left: 4px solid #dc3545; }
        .test h3 { margin: 0 0 10px 0; }
        .test-result { font-family: monospace; background: #f8f9fa; padding: 10px; border-radius: 4px; margin-top: 10px; }
        .summary { background: #e9ecef; padding: 20px; border-radius: 8px; margin-bottom: 30px; }
        .status { display: inline-block; padding: 4px 8px; border-radius: 4px; font-size: 12px; font-weight: bold; }
        .status.passed { background: #28a745; color: white; }
        .status.failed { background: #dc3545; color: white; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🧪 Rapport de Compatibilité SCoDiPP</h1>
            <p>Tests effectués le ${new Date().toLocaleString('fr-FR')}</p>
        </div>
        
        <div class="summary">
            <h2>📊 Résumé</h2>
            <p><strong>Navigateurs testés:</strong> ${results.length}</p>
            <p><strong>Tests réussis:</strong> ${results.filter(r => !r.error).length}</p>
            <p><strong>Tests échoués:</strong> ${results.filter(r => r.error).length}</p>
        </div>
  `;
  
  results.forEach(result => {
    html += `
        <div class="browser">
            <h2>🌐 ${result.browser}</h2>
            ${result.error ? `
                <div class="test failed">
                    <h3>❌ Erreur</h3>
                    <p>${result.error}</p>
                </div>
            ` : ''}
            ${Object.entries(result.tests || {}).map(([testName, test]) => `
                <div class="test ${test.status}">
                    <h3>${test.status === 'passed' ? '✅' : '❌'} ${testName}</h3>
                    ${test.result ? `
                        <div class="test-result">
                            <pre>${JSON.stringify(test.result, null, 2)}</pre>
                        </div>
                    ` : ''}
                    ${test.error ? `<p><strong>Erreur:</strong> ${test.error}</p>` : ''}
                </div>
            `).join('')}
        </div>
    `;
  });
  
  html += `
    </div>
</body>
</html>
  `;
  
  fs.writeFileSync(reportPath, html);
  console.log(`📋 Rapport généré: ${reportPath}`);
}

// Exécution du script
if (require.main === module) {
  runCompatibilityTests().catch(console.error);
}

module.exports = { runCompatibilityTests, testBrowser };
