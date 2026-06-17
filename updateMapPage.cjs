const fs = require('fs');
const path = 'client/src/pages/MapPage.tsx';
let content = fs.readFileSync(path, 'utf8');

const target1 = "const isAdmin = role.includes('admin');";
const replacement1 = "const isAdmin = role.includes('admin') || isUserSuperAdmin(user);";

if (content.includes(target1)) {
    content = content.replaceAll(target1, replacement1);
    fs.writeFileSync(path, content, 'utf8');
    console.log("Success");
} else {
    console.log("Not found");
}
