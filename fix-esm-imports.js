// fix-esm-imports.js
const fs = require('fs');
const path = require('path');

const extensions = ['.ts', '.tsx'];

function walk(dir, callback) {
  fs.readdirSync(dir).forEach(file => {
    const full = path.join(dir, file);
    const stat = fs.statSync(full);
    if (stat.isDirectory() && !file.includes('node_modules')) {
      walk(full, callback);
    } else if (extensions.includes(path.extname(full))) {
      callback(full);
    }
  });
}

function fixImports(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  let changed = false;

  const fixedContent = content.replace(
    /(import|export)\s+(.*?\s+from\s+)?['"](\.\/[^'"]+?)['"]/g,
    (match, type, specifier, modulePath) => {
      const ext = path.extname(modulePath);
      if (ext || modulePath.endsWith('/')) {
        return match; // Already has extension or is a folder import
      }
      if (modulePath.startsWith('./') || modulePath.startsWith('../')) {
        changed = true;
        return match.replace(modulePath, modulePath + '.js');
      }
      return match;
    }
  );

  if (changed) {
    console.log(`✅ Fixed: ${filePath}`);
    fs.writeFileSync(filePath, fixedContent, 'utf8');
  }
}

const targetDir = process.argv[2] || 'src';
if (!fs.existsSync(targetDir)) {
  console.error(`❌ Directory not found: ${targetDir}`);
  process.exit(1);
}

walk(targetDir, fixImports);
console.log('✅ All imports fixed.');