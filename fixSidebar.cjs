const fs = require('fs');
const path = 'client/src/components/layout/Sidebar.tsx';
let content = fs.readFileSync(path, 'utf8');

const target = `<Link
              href="/accounts"<Link
              href="/accounts"`;

const replacement = `<Link
              href="/accounts"`;

if (content.includes(target)) {
    content = content.replace(target, replacement);
    fs.writeFileSync(path, content, 'utf8');
    console.log("Success");
} else {
    console.log("Not found target. Let's try flexible replace.");
    content = content.replace(/<Link\s+href="\/accounts"<Link\s+href="\/accounts"/g, '<Link\n              href="/accounts"');
    fs.writeFileSync(path, content, 'utf8');
    console.log("Flexible replace executed");
}
