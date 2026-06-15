const fs = require('fs');
const file = 'client/src/components/layout/Sidebar.tsx';
let content = fs.readFileSync(file, 'utf8');

const regex2 = /<span className=\{iconWrapCls\}>[\s\n]*<AlertsIcon className=\{cn\('text-amber-600', iconSize\)\} \/>[\s\n]*<\/span>[\s\n]*<span className=\{labelCls\}>Mes Alertes<\/span>/g;

const replacement2 = `<span className={cn(iconWrapCls, collapsed && 'relative')}>
                <AlertsIcon className={cn('text-amber-600', iconSize)} />
                {collapsed && unread > 0 && (
                  <span className="absolute -top-2 left-1/2 -translate-x-1/2 inline-flex items-center justify-center min-w-[18px] h-5 px-1 rounded-full bg-red-600 text-white text-xs font-semibold">
                    {unreadDisplay}
                  </span>
                )}
              </span>
              <span className={cn(labelCls, 'flex items-center gap-2')}>
                Mes Alertes
                {!collapsed && unread > 0 && (
                  <span className="ml-1 inline-flex items-center justify-center min-w-[18px] h-5 px-1 rounded-full bg-red-600 text-white text-xs font-semibold">
                    {unreadDisplay}
                  </span>
                )}
              </span>`;

content = content.replace(regex2, replacement2);
fs.writeFileSync(file, content);
console.log('Replaced Mes Alertes badge');
