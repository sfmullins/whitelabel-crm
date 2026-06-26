import { db } from './connection';
import * as schema from './schema';
import crypto from 'crypto';

console.log('Seeding SQLite database...');

async function runSeed() {
  try {
    // 1. Clean existing data
    console.log('Cleaning existing tables...');
    db.delete(schema.payments).run();
    db.delete(schema.invoiceItems).run();
    db.delete(schema.invoices).run();
    db.delete(schema.bookings).run();
    db.delete(schema.customFieldsValues).run();
    db.delete(schema.customObjectsValues).run();
    db.delete(schema.customObjectsRecords).run();
    db.delete(schema.customFieldsDefinition).run();
    db.delete(schema.customObjectsDefinition).run();
    db.delete(schema.services).run();
    db.delete(schema.customers).run();
    db.delete(schema.settings).run();

    const now = new Date().toISOString();

    // 2. Seed Settings (Skip onboarding by default, using professional branding)
    console.log('Seeding Settings...');
    const settingsId = 'default';
    db.insert(schema.settings).values({
      id: settingsId,
      businessName: 'Apex Tech Solutions',
      logoUrl: '', // Will be uploaded or fallback in UI
      primaryColor: '#0f172a', // Slate 900
      secondaryColor: '#3b82f6', // Blue 500
      accentColor: '#10b981', // Emerald 500
      address: '123 Enterprise Way, Suite 400, San Francisco, CA 94107',
      phone: '+1 (555) 019-2834',
      email: 'hello@apextech.com',
      website: 'https://apextech.io',
      invoiceFooter: 'Thank you for your business! Payment is due within 30 days.',
      defaultTaxRate: 8.25,
      currency: 'USD',
      timezone: 'America/Los_Angeles',
      dateFormat: 'YYYY-MM-DD',
      createdAt: now,
      updatedAt: now,
    }).run();

    // 3. Seed Services
    console.log('Seeding Services...');
    const servicesData = [
      {
        id: crypto.randomUUID(),
        name: 'Cloud Infrastructure Consultation',
        description: 'Review of current AWS/Azure setups, cost optimization, and architecture roadmap.',
        duration: 90, // minutes
        price: 25000, // $250.00 (in cents)
        taxRate: 8.25,
        isActive: true,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: crypto.randomUUID(),
        name: 'Custom React Web Development',
        description: 'Hourly rate for frontend design and implementation work.',
        duration: 60,
        price: 12500, // $125.00
        taxRate: 8.25,
        isActive: true,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: crypto.randomUUID(),
        name: 'Database Performance Tuning',
        description: 'Index optimization, query analysis, and schema refactoring for SQLite or Postgres databases.',
        duration: 120,
        price: 35000, // $350.00
        taxRate: 8.25,
        isActive: true,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: crypto.randomUUID(),
        name: 'Monthly Maintenance & Support',
        description: 'Standard support agreement including security updates and bug fixes.',
        duration: 480, // 8 hours
        price: 80000, // $800.00
        taxRate: 0.0, // Tax exempt service
        isActive: true,
        createdAt: now,
        updatedAt: now,
      },
    ];

    for (const service of servicesData) {
      db.insert(schema.services).values(service).run();
    }

    // 4. Seed Customers
    console.log('Seeding Customers...');
    const customersData = [
      {
        id: crypto.randomUUID(),
        firstName: 'Sarah',
        lastName: 'Connor',
        company: 'Cyberdyne Systems',
        email: 'sconnor@cyberdyne.co',
        phone: '+1 (555) 987-6543',
        mobile: '+1 (555) 123-4567',
        address: '742 Evergreen Terrace, Los Angeles, CA 90001',
        notes: 'Requires secure communication channels. Prefers on-site visits.',
        tags: JSON.stringify(['VIP', 'Active Client', 'Technology']),
        createdAt: now,
        updatedAt: now,
      },
      {
        id: crypto.randomUUID(),
        firstName: 'Bruce',
        lastName: 'Wayne',
        company: 'Wayne Enterprises',
        email: 'bruce@waynecorp.com',
        phone: '+1 (555) 888-0000',
        mobile: '',
        address: '1007 Mountain Drive, Gotham City, NJ 07001',
        notes: 'High-value customer. Only schedule bookings in late afternoons or evenings.',
        tags: JSON.stringify(['Enterprise', 'VIP']),
        createdAt: now,
        updatedAt: now,
      },
      {
        id: crypto.randomUUID(),
        firstName: 'Tony',
        lastName: 'Stark',
        company: 'Stark Industries',
        email: 'tony@stark.com',
        phone: '+1 (555) 300-3000',
        mobile: '+1 (555) 400-4000',
        address: '10880 El Medio St, Malibu, CA 90265',
        notes: 'Invoices should be routed to Pepper Potts. Fast turnaround required.',
        tags: JSON.stringify(['Enterprise', 'Active Client']),
        createdAt: now,
        updatedAt: now,
      },
      {
        id: crypto.randomUUID(),
        firstName: 'Peter',
        lastName: 'Parker',
        company: 'Daily Bugle',
        email: 'peter.parker@bugle.com',
        phone: '+1 (555) 456-7890',
        mobile: '',
        address: '20 Ingram Street, Forest Hills, NY 11375',
        notes: 'Budget conscious. Always apply standard loyalty discounts.',
        tags: JSON.stringify(['Retail', 'Discount Offered']),
        createdAt: now,
        updatedAt: now,
      },
      {
        id: crypto.randomUUID(),
        firstName: 'Diana',
        lastName: 'Prince',
        company: 'The Louvre Museum',
        email: 'diana.prince@louvre.fr',
        phone: '+33 1 40 20 50 50',
        mobile: '',
        address: 'Rue de Rivoli, 75001 Paris, France',
        notes: 'Historical artifacts expert. Client works internationally.',
        tags: JSON.stringify(['Government', 'International']),
        createdAt: now,
        updatedAt: now,
      },
    ];

    for (const customer of customersData) {
      db.insert(schema.customers).values(customer).run();
    }

    // 5. Seed Custom Fields Definitions
    console.log('Seeding Custom Field Definitions...');
    const referredById = crypto.randomUUID();
    const satisfactionScoreId = crypto.randomUUID();

    db.insert(schema.customFieldsDefinition).values({
      id: referredById,
      entityType: 'customer',
      name: 'referred_by',
      label: 'Referred By',
      type: 'text',
      options: '[]',
      required: false,
      createdAt: now,
    }).run();

    db.insert(schema.customFieldsDefinition).values({
      id: satisfactionScoreId,
      entityType: 'customer',
      name: 'satisfaction_score',
      label: 'Satisfaction Score (1-5)',
      type: 'dropdown',
      options: JSON.stringify(['1', '2', '3', '4', '5']),
      required: false,
      createdAt: now,
    }).run();

    // Seed Custom Fields Values for Sarah Connor
    db.insert(schema.customFieldsValues).values({
      id: crypto.randomUUID(),
      entityId: customersData[0].id, // Sarah Connor
      fieldId: referredById,
      value: 'John Connor',
      createdAt: now,
      updatedAt: now,
    }).run();

    db.insert(schema.customFieldsValues).values({
      id: crypto.randomUUID(),
      entityId: customersData[0].id,
      fieldId: satisfactionScoreId,
      value: '5',
      createdAt: now,
      updatedAt: now,
    }).run();

    // Seed Custom Fields Values for Bruce Wayne
    db.insert(schema.customFieldsValues).values({
      id: crypto.randomUUID(),
      entityId: customersData[1].id, // Bruce Wayne
      fieldId: referredById,
      value: 'Alfred Pennyworth',
      createdAt: now,
      updatedAt: now,
    }).run();

    // 6. Seed Custom Objects Definition (e.g. Vehicles owned by clients)
    console.log('Seeding Custom Object Definitions...');
    const vehicleObjDefId = crypto.randomUUID();
    db.insert(schema.customObjectsDefinition).values({
      id: vehicleObjDefId,
      name: 'Vehicle',
      apiName: 'vehicle',
      pluralName: 'Vehicles',
      description: 'Customer fleet or personal vehicles for consulting and support logistics.',
      createdAt: now,
    }).run();

    // Add fields to Vehicle object: Make, Model, License Plate
    const vehicleMakeFieldId = crypto.randomUUID();
    const vehicleModelFieldId = crypto.randomUUID();
    const vehiclePlateFieldId = crypto.randomUUID();

    db.insert(schema.customFieldsDefinition).values({
      id: vehicleMakeFieldId,
      entityType: 'vehicle',
      name: 'make',
      label: 'Make',
      type: 'text',
      options: '[]',
      required: true,
      createdAt: now,
    }).run();

    db.insert(schema.customFieldsDefinition).values({
      id: vehicleModelFieldId,
      entityType: 'vehicle',
      name: 'model',
      label: 'Model',
      type: 'text',
      options: '[]',
      required: true,
      createdAt: now,
    }).run();

    db.insert(schema.customFieldsDefinition).values({
      id: vehiclePlateFieldId,
      entityType: 'vehicle',
      name: 'license_plate',
      label: 'License Plate',
      type: 'text',
      options: '[]',
      required: false,
      createdAt: now,
    }).run();

    // Seed Vehicle Record for Bruce Wayne (The Batmobile)
    console.log('Seeding Custom Object Records (Vehicles)...');
    const vehicleRecordId = crypto.randomUUID();
    db.insert(schema.customObjectsRecords).values({
      id: vehicleRecordId,
      objectDefinitionId: vehicleObjDefId,
      customerId: customersData[1].id, // Bruce Wayne
      createdAt: now,
      updatedAt: now,
    }).run();

    // Seed vehicle field values
    db.insert(schema.customObjectsValues).values({
      id: crypto.randomUUID(),
      recordId: vehicleRecordId,
      fieldId: vehicleMakeFieldId,
      value: 'Wayne Tech',
      createdAt: now,
      updatedAt: now,
    }).run();

    db.insert(schema.customObjectsValues).values({
      id: crypto.randomUUID(),
      recordId: vehicleRecordId,
      fieldId: vehicleModelFieldId,
      value: 'Batmobile Tumbler',
      createdAt: now,
      updatedAt: now,
    }).run();

    db.insert(schema.customObjectsValues).values({
      id: crypto.randomUUID(),
      recordId: vehicleRecordId,
      fieldId: vehiclePlateFieldId,
      value: 'BAT-1',
      createdAt: now,
      updatedAt: now,
    }).run();

    // 7. Seed Bookings, Invoices, InvoiceItems, and Payments
    console.log('Seeding Bookings, Invoices & Payments...');

    // Booking 1: Sarah Connor (Completed, Paid)
    const booking1Id = crypto.randomUUID();
    db.insert(schema.bookings).values({
      id: booking1Id,
      customerId: customersData[0].id,
      serviceId: servicesData[0].id, // Cloud Consultation
      date: '2026-06-10',
      time: '10:00',
      status: 'completed',
      notes: 'Initial evaluation complete. Provided security architecture blueprint.',
      createdAt: now,
      updatedAt: now,
    }).run();

    const invoice1Id = crypto.randomUUID();
    db.insert(schema.invoices).values({
      id: invoice1Id,
      invoiceNumber: 'INV-20260610-0001',
      customerId: customersData[0].id,
      bookingId: booking1Id,
      status: 'paid',
      notes: 'Standard 8.25% sales tax applied.',
      taxRate: 8.25,
      discount: 0,
      createdAt: now,
      updatedAt: now,
    }).run();

    db.insert(schema.invoiceItems).values({
      id: crypto.randomUUID(),
      invoiceId: invoice1Id,
      serviceId: servicesData[0].id,
      name: servicesData[0].name,
      quantity: 1,
      unitPrice: servicesData[0].price,
      taxRate: servicesData[0].taxRate,
      createdAt: now,
    }).run();

    // Paid in full
    db.insert(schema.payments).values({
      id: crypto.randomUUID(),
      invoiceId: invoice1Id,
      amount: Math.round(servicesData[0].price * 1.0825), // price + tax
      paymentMethod: 'bank_transfer',
      paymentDate: '2026-06-11T12:00:00Z',
      notes: 'Wire transfer processed successfully.',
      createdAt: now,
    }).run();

    // Booking 2: Bruce Wayne (Confirmed, Partial Payment)
    const booking2Id = crypto.randomUUID();
    db.insert(schema.bookings).values({
      id: booking2Id,
      customerId: customersData[1].id,
      serviceId: servicesData[2].id, // Database Perf Tuning
      date: '2026-07-02',
      time: '16:00',
      status: 'confirmed',
      notes: 'Database tuning for Wayne Enterprises central mainframes.',
      createdAt: now,
      updatedAt: now,
    }).run();

    const invoice2Id = crypto.randomUUID();
    db.insert(schema.invoices).values({
      id: invoice2Id,
      invoiceNumber: 'INV-20260626-0002',
      customerId: customersData[1].id,
      bookingId: booking2Id,
      status: 'unpaid',
      notes: 'Retainer deposit required ahead of time.',
      taxRate: 8.25,
      discount: 5000, // $50.00 discount (in cents)
      createdAt: now,
      updatedAt: now,
    }).run();

    db.insert(schema.invoiceItems).values({
      id: crypto.randomUUID(),
      invoiceId: invoice2Id,
      serviceId: servicesData[2].id,
      name: servicesData[2].name,
      quantity: 1,
      unitPrice: servicesData[2].price,
      taxRate: servicesData[2].taxRate,
      createdAt: now,
    }).run();

    // Partial payment: $150.00 paid towards invoice total of ($350 - $50) * 1.0825 = $324.75
    db.insert(schema.payments).values({
      id: crypto.randomUUID(),
      invoiceId: invoice2Id,
      amount: 15000, // $150.00
      paymentMethod: 'card',
      paymentDate: '2026-06-26T14:30:00Z',
      notes: 'Amex authorization card ending 1007.',
      createdAt: now,
    }).run();

    // Booking 3: Tony Stark (Pending, Unpaid)
    const booking3Id = crypto.randomUUID();
    db.insert(schema.bookings).values({
      id: booking3Id,
      customerId: customersData[2].id,
      serviceId: servicesData[1].id, // React Development
      date: '2026-07-15',
      time: '11:00',
      status: 'pending',
      notes: 'React web UI work for clean energy project tracking dashboards.',
      createdAt: now,
      updatedAt: now,
    }).run();

    const invoice3Id = crypto.randomUUID();
    db.insert(schema.invoices).values({
      id: invoice3Id,
      invoiceNumber: 'INV-20260626-0003',
      customerId: customersData[2].id,
      bookingId: booking3Id,
      status: 'draft',
      notes: 'Initial estimate of 10 hours of design and frontend implementation.',
      taxRate: 8.25,
      discount: 0,
      createdAt: now,
      updatedAt: now,
    }).run();

    db.insert(schema.invoiceItems).values({
      id: crypto.randomUUID(),
      invoiceId: invoice3Id,
      serviceId: servicesData[1].id,
      name: servicesData[1].name,
      quantity: 10, // 10 hours
      unitPrice: servicesData[1].price,
      taxRate: servicesData[1].taxRate,
      createdAt: now,
    }).run();

    console.log('SQLite database seeded successfully!');
    process.exit(0);
  } catch (error) {
    console.error('Seeding database failed:', error);
    process.exit(1);
  }
}

runSeed();
