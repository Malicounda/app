const fs = require('fs');

let content = fs.readFileSync('server/controllers/hunterAttachments.controller.ts', 'utf8');

content = content.replace(/, daysLeft: computed\.daysLeft/g, '');

fs.writeFileSync('server/controllers/hunterAttachments.controller.ts', content, 'utf8');
