const fs = require('fs');
const path = require('path');

function addDynamic(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  if (content.indexOf('force-dynamic') === -1) {
    content = "export const dynamic = 'force-dynamic';\n" + content;
    fs.writeFileSync(filePath, content);
    console.log('Fixed: ' + filePath);
  }
}

function walk(dir) {
  fs.readdirSync(dir).forEach(function(file) {
    const full = path.join(dir, file);
    if (fs.statSync(full).isDirectory()) walk(full);
    else if (file === 'route.ts') addDynamic(full);
  });
}

walk('src/app/api');
console.log('done');
