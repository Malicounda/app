import fs from 'fs';
import path from 'path';
import https from 'https';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PUBLIC_DIR = path.resolve(__dirname, '../client/public');
const TILES_DIR = path.join(PUBLIC_DIR, 'tiles');

const ZOOM_MIN = 5;
const ZOOM_MAX = 9;

// Bounding box for Senegal
const bounds = {
  sw: { lat: 12.114834, lon: -18.0 },
  ne: { lat: 17.298173, lon: -11.0 }
};

function latlonToTile(lat: number, lon: number, zoom: number) {
  const x = Math.floor((lon + 180) / 360 * Math.pow(2, zoom));
  const y = Math.floor((1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2 * Math.pow(2, zoom));
  return { x, y };
}

function downloadImage(url: string, dest: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    const request = https.get(url, {
      headers: {
        'User-Agent': 'AlerteSenegalApp/1.0 (Contact: admin@eforets.pages.dev)'
      }
    }, (response) => {
      if (response.statusCode !== 200) {
        fs.unlink(dest, () => {}); // Delete empty file
        reject(new Error(`Failed to get '${url}' (${response.statusCode})`));
        return;
      }
      response.pipe(file);
      file.on('finish', () => {
        file.close();
        resolve();
      });
    }).on('error', (err) => {
      fs.unlink(dest, () => {});
      reject(err);
    });
  });
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function downloadTiles() {
  const tasks: { type: string, z: number, x: number, y: number, url: string, dest: string }[] = [];

  for (let z = ZOOM_MIN; z <= ZOOM_MAX; z++) {
    const sw = latlonToTile(bounds.sw.lat, bounds.sw.lon, z);
    const ne = latlonToTile(bounds.ne.lat, bounds.ne.lon, z);
    
    const minX = Math.min(sw.x, ne.x);
    const maxX = Math.max(sw.x, ne.x);
    const minY = Math.min(sw.y, ne.y);
    const maxY = Math.max(sw.y, ne.y);
    
    for (let x = minX; x <= maxX; x++) {
      for (let y = minY; y <= maxY; y++) {
        // OSM URL
        const osmUrl = `https://a.tile.openstreetmap.org/${z}/${x}/${y}.png`;
        const osmDir = path.join(TILES_DIR, 'osm', `${z}`, `${x}`);
        const osmDest = path.join(osmDir, `${y}.png`);
        
        // Satellite URL
        const satUrl = `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`;
        const satDir = path.join(TILES_DIR, 'satellite', `${z}`, `${x}`);
        const satDest = path.join(satDir, `${y}.png`);

        tasks.push({ type: 'osm', z, x, y, url: osmUrl, dest: osmDest, dir: osmDir } as any);
        tasks.push({ type: 'satellite', z, x, y, url: satUrl, dest: satDest, dir: satDir } as any);
      }
    }
  }

  console.log(`Total tiles to download: ${tasks.length}`);

  let success = 0;
  let failed = 0;

  for (let i = 0; i < tasks.length; i++) {
    const task = tasks[i] as any;
    
    if (!fs.existsSync(task.dir)) {
      fs.mkdirSync(task.dir, { recursive: true });
    }

    if (fs.existsSync(task.dest) && fs.statSync(task.dest).size > 0) {
      // Skip already downloaded
      success++;
      continue;
    }

    try {
      await downloadImage(task.url, task.dest);
      success++;
      if (i % 10 === 0) {
        console.log(`Progress: ${i + 1}/${tasks.length} (${Math.round((i+1)/tasks.length*100)}%)`);
      }
      await sleep(150); // Be gentle with tile servers
    } catch (err: any) {
      console.error(`Failed to download ${task.url}: ${err.message}`);
      failed++;
    }
  }

  console.log(`Download complete! Success: ${success}, Failed: ${failed}`);
}

downloadTiles().catch(console.error);
