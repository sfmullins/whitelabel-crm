import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import { sqlite } from './connection';

export interface DocumentRecordInput {
  id: string;
  versionId: string;
  title: string;
  filename: string;
  mimeType: string;
  byteSize: number;
  checksum: string;
  storageKey: string;
  description?: string | null;
  category?: string | null;
  versionNote?: string | null;
  links: Array<{ entityType: string; entityId: string }>;
}

const timestamp = () => new Date().toISOString();

export class DocumentRepository {
  constructor(private readonly connection: Database.Database = sqlite as Database.Database) {}

  create(input: DocumentRecordInput) {
    const now = timestamp();
    this.connection.transaction(() => {
      this.connection.prepare(`
        INSERT INTO documents(id,title,current_filename,mime_type,byte_size,checksum,storage_provider,storage_key,
          description,category,created_at,updated_at,archived_at)
        VALUES(@id,@title,@filename,@mimeType,@byteSize,@checksum,'local',@storageKey,@description,@category,@now,@now,NULL)
      `).run({ ...input, title: input.title.trim(), description: input.description?.trim() || null, category: input.category?.trim() || null, now });
      this.connection.prepare(`
        INSERT INTO document_versions(id,document_id,version_number,filename,mime_type,byte_size,checksum,storage_key,version_note,created_at)
        VALUES(@versionId,@id,1,@filename,@mimeType,@byteSize,@checksum,@storageKey,@versionNote,@now)
      `).run({ ...input, versionNote: input.versionNote?.trim() || null, now });
      const statement = this.connection.prepare(`INSERT INTO document_links(id,document_id,entity_type,entity_id,created_at) VALUES(?,?,?,?,?)`);
      for (const link of input.links) statement.run(randomUUID(),input.id,link.entityType,link.entityId,now);
      this.connection.prepare('UPDATE documents SET updated_at=? WHERE id=?').run(now,input.id);
    })();
    return this.getById(input.id)!;
  }

  addVersion(input: Omit<DocumentRecordInput,'title'|'links'>) {
    const document = this.getById(input.id);
    if (!document || document.archivedAt) throw new Error('Document not found');
    const now = timestamp();
    const versionNumber = ((this.connection.prepare('SELECT max(version_number) AS value FROM document_versions WHERE document_id=?').get(input.id) as { value: number | null }).value ?? 0) + 1;
    this.connection.transaction(() => {
      this.connection.prepare(`
        INSERT INTO document_versions(id,document_id,version_number,filename,mime_type,byte_size,checksum,storage_key,version_note,created_at)
        VALUES(@versionId,@id,@versionNumber,@filename,@mimeType,@byteSize,@checksum,@storageKey,@versionNote,@now)
      `).run({ ...input, versionNumber, versionNote: input.versionNote?.trim() || null, now });
      this.connection.prepare(`
        UPDATE documents SET current_filename=@filename,mime_type=@mimeType,byte_size=@byteSize,checksum=@checksum,
          storage_key=@storageKey,updated_at=@now WHERE id=@id
      `).run({ ...input, now });
    })();
    return this.getById(input.id)!;
  }

  getById(id: string) {
    const row = this.connection.prepare('SELECT * FROM documents WHERE id=?').get(id) as Record<string, unknown> | undefined;
    if (!row) return null;
    const links = this.connection.prepare('SELECT entity_type,entity_id FROM document_links WHERE document_id=? ORDER BY entity_type,entity_id').all(id) as Array<{ entity_type: string; entity_id: string }>;
    const versions = this.connection.prepare('SELECT * FROM document_versions WHERE document_id=? ORDER BY version_number DESC').all(id) as Array<Record<string, unknown>>;
    return {
      id: row.id,
      title: row.title,
      currentFilename: row.current_filename,
      mimeType: row.mime_type,
      byteSize: row.byte_size,
      checksum: row.checksum,
      storageProvider: row.storage_provider,
      storageKey: row.storage_key,
      description: row.description,
      category: row.category,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      archivedAt: row.archived_at,
      links: links.map((link) => ({ entityType: link.entity_type, entityId: link.entity_id })),
      versions: versions.map((version) => ({
        id: version.id,
        documentId: version.document_id,
        versionNumber: version.version_number,
        filename: version.filename,
        mimeType: version.mime_type,
        byteSize: version.byte_size,
        checksum: version.checksum,
        storageKey: version.storage_key,
        versionNote: version.version_note,
        createdAt: version.created_at,
      })),
    };
  }

  list(input: { organisationId?: string; includeArchived?: boolean } = {}) {
    const rows = this.connection.prepare(`
      SELECT DISTINCT d.id FROM documents d LEFT JOIN document_links l ON l.document_id=d.id
      WHERE (@organisationId IS NULL OR (l.entity_type='organisation' AND l.entity_id=@organisationId))
        AND (@includeArchived=1 OR d.archived_at IS NULL)
      ORDER BY d.updated_at DESC
    `).all({ organisationId: input.organisationId ?? null, includeArchived: input.includeArchived ? 1 : 0 }) as Array<{ id: string }>;
    return rows.map((row) => this.getById(row.id)!);
  }

  updateMetadata(id: string,input: { title?: string; description?: string | null; category?: string | null }) {
    const document = this.getById(id);
    if (!document || document.archivedAt) throw new Error('Document not found');
    const columns: string[] = [];
    const params: Record<string, unknown> = { id, updatedAt: timestamp() };
    if (input.title !== undefined) { columns.push('title=@title'); params.title=input.title.trim(); }
    if (Object.prototype.hasOwnProperty.call(input,'description')) { columns.push('description=@description'); params.description=input.description?.trim() || null; }
    if (Object.prototype.hasOwnProperty.call(input,'category')) { columns.push('category=@category'); params.category=input.category?.trim() || null; }
    if (!columns.length) return document;
    columns.push('updated_at=@updatedAt');
    this.connection.prepare(`UPDATE documents SET ${columns.join(',')} WHERE id=@id`).run(params);
    return this.getById(id)!;
  }

  addLink(id: string,entityType: string,entityId: string) {
    if (!this.getById(id)) throw new Error('Document not found');
    this.connection.prepare(`INSERT OR IGNORE INTO document_links(id,document_id,entity_type,entity_id,created_at) VALUES(?,?,?,?,?)`).run(randomUUID(),id,entityType,entityId,timestamp());
    this.connection.prepare('UPDATE documents SET updated_at=? WHERE id=?').run(timestamp(),id);
    return this.getById(id)!;
  }

  archive(id: string) {
    const now = timestamp();
    const result = this.connection.prepare('UPDATE documents SET archived_at=coalesce(archived_at,?),updated_at=? WHERE id=?').run(now,now,id);
    if (!result.changes) throw new Error('Document not found');
    return this.getById(id)!;
  }

  restore(id: string) {
    const result = this.connection.prepare('UPDATE documents SET archived_at=NULL,updated_at=? WHERE id=?').run(timestamp(),id);
    if (!result.changes) throw new Error('Document not found');
    return this.getById(id)!;
  }

  listStorageKeys() {
    return this.connection.prepare('SELECT storage_key FROM document_versions').all() as Array<{ storage_key: string }>;
  }
}
