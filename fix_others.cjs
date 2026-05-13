
const fs = require('fs');

function patch(file, lineNum, search, replace) {
  const content = fs.readFileSync(file, 'utf8');
  const lines = content.split('\n');
  lines[lineNum] = lines[lineNum].replace(search, replace);
  fs.writeFileSync(file, lines.join('\n'));
}

patch('server/routes/guide-hunter-associations.routes.ts', 77, 'values({', 'values({ isActive: true, hunterId, guideId } as any); //');
patch('server/routes/permit-requests.routes.ts', 105, '.set({ status', '.set({ status: req.body.status } as any)');
patch('server/scripts/init-users.ts', 15, '.values(usersToCreate)', '.values(usersToCreate as any)');

console.log('Patched');

