const fs = require('fs');

const oldPath = './server/routes/permit-requests.routes.ts';
const simplePath = './server/routes/permit-requests-simple.routes.ts';

const oldContent = fs.readFileSync(oldPath, 'utf8');
const simpleContent = fs.readFileSync(simplePath, 'utf8');

// 1. Extract helpers from oldContent
// They go from line 10 to line 247 (before '// --- API ROUTES ---')
const helpersMatch = oldContent.match(/(\/\/ --- HELPER FUNCTIONS[\s\S]*?)(\/\/ --- API ROUTES ---)/);
const helpers = helpersMatch ? helpersMatch[1] : '';

// 2. Extract POST /request, POST /bulk-approve, POST /bulk-reject
const postRequestMatch = oldContent.match(/(\/\/ Créer une nouvelle demande de permis[\s\S]*?)(?=\/\/ Supprimer une demande)/);
const postRequest = postRequestMatch ? postRequestMatch[1] : '';

const bulkApproveMatch = oldContent.match(/(\/\/ Approbation en masse[\s\S]*?)(?=\/\/ Rejet en masse)/);
const bulkApprove = bulkApproveMatch ? bulkApproveMatch[1] : '';

const bulkRejectMatch = oldContent.match(/(\/\/ Rejet en masse[\s\S]*?)(\/\/ --- END OF ROUTES ---|$)/);
const bulkReject = bulkRejectMatch ? bulkRejectMatch[1] : '';

// 3. Remove imports of helpers from simpleContent
let finalContent = simpleContent.replace(/import \{ computeValidityAndExpiry, generateUniquePermitNumber \} from '\.\/permit-requests\.routes\.js';\n/, '');

// Add missing imports
finalContent = finalContent.replace(
  /import \{ eq, sql \} from 'drizzle-orm';/, 
  "import { and, desc, eq, inArray, ne, sql } from 'drizzle-orm';\nimport { hunters, permits, permitRequests, users, huntingCampaigns, settings, domaines, type InsertPermitRequest } from '../../shared/schema.js';"
);

// 4. Inject helpers before the first route
finalContent = finalContent.replace(/\/\/ Route pour approuver une demande de permis/, helpers + '\n\n' + postRequest + '\n\n// Route pour approuver une demande de permis');

// 5. Inject bulk routes at the end
finalContent += '\n\n' + bulkApprove + '\n\n' + bulkReject;

// Save to a temporary file to verify
fs.writeFileSync('./server/routes/permit-requests-merged.ts', finalContent);
console.log('Done merging into permit-requests-merged.ts');
