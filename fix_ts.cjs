const fs = require('fs');
const file = 'client/src/components/layout/Sidebar.tsx';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(/\.includes\(user\?\.role\)/g, '.includes(user?.role || "")');

fs.writeFileSync(file, content);
console.log('Fixed TS error');
