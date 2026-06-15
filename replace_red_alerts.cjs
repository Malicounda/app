const fs = require('fs');

const files = [
  'client/src/components/layout/Sidebar.tsx',
  'client/src/components/layout/AgentTopHeader.tsx',
  'client/src/components/layout/MainLayout.tsx',
  'client/src/components/layout/ReforestLayout.tsx'
];

files.forEach(file => {
  let content = fs.readFileSync(file, 'utf8');

  // 1. Fix unreadMsg that were missed (like in AgentTopHeader)
  content = content.replace(/bg-(?:red|emerald)-500 text-white( text-\[[^\]]+\] font-bold rounded-full[^>]*>[\s\n]*\{unreadMsg\})/g, 'bg-blue-100/80 text-blue-700 border border-blue-200/50$1');

  // 2. Change ALL remaining bg-red-600 text-white (which are the alertes in Sidebar) to light red
  content = content.replace(/bg-red-600 text-white/g, 'bg-red-100/80 text-red-700 border border-red-200/50');
  
  // 3. Change ALL remaining bg-red-500 text-white (which are the alertes in Headers) to light red
  content = content.replace(/bg-red-500 text-white/g, 'bg-red-100/80 text-red-700 border border-red-200/50');

  fs.writeFileSync(file, content);
  console.log('Processed', file);
});
