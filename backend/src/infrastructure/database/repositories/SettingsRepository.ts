import { ISettingsRepository } from '../../../application/interfaces/IRepositories';
import { Settings } from 'shared';
import { db } from '../connection';
import { settings } from '../schema';
import { eq } from 'drizzle-orm';

export class SettingsRepository implements ISettingsRepository {
  async get(): Promise<Settings | null> {
    const rows = db.select().from(settings).where(eq(settings.id, 'default')).all();
    if (rows.length === 0) return null;
    const row = rows[0];
    return {
      id: row.id,
      businessName: row.businessName,
      logoUrl: row.logoUrl || undefined,
      primaryColor: row.primaryColor,
      secondaryColor: row.secondaryColor,
      accentColor: row.accentColor,
      address: row.address,
      phone: row.phone,
      email: row.email,
      website: row.website,
      invoiceFooter: row.invoiceFooter || undefined,
      defaultTaxRate: row.defaultTaxRate,
      currency: row.currency,
      timezone: row.timezone,
      dateFormat: row.dateFormat,
    };
  }

  async save(data: Settings): Promise<Settings> {
    const now = new Date().toISOString();
    const existing = await this.get();

    const values = {
      id: 'default',
      businessName: data.businessName,
      logoUrl: data.logoUrl || null,
      primaryColor: data.primaryColor,
      secondaryColor: data.secondaryColor,
      accentColor: data.accentColor,
      address: data.address,
      phone: data.phone,
      email: data.email,
      website: data.website,
      invoiceFooter: data.invoiceFooter || null,
      defaultTaxRate: data.defaultTaxRate,
      currency: data.currency,
      timezone: data.timezone,
      dateFormat: data.dateFormat,
      updatedAt: now,
    };

    if (existing) {
      db.update(settings)
        .set(values)
        .where(eq(settings.id, 'default'))
        .run();
    } else {
      db.insert(settings)
        .values({
          ...values,
          createdAt: now,
        })
        .run();
    }

    return (await this.get())!;
  }
}
