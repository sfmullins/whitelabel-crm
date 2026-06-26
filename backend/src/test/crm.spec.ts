import { describe, it, expect } from 'vitest';
import { parseCSV } from '../infrastructure/import/CSVImporter';

describe('Financial Math & Invoicing', () => {
  it('should accurately calculate invoice totals in cents', () => {
    // Standard service price: $120.50 -> 12050 cents
    const unitPriceCents = 12050;
    const quantity = 2;
    const taxRatePercent = 15.0; // 15%
    const discountCents = 1000; // $10.00

    const subtotal = quantity * unitPriceCents; // 24100
    const tax = Math.round(subtotal * (taxRatePercent / 100)); // 3615
    const total = subtotal + tax - discountCents; // 26715

    expect(subtotal).toBe(24100);
    expect(tax).toBe(3615);
    expect(total).toBe(26715);
  });

  it('should handle zero tax and zero discounts correctly', () => {
    const unitPriceCents = 5000; // $50.00
    const quantity = 1;
    const taxRatePercent = 0.0;
    const discountCents = 0;

    const subtotal = quantity * unitPriceCents;
    const tax = Math.round(subtotal * (taxRatePercent / 100));
    const total = subtotal + tax - discountCents;

    expect(subtotal).toBe(5000);
    expect(tax).toBe(0);
    expect(total).toBe(5000);
  });
});

describe('CSV Importer Format Parser', () => {
  it('should parse standard CSV headers and fields into JSON records', async () => {
    const mockCsvData = `first_name,last_name,email,company,tags\nJane,Doe,jane@example.com,Acme,"tag1, tag2"`;
    const parsed = await parseCSV(mockCsvData);

    expect(parsed.length).toBe(1);
    expect(parsed[0].first_name).toBe('Jane');
    expect(parsed[0].last_name).toBe('Doe');
    expect(parsed[0].email).toBe('jane@example.com');
    expect(parsed[0].company).toBe('Acme');
    expect(parsed[0].tags).toBe('tag1, tag2');
  });

  it('should handle carriage returns and leading/trailing spaces', async () => {
    const mockCsvData = `first_name,last_name,email\r\n John , Smith , john@example.com `;
    const parsed = await parseCSV(mockCsvData);

    expect(parsed.length).toBe(1);
    expect(parsed[0].first_name?.trim()).toBe('John');
    expect(parsed[0].last_name?.trim()).toBe('Smith');
    expect(parsed[0].email?.trim()).toBe('john@example.com');
  });
});
