import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { getRuntimePaths } from '../../config/runtimePaths';

export interface StoredDocumentContent {
  storageKey: string;
  checksum: string;
  byteSize: number;
}

const MAX_DOCUMENT_BYTES = 8 * 1024 * 1024;
const SAFE_MIME_TYPES = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/webp',
  'text/plain',
  'text/csv',
  'application/json',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
]);

function safeFilename(value: string): string {
  const base = path.basename(value).normalize('NFKC').replace(/[^a-zA-Z0-9._ -]+/g, '_').trim();
  return base.slice(0, 160) || 'document';
}

export class LocalDocumentStorage {
  private readonly root: string;

  constructor(root = getRuntimePaths().documentDirectory) {
    this.root = path.resolve(root);
    fs.mkdirSync(this.root, { recursive: true });
  }

  decodeBase64(contentBase64: string): Buffer {
    if (!/^[A-Za-z0-9+/]*={0,2}$/.test(contentBase64.replace(/\s/g, ''))) {
      throw new Error('Document content is not valid base64');
    }
    const buffer = Buffer.from(contentBase64, 'base64');
    if (buffer.byteLength === 0) throw new Error('Document content is empty');
    if (buffer.byteLength > MAX_DOCUMENT_BYTES) throw new Error('Document exceeds the 8 MB local upload limit');
    return buffer;
  }

  assertMimeType(mimeType: string): void {
    if (!SAFE_MIME_TYPES.has(mimeType.toLowerCase())) {
      throw new Error(`Unsupported document MIME type: ${mimeType}`);
    }
  }

  write(documentId: string, versionId: string, filename: string, content: Buffer): StoredDocumentContent {
    const relativeKey = `${documentId}/${versionId}-${safeFilename(filename)}`;
    const absolute = this.resolveStorageKey(relativeKey);
    fs.mkdirSync(path.dirname(absolute), { recursive: true });
    const temporary = `${absolute}.tmp-${process.pid}-${crypto.randomUUID()}`;
    fs.writeFileSync(temporary, content, { flag: 'wx' });
    fs.renameSync(temporary, absolute);
    return {
      storageKey: relativeKey,
      checksum: crypto.createHash('sha256').update(content).digest('hex'),
      byteSize: content.byteLength,
    };
  }

  read(storageKey: string): Buffer {
    return fs.readFileSync(this.resolveStorageKey(storageKey));
  }

  remove(storageKey: string): void {
    const absolute = this.resolveStorageKey(storageKey);
    fs.rmSync(absolute, { force: true });
    const parent = path.dirname(absolute);
    if (parent !== this.root && fs.existsSync(parent) && fs.readdirSync(parent).length === 0) {
      fs.rmdirSync(parent);
    }
  }

  exists(storageKey: string): boolean {
    return fs.existsSync(this.resolveStorageKey(storageKey));
  }

  private resolveStorageKey(storageKey: string): string {
    if (path.isAbsolute(storageKey)) throw new Error('Absolute document paths are not permitted');
    const resolved = path.resolve(this.root, storageKey);
    if (resolved !== this.root && !resolved.startsWith(`${this.root}${path.sep}`)) {
      throw new Error('Document storage key escapes the configured storage directory');
    }
    return resolved;
  }
}
