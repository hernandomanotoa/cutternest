// Copia builds UMD de jspdf y html2canvas al directorio estático del Assembly Planner
// para que la app vanilla en public/ pueda usarlos sin pasar por Vite.
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const VENDOR_DIR = path.join(ROOT, 'public', 'assembly-planner', 'vendor');

const files = [
  { src: path.join(ROOT, 'node_modules', 'jspdf', 'dist', 'jspdf.umd.min.js'), dest: 'jspdf.umd.min.js' },
  { src: path.join(ROOT, 'node_modules', 'html2canvas', 'dist', 'html2canvas.min.js'), dest: 'html2canvas.min.js' },
];

fs.mkdirSync(VENDOR_DIR, { recursive: true });

let missing = false;
files.forEach(({ src, dest }) => {
  if (!fs.existsSync(src)) {
    console.warn(`[copy-pdf-vendor] No se encontró ${src}. Omitiendo copia.`);
    missing = true;
    return;
  }
  const target = path.join(VENDOR_DIR, dest);
  fs.copyFileSync(src, target);
  console.log(`[copy-pdf-vendor] Copiado: ${path.relative(ROOT, target)}`);
});

if (missing) {
  console.warn('[copy-pdf-vendor] Algunos archivos no se copiaron. Ejecuta "pnpm install" si usas PDF real en el Assembly Planner.');
  process.exit(0);
}
