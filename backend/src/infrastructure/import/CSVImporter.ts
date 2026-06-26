import csv from 'csv-parser';
import { Readable } from 'stream';
import { db } from '../database/connection';
import { customers, customFieldsDefinition, customFieldsValues } from '../database/schema';
import { eq } from 'drizzle-orm';
import crypto from 'crypto';

export interface CSVImportRow {
  [key: string]: string;
}

export function parseCSV(csvString: string): Promise<CSVImportRow[]> {
  return new Promise((resolve, reject) => {
    const results: CSVImportRow[] = [];
    const stream = Readable.from([csvString]);
    
    stream
      .pipe(csv())
      .on('data', (data) => results.push(data))
      .on('end', () => resolve(results))
      .on('error', (err) => reject(err));
  });
}

export interface ImportResult {
  success: boolean;
  importedCount: number;
  errors: string[];
}

export async function importCustomersFromCSV(csvString: string): Promise<ImportResult> {
  const errors: string[] = [];
  let importedCount = 0;

  try {
    const rows = await parseCSV(csvString);
    if (rows.length === 0) {
      return { success: false, importedCount: 0, errors: ['CSV file is empty or has no header row.'] };
    }

    // Fetch custom field definitions for customer
    const cfDefs = await db
      .select()
      .from(customFieldsDefinition)
      .where(eq(customFieldsDefinition.entityType, 'customer'));

    // Execute the entire import in a single transaction. 
    // If anything fails, the database rollback triggers automatically.
    await db.transaction(async (tx) => {
      const now = new Date().toISOString();

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        
        // Find standard headers (case-insensitive checks)
        const firstName = row.first_name || row.firstName || row.FirstName || '';
        const lastName = row.last_name || row.lastName || row.LastName || '';
        const email = row.email || row.Email || '';
        const company = row.company || row.Company || null;
        const phone = row.phone || row.Phone || null;
        const mobile = row.mobile || row.Mobile || null;
        const address = row.address || row.Address || null;
        const notes = row.notes || row.Notes || null;
        const rawTags = row.tags || row.Tags || '';

        // Validations
        if (!firstName.trim() || !lastName.trim()) {
          throw new Error(`Row ${i + 1}: First Name and Last Name are required.`);
        }
        if (!email.trim() || !email.includes('@')) {
          throw new Error(`Row ${i + 1}: A valid email is required.`);
        }

        // Process tags
        const tagsArray = rawTags
          .split(',')
          .map(t => t.trim())
          .filter(t => t.length > 0);
        const tagsJson = JSON.stringify(tagsArray);

        const customerId = crypto.randomUUID();

        // Check if email already exists
        const existing = await tx
          .select()
          .from(customers)
          .where(eq(customers.email, email.trim().toLowerCase()))
          .limit(1);

        if (existing.length > 0) {
          // If customer exists, we can skip or update. Let's skip to prevent overriding existing profiles, or throw an error.
          // In local-first, skipping duplicate emails and warning the user is great practice.
          errors.push(`Row ${i + 1}: Customer with email "${email}" already exists. Skipped.`);
          continue;
        }

        // Insert Customer row
        await tx.insert(customers).values({
          id: customerId,
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          email: email.trim().toLowerCase(),
          company: company ? company.trim() : null,
          phone: phone ? phone.trim() : null,
          mobile: mobile ? mobile.trim() : null,
          address: address ? address.trim() : null,
          notes: notes ? notes.trim() : null,
          tags: tagsJson,
          createdAt: now,
          updatedAt: now,
        });

        // Map any dynamic custom columns
        for (const [key, value] of Object.entries(row)) {
          if (!value || !value.trim()) continue;

          // Check if column matches custom field by label or name
          const normalizedCol = key.trim().toLowerCase().replace(/^cf_/, '');
          const matchedDef = cfDefs.find(
            def => 
              def.name.toLowerCase() === normalizedCol || 
              def.label.toLowerCase() === key.trim().toLowerCase()
          );

          if (matchedDef) {
            // Check required validator for custom field
            if (matchedDef.required && !value.trim()) {
              throw new Error(`Row ${i + 1}: Required custom field "${matchedDef.label}" is empty.`);
            }

            await tx.insert(customFieldsValues).values({
              id: crypto.randomUUID(),
              entityId: customerId,
              fieldId: matchedDef.id,
              value: value.trim(),
              createdAt: now,
              updatedAt: now,
            });
          }
        }

        importedCount++;
      }
    });

    return {
      success: true,
      importedCount,
      errors
    };
  } catch (error: any) {
    return {
      success: false,
      importedCount: 0,
      errors: [error.message || 'Fatal error parsing customer CSV file.']
    };
  }
}
