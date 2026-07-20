import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const partsDirectory = path.resolve('scratch/wi3-bootstrap.parts');
const parts = fs.readdirSync(partsDirectory)
  .filter((name) => name.endsWith('.b64'))
  .sort();

if (parts.length !== 5) {
  throw new Error(`Expected five WI3 bootstrap parts, found ${parts.length}`);
}

const encoded = parts
  .map((name) => fs.readFileSync(path.join(partsDirectory, name), 'utf8').trim())
  .join('');
const outputPath = path.resolve('scratch/wi3-bootstrap.generated.mjs');
fs.writeFileSync(outputPath, Buffer.from(encoded, 'base64'));
await import(pathToFileURL(outputPath).href);
