const fs = require('fs');
const path = 'client/src/components/layout/Sidebar.tsx';
let content = fs.readFileSync(path, 'utf8');

const target = 'href="/accounts"';

const replacement = `<Link
              href="/map"
              onClick={handleLinkClick}
              className={location === '/map' ? activeLinkStyle : linkStyle}
            >
              <span className={iconWrapCls}>
                <MapIcon className={cn('text-slate-400', iconSize)} />
              </span>
              <span className={labelCls}>Carte Nationale</span>
            </Link>

            <Link
              href="/accounts"`;

// find the exact index of the target inside the super admin block. 
// Super admin block starts around "isUserSuperAdmin(user)"
const startBlock = content.indexOf('isUserSuperAdmin(user)');
const indexOfAccounts = content.indexOf(target, startBlock);
if(indexOfAccounts !== -1) {
    // We want to replace the <Link just before it. We'll search backwards for <Link
    const linkStart = content.lastIndexOf('<Link', indexOfAccounts);
    if(linkStart !== -1) {
        content = content.substring(0, linkStart) + replacement.replace('<Link\\n              href="/accounts"', '') + content.substring(linkStart);
        fs.writeFileSync(path, content, 'utf8');
        console.log("Success");
    }
} else {
    console.log("Not found");
}
