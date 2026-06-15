const fs = require('fs');
const files = [
  'client/src/components/layout/Sidebar.tsx',
  'client/src/components/layout/AgentTopHeader.tsx',
  'client/src/components/layout/MainLayout.tsx',
  'client/src/components/layout/ReforestLayout.tsx'
];

files.forEach(file => {
  let content = fs.readFileSync(file, 'utf8');
  
  content = content.replace(/(<span className="[^"]*rounded-full )bg-(?:green|red)-600 text-white( text-xs font-semibold">[\s\n]*\{unreadMsgDisplay\})/g, '$1bg-blue-100/80 text-blue-700 border border-blue-200/50$2');

  content = content.replace(/(<span className="[^"]*rounded-full[^"]*)bg-(?:red|emerald)-500 text-white([^"]*">[\s\n]*\{unreadMsg\}<\/span>)/g, '$1bg-blue-100/80 text-blue-700 border border-blue-200/50$2');

  content = content.replace(/(<span className="[^"]*rounded-full[^"]*)bg-(?:green|red)-600 text-white([^"]*">[\s\n]*\{unreadMsgCount\.total)/g, '$1bg-blue-100/80 text-blue-700 border border-blue-200/50$2');

  fs.writeFileSync(file, content);
  console.log('Processed', file);
});
