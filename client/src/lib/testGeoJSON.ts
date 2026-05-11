import { loadRegionsGeoJSON } from './geoData';

// Fonction pour tester le chargement des données GeoJSON
export async function testGeoJSONLoading() {
  try {
    console.log('Démarrage du test de chargement GeoJSON...');
    
    // Tenter de charger les données GeoJSON des régions
    const regionsData = await loadRegionsGeoJSON();
    
    // Vérifier que les données sont bien chargées
    if (regionsData && regionsData.type === 'FeatureCollection') {
      console.log('✅ Données GeoJSON chargées avec succès!');
      console.log(`Nombre de régions: ${regionsData.features.length}`);
      
      // Afficher quelques informations sur les premières régions
      if (regionsData.features.length > 0) {
        console.log('Aperçu des premières régions:');
        regionsData.features.slice(0, 3).forEach((feature, index) => {
          console.log(`Région ${index + 1}: ${feature.properties?.nom || 'Sans nom'}`);
        });
      }
      
      // Vérifier le système de coordonnées
      if (regionsData.crs) {
        console.log(`Système de coordonnées: ${regionsData.crs.properties.name}`);
      } else {
        console.log('Aucun système de coordonnées spécifié');
      }
      
      return regionsData;
    } else {
      console.error('❌ Format de données GeoJSON invalide ou vide');
      return null;
    }
  } catch (error) {
    console.error('❌ Erreur lors du test de chargement GeoJSON:', error);
    return null;
  }
}

// Fonction pour vérifier la structure des données GeoJSON
export function analyzeGeoJSONStructure(geoJSON: any) {
  if (!geoJSON) {
    console.error('Aucune donnée GeoJSON fournie');
    return;
  }
  
  console.log('Analyse de la structure GeoJSON:');
  console.log(`Type: ${geoJSON.type}`);
  
  if (geoJSON.features) {
    console.log(`Nombre d'entités: ${geoJSON.features.length}`);
    
    if (geoJSON.features.length > 0) {
      const firstFeature = geoJSON.features[0];
      console.log('Structure d\'une entité:');
      console.log(`- Type: ${firstFeature.type}`);
      console.log(`- Géométrie: ${firstFeature.geometry.type}`);
      
      if (firstFeature.properties) {
        console.log('- Propriétés disponibles:');
        Object.keys(firstFeature.properties).forEach(key => {
          console.log(`  * ${key}: ${typeof firstFeature.properties[key]}`);
        });
      }
      
      // Vérifier les coordonnées
      if (firstFeature.geometry.coordinates) {
        const coords = firstFeature.geometry.coordinates;
        console.log(`- Structure des coordonnées: ${Array.isArray(coords) ? 'Array' : typeof coords}`);
        console.log(`- Profondeur des coordonnées: ${getArrayDepth(coords)}`);
      }
    }
  }
}

// Fonction utilitaire pour déterminer la profondeur d'un tableau
function getArrayDepth(arr: any[]): number {
  if (!Array.isArray(arr)) return 0;
  if (arr.length === 0) return 1;
  
  return 1 + Math.max(...arr.map(item => getArrayDepth(item)));
}
