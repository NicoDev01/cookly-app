import fs from 'node:fs';
import path from 'node:path';

const packageSwiftPath = path.resolve('node_modules/@supernotes/capacitor-send-intent/Package.swift');

if (fs.existsSync(packageSwiftPath)) {
  let content = fs.readFileSync(packageSwiftPath, 'utf8');
  let updated = false;

  if (content.includes('name: "SendIntent"')) {
    content = content.replace(/name:\s*"SendIntent"/g, 'name: "SupernotesCapacitorSendIntent"');
    updated = true;
  }
  if (content.includes('.library(\n            name: "SendIntent",') || content.includes('.library(name: "SendIntent",') || content.includes('.library(\n            name: "SendIntent"')) {
    content = content.replace(/name:\s*"SendIntent"/g, 'name: "SupernotesCapacitorSendIntent"');
    updated = true;
  }

  if (updated) {
    fs.writeFileSync(packageSwiftPath, content, 'utf8');
    console.log('[patch-send-intent] Successfully patched @supernotes/capacitor-send-intent/Package.swift for Capacitor 8 SPM.');
  } else {
    console.log('[patch-send-intent] Package.swift is already patched.');
  }
}
