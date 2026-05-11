#!/usr/bin/env node

const sharp = require('sharp');
const fs = require('fs');
const path = require('path');
const glob = require('glob');

// Configuration des tailles d'images
const SIZES = [
  { width: 320, suffix: '-320w' },
  { width: 640, suffix: '-640w' },
  { width: 768, suffix: '-768w' },
  { width: 1024, suffix: '-1024w' },
  { width: 1280, suffix: '-1280w' },
  { width: 1920, suffix: '-1920w' }
];

// Qualités par format
const QUALITIES = {
  jpeg: 85,
  webp: 80,
  avif: 70,
  png: 90
};

// Formats de sortie
const FORMATS = ['jpeg', 'webp', 'avif'];

/**
 * Optimise une image en générant plusieurs tailles et formats
 */
async function optimizeImage(inputPath, outputDir) {
  const filename = path.basename(inputPath, path.extname(inputPath));
  const extension = path.extname(inputPath).toLowerCase();
  
  console.log(`Optimisation de ${inputPath}...`);
  
  try {
    const image = sharp(inputPath);
    const metadata = await image.metadata();
    
    // Créer le dossier de sortie s'il n'existe pas
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    
    // Générer les différentes tailles
    for (const size of SIZES) {
      // Ajuster la largeur si l'image originale est plus petite
      const targetWidth = Math.min(size.width, metadata.width);
      
      for (const format of FORMATS) {
        const outputFilename = `${filename}${size.suffix}.${format}`;
        const outputPath = path.join(outputDir, outputFilename);
        
        let pipeline = image
          .resize(targetWidth, null, {
            withoutEnlargement: true,
            fit: 'inside'
          })
          .quality(QUALITIES[format]);
        
        // Configuration spécifique par format
        switch (format) {
          case 'jpeg':
            pipeline = pipeline.jpeg({ progressive: true, mozjpeg: true });
            break;
          case 'webp':
            pipeline = pipeline.webp({ effort: 6 });
            break;
          case 'avif':
            pipeline = pipeline.avif({ effort: 9 });
            break;
          case 'png':
            pipeline = pipeline.png({ compressionLevel: 9 });
            break;
        }
        
        await pipeline.toFile(outputPath);
        console.log(`  ✓ Généré: ${outputFilename}`);
      }
    }
    
    // Générer une version optimisée de l'image originale
    const originalOptimized = path.join(outputDir, `${filename}-original.webp`);
    await image
      .webp({ quality: QUALITIES.webp, effort: 6 })
      .toFile(originalOptimized);
    
    console.log(`  ✓ Image originale optimisée: ${filename}-original.webp`);
    
  } catch (error) {
    console.error(`Erreur lors de l'optimisation de ${inputPath}:`, error.message);
  }
}

/**
 * Traite tous les fichiers d'images dans un dossier
 */
async function processImages(inputPattern, outputDir) {
  const files = glob.sync(inputPattern);
  
  if (files.length === 0) {
    console.log('Aucune image trouvée avec le pattern:', inputPattern);
    return;
  }
  
  console.log(`Trouvé ${files.length} image(s) à optimiser`);
  
  for (const file of files) {
    await optimizeImage(file, outputDir);
  }
  
  console.log('Optimisation terminée !');
}

/**
 * Génère un fichier de configuration pour les images optimisées
 */
function generateImageConfig(outputDir) {
  const config = {
    formats: FORMATS,
    sizes: SIZES,
    qualities: QUALITIES,
    generated: new Date().toISOString()
  };
  
  const configPath = path.join(outputDir, 'image-config.json');
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
  console.log(`Configuration sauvegardée: ${configPath}`);
}

// Script principal
async function main() {
  const args = process.argv.slice(2);
  const inputPattern = args[0] || 'public/**/*.{jpg,jpeg,png,webp}';
  const outputDir = args[1] || 'public/optimized';
  
  console.log('🖼️  Optimisation d\'images pour SCoDiPP');
  console.log('=====================================');
  console.log(`Pattern d'entrée: ${inputPattern}`);
  console.log(`Dossier de sortie: ${outputDir}`);
  console.log('');
  
  // Vérifier que Sharp est installé
  try {
    require('sharp');
  } catch (error) {
    console.error('❌ Sharp n\'est pas installé. Installez-le avec:');
    console.error('npm install --save-dev sharp');
    process.exit(1);
  }
  
  await processImages(inputPattern, outputDir);
  generateImageConfig(outputDir);
  
  console.log('');
  console.log('✅ Optimisation terminée !');
  console.log('');
  console.log('💡 Utilisation dans votre code:');
  console.log('import ResponsiveImage from "@/components/ui/ResponsiveImage";');
  console.log('');
  console.log('<ResponsiveImage');
  console.log('  src="/optimized/image-640w.webp"');
  console.log('  alt="Description de l\'image"');
  console.log('  sizes="(max-width: 768px) 100vw, 50vw"');
  console.log('  className="w-full h-auto"');
  console.log('/>');
}

// Exécuter le script
if (require.main === module) {
  main().catch(console.error);
}

module.exports = { optimizeImage, processImages };
