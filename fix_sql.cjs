const fs = require('fs');

let backendContent = fs.readFileSync('server/controllers/hunterAttachments.controller.ts', 'utf8');

const target = \    const keys = Object.keys(data);
    const colList = sql.raw(['"hunter_id"', ...keys.map(k => '"' + k + '"')].join(', '));\;

const replacement = \    const keys = Object.keys(data);
    if (keys.length === 0) {
      return res.status(200).json({ message: "Aucune modification à apporter" });
    }
    const colList = sql.raw(['"hunter_id"', ...keys.map(k => '"' + k + '"')].join(', '));\;

backendContent = backendContent.replace(target, replacement);

fs.writeFileSync('server/controllers/hunterAttachments.controller.ts', backendContent, 'utf8');
