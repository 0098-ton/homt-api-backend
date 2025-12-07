// pdf-details.mjs
// Run: node pdf-details.mjs yourfile.pdf

import fs from 'fs';
import * as pdfjsLib from 'pdfjs-dist';

// Set workerSrc to the built-in Node.js worker path
pdfjsLib.GlobalWorkerOptions.workerSrc = `pdfjs-dist/build/pdf.worker.js`;

const pdfPath = process.argv[2];
if (!pdfPath) {
  console.error('Usage: node pdf-details.mjs <pdf-file>');
  process.exit(1);
}

const data = new Uint8Array(fs.readFileSync(pdfPath));
const pdf = await pdfjsLib.getDocument({ data }).promise;

console.log('PDF Info'.padEnd(50, '='));
console.log(`File      : ${pdfPath}`);
console.log(`Pages     : ${pdf.numPages}`);
console.log(`Encrypted : ${pdf.isEncrypted ? 'Yes' : 'No'}`);

const metadata = await pdf.getMetadata();
console.log('\nMetadata'.padEnd(50, '='));
if (metadata.info) Object.entries(metadata.info).forEach(([k, v]) => console.log(`${k.padEnd(20)}: ${v}`));
if (metadata.metadata) console.log(metadata.metadata.getAll());

console.log('\nText Content'.padEnd(50, '-'));
let fullText = '';

for (let i = 1; i <= pdf.numPages; i++) {
  const page = await pdf.getPage(i);
  const content = await page.getTextContent();
  const text = content.items.map(s => s.str).join(' ');
  fullText += text + '\n\n';
  console.log(`Page ${i}: ${text.slice(0, 400)}${text.length > 400 ? '...' : ''}\n`);
}

const out = pdfPath.replace(/\.[^.]+$/, '') + '_extracted.txt';
fs.writeFileSync(out, fullText.trim());
console.log(`Text extracted → ${out}`);