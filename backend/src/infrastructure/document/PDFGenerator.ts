import PDFDocument from 'pdfkit';
import { Writable } from 'stream';
import { Invoice, Customer, Settings } from 'shared';

export function generateInvoicePDF(
  invoice: Invoice & { items: any[] },
  customer: Customer,
  settings: Settings,
  writeStream: Writable
): Promise<void> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A4', margin: 50 });

      doc.pipe(writeStream);

      // Extract colors
      const primaryColor = settings.primaryColor || '#1e293b';
      const textColor = '#334155';
      const lightTextColor = '#64748b';

      // 1. Header Section
      let y = 50;

      // Business logo (if base64 data url exists)
      if (settings.logoUrl && settings.logoUrl.startsWith('data:image/')) {
        try {
          const base64Data = settings.logoUrl.split(',')[1];
          const imgBuffer = Buffer.from(base64Data, 'base64');
          doc.image(imgBuffer, 50, y, { width: 60 });
          y += 70;
        } catch (logoErr) {
          console.error('Failed to render logo in PDF:', logoErr);
          y += 20;
        }
      } else {
        // Fallback placeholder text logo
        doc.fillColor(primaryColor)
           .fontSize(18)
           .font('Helvetica-Bold')
           .text(settings.businessName, 50, y);
        y += 40;
      }

      // Title & Metadata
      doc.fillColor(primaryColor)
         .fontSize(22)
         .font('Helvetica-Bold')
         .text('INVOICE', 350, 50, { align: 'right' });

      doc.fillColor(textColor)
         .fontSize(10)
         .font('Helvetica-Bold')
         .text(`Invoice #: ${invoice.invoiceNumber || 'DRAFT'}`, 350, 75, { align: 'right' })
         .font('Helvetica')
         .fillColor(lightTextColor)
         .text(`Date: ${invoice.createdAt ? invoice.createdAt.split('T')[0] : 'Today'}`, 350, 90, { align: 'right' })
         .text(`Status: ${(invoice.status || 'draft').toUpperCase()}`, 350, 105, { align: 'right' });

      // Horizontal separator line
      y = Math.max(y, 130);
      doc.strokeColor('#e2e8f0')
         .lineWidth(1)
         .moveTo(50, y)
         .lineTo(545, y)
         .stroke();
      y += 20;

      // 2. Billing details (2 columns: Bill From & Bill To)
      const colWidth = 240;
      
      // Bill From (Left)
      doc.fillColor(primaryColor)
         .fontSize(10)
         .font('Helvetica-Bold')
         .text('BILL FROM', 50, y);
      
      doc.fillColor(textColor)
         .font('Helvetica')
         .text(settings.businessName, 50, y + 15)
         .fillColor(lightTextColor)
         .text(settings.address || '', 50, y + 30, { width: colWidth })
         .text(`Phone: ${settings.phone || ''}`, 50, y + 60)
         .text(`Email: ${settings.email || ''}`, 50, y + 75);

      // Bill To (Right)
      doc.fillColor(primaryColor)
         .font('Helvetica-Bold')
         .text('BILL TO', 300, y);
      
      doc.fillColor(textColor)
         .font('Helvetica')
         .text(`${customer.firstName} ${customer.lastName}`, 300, y + 15)
         .fillColor(lightTextColor);
      
      let customerAddrY = y + 30;
      if (customer.company) {
        doc.text(customer.company, 300, y + 30);
        customerAddrY += 15;
      }
      doc.text(customer.address || '', 300, customerAddrY, { width: colWidth })
         .text(`Phone: ${customer.phone || customer.mobile || ''}`, 300, customerAddrY + 30)
         .text(`Email: ${customer.email || ''}`, 300, customerAddrY + 45);

      y += 110;

      // 3. Invoice Items Table
      doc.strokeColor('#e2e8f0')
         .moveTo(50, y)
         .lineTo(545, y)
         .stroke();
      y += 10;

      // Table Header
      doc.fillColor(primaryColor)
         .font('Helvetica-Bold')
         .fontSize(9)
         .text('DESCRIPTION', 50, y)
         .text('QTY', 300, y, { width: 30, align: 'right' })
         .text('UNIT PRICE', 350, y, { width: 60, align: 'right' })
         .text('TAX', 430, y, { width: 40, align: 'right' })
         .text('AMOUNT', 485, y, { width: 60, align: 'right' });

      y += 15;
      doc.strokeColor('#cbd5e1')
         .lineWidth(1)
         .moveTo(50, y)
         .lineTo(545, y)
         .stroke();
      y += 10;

      let subtotalCents = 0;
      let totalTaxCents = 0;

      doc.font('Helvetica')
         .fillColor(textColor);

      // Render Items
      for (const item of invoice.items) {
        const itemSubtotal = item.quantity * item.unitPrice;
        const itemTax = Math.round(itemSubtotal * (item.taxRate / 100));
        const itemAmount = itemSubtotal;

        subtotalCents += itemSubtotal;
        totalTaxCents += itemTax;

        // Print row
        doc.text(item.name || 'Catalog service', 50, y, { width: 240 })
           .text(item.quantity.toString(), 300, y, { width: 30, align: 'right' })
           .text(`$${(item.unitPrice / 100).toFixed(2)}`, 350, y, { width: 60, align: 'right' })
           .text(`${item.taxRate}%`, 430, y, { width: 40, align: 'right' })
           .text(`$${(itemAmount / 100).toFixed(2)}`, 485, y, { width: 60, align: 'right' });

        y += 20;
      }

      y += 10;
      doc.strokeColor('#e2e8f0')
         .moveTo(50, y)
         .lineTo(545, y)
         .stroke();
      y += 15;

      // 4. Calculations Summary Block
      const summaryLabelX = 350;
      const summaryValueX = 485;

      const printSummaryRow = (label: string, value: string, isBold = false) => {
        doc.font(isBold ? 'Helvetica-Bold' : 'Helvetica')
           .fillColor(isBold ? primaryColor : textColor)
           .text(label, summaryLabelX, y, { width: 120, align: 'right' })
           .text(value, summaryValueX, y, { width: 60, align: 'right' });
        y += 15;
      };

      printSummaryRow('Subtotal:', `$${(subtotalCents / 100).toFixed(2)}`);
      if (totalTaxCents > 0) {
        printSummaryRow('Total Tax:', `$${(totalTaxCents / 100).toFixed(2)}`);
      }
      if (invoice.discount > 0) {
        printSummaryRow('Discount:', `-$${(invoice.discount / 100).toFixed(2)}`);
      }

      const totalCents = subtotalCents + totalTaxCents - invoice.discount;
      y += 5;
      doc.strokeColor('#cbd5e1')
         .lineWidth(1)
         .moveTo(350, y)
         .lineTo(545, y)
         .stroke();
      y += 10;

      printSummaryRow('Total Due:', `$${(totalCents / 100).toFixed(2)}`, true);

      // 5. Footer Notes
      if (settings.invoiceFooter) {
        doc.fillColor(lightTextColor)
           .font('Helvetica-Oblique')
           .fontSize(8)
           .text(settings.invoiceFooter, 50, 750, { align: 'center', width: 495 });
      }

      doc.end();
      resolve();
    } catch (pdfErr) {
      reject(pdfErr);
    }
  });
}
