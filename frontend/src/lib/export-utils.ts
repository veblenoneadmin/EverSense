// Shared CSV + PDF export utilities for reports and time logs
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

// ── CSV Export ───────────────────────────────────────────────────────────────

/** Download an array of rows as a CSV file. First row = headers. */
export function exportCSV(rows: string[][], filename: string) {
  const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' }); // BOM for Excel
  downloadBlob(blob, filename.endsWith('.csv') ? filename : `${filename}.csv`);
}

// ── PDF Export ───────────────────────────────────────────────────────────────

interface PDFOptions {
  title: string;
  subtitle?: string;
  filename: string;
  headers: string[];
  rows: string[][];
  /** Optional summary cards shown above the table */
  summaryCards?: { label: string; value: string }[];
  orientation?: 'portrait' | 'landscape';
}

export function exportPDF(opts: PDFOptions) {
  const {
    title, subtitle, filename, headers, rows, summaryCards,
    orientation = rows[0]?.length > 6 ? 'landscape' : 'portrait',
  } = opts;

  const doc = new jsPDF({ orientation, unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  let y = 15;

  // Title
  doc.setFontSize(18);
  doc.setTextColor(40, 40, 40);
  doc.text(title, 14, y);
  y += 7;

  // Subtitle / date
  doc.setFontSize(10);
  doc.setTextColor(120, 120, 120);
  doc.text(subtitle || `Generated on ${new Date().toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' })}`, 14, y);
  y += 4;

  // Thin accent line
  doc.setDrawColor(0, 122, 204);
  doc.setLineWidth(0.5);
  doc.line(14, y, pageWidth - 14, y);
  y += 8;

  // Summary cards (optional)
  if (summaryCards && summaryCards.length > 0) {
    const cardWidth = Math.min(40, (pageWidth - 28 - (summaryCards.length - 1) * 4) / summaryCards.length);
    const startX = 14;
    summaryCards.forEach((card, i) => {
      const cx = startX + i * (cardWidth + 4);
      doc.setFillColor(245, 245, 250);
      doc.roundedRect(cx, y, cardWidth, 16, 2, 2, 'F');
      doc.setFontSize(7);
      doc.setTextColor(120, 120, 120);
      doc.text(card.label.toUpperCase(), cx + cardWidth / 2, y + 5, { align: 'center' });
      doc.setFontSize(12);
      doc.setTextColor(40, 40, 40);
      doc.text(card.value, cx + cardWidth / 2, y + 13, { align: 'center' });
    });
    y += 22;
  }

  // Table
  autoTable(doc, {
    startY: y,
    head: [headers],
    body: rows,
    theme: 'grid',
    styles: {
      fontSize: 8,
      cellPadding: 3,
      textColor: [50, 50, 50],
      lineColor: [220, 220, 220],
      lineWidth: 0.25,
    },
    headStyles: {
      fillColor: [0, 122, 204],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 8,
    },
    alternateRowStyles: {
      fillColor: [248, 249, 252],
    },
    margin: { left: 14, right: 14 },
    didDrawPage: () => {
      // Footer
      doc.setFontSize(7);
      doc.setTextColor(160, 160, 160);
      doc.text(
        `Page ${doc.getNumberOfPages()} - EverSense`,
        pageWidth / 2, doc.internal.pageSize.getHeight() - 8,
        { align: 'center' }
      );
    },
  });

  doc.save(filename.endsWith('.pdf') ? filename : `${filename}.pdf`);
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
