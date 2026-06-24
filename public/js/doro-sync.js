const fs = require('fs'), path = require('path');
const desktopDirs = fs.readdirSync('C:/Users/arman/Desktop');
let root = null;
for (const d of desktopDirs) {
  const c = path.join('C:/Users/arman/Desktop', d, 'DAPA_Solofoniaina_Armando/Dev_Web_Perso/doro_party/server.js');
  if (fs.existsSync(c)) { root = path.dirname(c); break; }
}
const target = path.join(root, 'public/js/doro-sync.js');
fs.copyFileSync(process.argv[1], target);
console.log('Written:', target);
