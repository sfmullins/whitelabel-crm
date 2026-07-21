import { randomUUID } from 'node:crypto';
import { DocumentRepository } from '../../infrastructure/database/DocumentRepository';
import { LocalDocumentStorage } from '../../infrastructure/storage/LocalDocumentStorage';

export interface UploadDocumentInput {
  title: string;
  filename: string;
  mimeType: string;
  contentBase64: string;
  description?: string | null;
  category?: string | null;
  versionNote?: string | null;
  links: Array<{ entityType: string; entityId: string }>;
}

export class DocumentService {
  constructor(
    private readonly repository = new DocumentRepository(),
    private readonly storage = new LocalDocumentStorage(),
  ) {}

  list(input: { organisationId?: string; includeArchived?: boolean } = {}) {
    return this.repository.list(input);
  }

  getById(id: string) {
    const document = this.repository.getById(id);
    if (!document) throw new Error('Document not found');
    return document;
  }

  upload(input: UploadDocumentInput) {
    this.storage.assertMimeType(input.mimeType);
    const content = this.storage.decodeBase64(input.contentBase64);
    const id = randomUUID();
    const versionId = randomUUID();
    const stored = this.storage.write(id,versionId,input.filename,content);
    try {
      return this.repository.create({
        id,
        versionId,
        title: input.title,
        filename: input.filename,
        mimeType: input.mimeType,
        byteSize: stored.byteSize,
        checksum: stored.checksum,
        storageKey: stored.storageKey,
        description: input.description,
        category: input.category,
        versionNote: input.versionNote,
        links: input.links,
      });
    } catch (error) {
      this.storage.remove(stored.storageKey);
      throw error;
    }
  }

  addVersion(id: string,input: Omit<UploadDocumentInput,'title'|'links'>) {
    const current = this.getById(id);
    this.storage.assertMimeType(input.mimeType);
    const content = this.storage.decodeBase64(input.contentBase64);
    const versionId = randomUUID();
    const stored = this.storage.write(id,versionId,input.filename,content);
    try {
      return this.repository.addVersion({
        id,
        versionId,
        filename: input.filename,
        mimeType: input.mimeType,
        byteSize: stored.byteSize,
        checksum: stored.checksum,
        storageKey: stored.storageKey,
        description: current.description as string | null,
        category: current.category as string | null,
        versionNote: input.versionNote,
      });
    } catch (error) {
      this.storage.remove(stored.storageKey);
      throw error;
    }
  }

  content(id: string) {
    const document = this.getById(id);
    if (document.archivedAt) throw new Error('Document is archived');
    return {
      filename: String(document.currentFilename),
      mimeType: String(document.mimeType),
      content: this.storage.read(String(document.storageKey)),
    };
  }

  updateMetadata(id: string,input: { title?: string; description?: string | null; category?: string | null }) {
    return this.repository.updateMetadata(id,input);
  }

  addLink(id: string,entityType: string,entityId: string) {
    return this.repository.addLink(id,entityType,entityId);
  }

  archive(id: string) { return this.repository.archive(id); }
  restore(id: string) { return this.repository.restore(id); }

  integrityReport() {
    const missing = this.repository.listStorageKeys().filter((entry) => !this.storage.exists(entry.storage_key));
    return { checkedAt: new Date().toISOString(),missing,healthy: missing.length === 0 };
  }
}
