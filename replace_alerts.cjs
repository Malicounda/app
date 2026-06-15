const fs = require('fs');
const file = 'client/src/components/layout/Sidebar.tsx';
let content = fs.readFileSync(file, 'utf8');

// The replacement logic:
// Look for blocks that have <span className={iconWrapCls}> followed by <AlertsIcon ... />
// followed by </span> and <span className={cn(labelCls, 'flex items-center gap-2')}> Alertes
// and then the badge logic, and replace the whole block.
// To be safe, we will just use regex to find the exact bad blocks.

const regex = /<span className=\{iconWrapCls\}>[\s\n]*<AlertsIcon className=\{cn\('text-gray-600', iconSize\)\} \/>[\s\n]*<\/span>[\s\n]*<span className=\{cn\(labelCls, 'flex items-center gap-2'\)\}>[\s\n]*Alertes[\s\n]*\{unread > 0 && \([\s\n]*<span className="ml-1 inline-flex items-center justify-center min-w-\[18px\] h-5 px-1 rounded-full bg-red-600 text-white text-xs font-semibold">[\s\n]*\{unread\}[\s\n]*<\/span>[\s\n]*\)\}[\s\n]*<\/span>/g;

const replacement = `<span className={cn(iconWrapCls, collapsed && 'relative')}>
                <AlertsIcon className={cn('text-gray-600', iconSize)} />
                {collapsed && unread > 0 && (
                  <span className="absolute -top-2 left-1/2 -translate-x-1/2 inline-flex items-center justify-center min-w-[18px] h-5 px-1 rounded-full bg-red-600 text-white text-xs font-semibold">
                    {unreadDisplay}
                  </span>
                )}
              </span>
              <span className={cn(labelCls, 'flex items-center gap-2')}>
                Alertes
                {!collapsed && unread > 0 && (
                  <span className="ml-1 inline-flex items-center justify-center min-w-[18px] h-5 px-1 rounded-full bg-red-600 text-white text-xs font-semibold">
                    {unreadDisplay}
                  </span>
                )}
              </span>`;

let newContent = content.replace(regex, replacement);

if (newContent !== content) {
    fs.writeFileSync(file, newContent);
    console.log('Replaced bad Alert badges in Sidebar.tsx');
} else {
    console.log('No matches found for replacement');
}
