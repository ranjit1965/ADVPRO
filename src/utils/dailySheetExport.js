// PDF and Excel copies of the Daily Activity Report (A4 landscape, same columns as the printed sheet).
import { C_TYPE_LEGEND, reportRow } from './entry';

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** JobDate column, as in the old software: 01/Sep/26 */
export const shortDate = (iso) => `${iso.slice(8, 10)}/${MON[Number(iso.slice(5, 7)) - 1]}/${iso.slice(2, 4)}`;
/** Report date: 01/09/2026 */
export const slashDate = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

export const SHEET_COLUMNS = ['JobDate', 'Time From', 'Time To', 'Batch No', 'Paper Name', 'S.No', 'S.Type', 'College Name', 'Dept', 'YOP', 'Topic', 'C.Type', 'Faculty Role'];
export const LEGEND_TEXT = C_TYPE_LEGEND.map(([c, l]) => `${c} - ${l}`).join(', ');

/** "Main", or "Assistance (Main: NAME)" */
export function roleText(r, nameOf = (c) => c) {
  if (!r.role) return '';
  return r.role === 'Assistance' && r.mainFaculty ? `Assistance (Main: ${nameOf(r.mainFaculty)})` : r.role;
}

/** Entries sorted by date and time, as rows of the sheet (24-hour times). */
export function sheetRows(items, courses, nameOf) {
  return [...items]
    .sort((a, b) => (a.activityDate + a.timeFrom).localeCompare(b.activityDate + b.timeFrom))
    .map((e) => {
      const r = reportRow(e, courses);
      return [shortDate(e.activityDate), e.timeFrom, e.timeTo, r.batchNo, r.paper, r.sNo, r.sType, (r.college || '').toUpperCase(), r.dept, r.yop, r.topic, r.cType, roleText(r, nameOf)];
    });
}

const fileName = (meta, ext) => `Daily-Activity-${meta.code}-${meta.dateFrom}${meta.dateTo !== meta.dateFrom ? `-to-${meta.dateTo}` : ''}.${ext}`;
const dateLabel = (meta) => (meta.dateFrom === meta.dateTo ? slashDate(meta.dateFrom) : `${slashDate(meta.dateFrom)} to ${slashDate(meta.dateTo)}`);

function save(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/** meta: { name, code, dateFrom, dateTo, totalText } */
export async function downloadPdf(meta, rows) {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();
  const header = (pageNo) => {
    doc.setFont('helvetica', 'bold').setFontSize(15).text('ADVANTAGE PRO', 10, 13);
    doc.setFont('helvetica', 'normal').setFontSize(10).text(`${meta.name} (${meta.code}) Daily Activity Report`, 10, 19);
    doc.text(`Page No. ${pageNo}`, 10, 25);
    doc.text(`Date  ${dateLabel(meta)}`, W - 10, 19, { align: 'right' });
  };
  autoTable(doc, {
    head: [SHEET_COLUMNS],
    body: rows,
    startY: 28,
    margin: { top: 28, left: 10, right: 10, bottom: 12 },
    theme: 'grid',
    styles: { font: 'helvetica', fontSize: 8, cellPadding: 1.2, textColor: 20, lineColor: 120, lineWidth: 0.2, valign: 'top' },
    headStyles: { fillColor: [255, 255, 255], textColor: 20, fontStyle: 'bold' },
    columnStyles: { 0: { cellWidth: 17 }, 1: { cellWidth: 13 }, 2: { cellWidth: 13 }, 4: { cellWidth: 30 }, 5: { cellWidth: 10, halign: 'center' }, 6: { cellWidth: 13, halign: 'center' }, 7: { cellWidth: 30 }, 10: { cellWidth: 60 }, 11: { cellWidth: 12, halign: 'center' } },
    didDrawPage: (d) => header(d.pageNumber),
  });
  let y = doc.lastAutoTable.finalY + 6;
  if (y > doc.internal.pageSize.getHeight() - 15) {
    doc.addPage();
    header(doc.getNumberOfPages());
    y = 32;
  }
  doc.setFontSize(8.5).text(doc.splitTextToSize(LEGEND_TEXT, W - 20), 10, y);
  if (meta.totalText) doc.text(meta.totalText, W - 10, y + 8, { align: 'right' });
  save(doc.output('blob'), fileName(meta, 'pdf'));
}

export async function downloadExcel(meta, rows) {
  const { default: ExcelJS } = await import('exceljs');
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Daily Activity', {
    pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: 0.3, right: 0.3, top: 0.4, bottom: 0.4, header: 0.2, footer: 0.2 } },
    headerFooter: { oddFooter: 'Page No. &P' },
  });
  ws.columns = [11, 9, 9, 12, 24, 6, 7, 24, 10, 7, 48, 7, 20].map((width) => ({ width }));
  ws.addRow(['ADVANTAGE PRO']).font = { bold: true, size: 15 };
  const sub = ws.addRow([`${meta.name} (${meta.code}) Daily Activity Report`]);
  sub.getCell(11).value = `Date  ${dateLabel(meta)}`;
  ws.addRow([]);
  const head = ws.addRow(SHEET_COLUMNS);
  head.font = { bold: true };
  const border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
  const headAt = head.number;
  rows.forEach((r) => ws.addRow(r));
  for (let i = headAt; i <= ws.rowCount; i += 1) {
    ws.getRow(i).eachCell({ includeEmpty: true }, (c, col) => {
      if (col > SHEET_COLUMNS.length) return;
      c.border = border;
      c.alignment = { vertical: 'top', wrapText: true, horizontal: [6, 7, 12].includes(col) ? 'center' : 'left' };
    });
  }
  ws.views = [{ state: 'frozen', ySplit: headAt }];
  ws.pageSetup.printTitlesRow = `${headAt}:${headAt}`;
  ws.addRow([]);
  const legend = ws.addRow([LEGEND_TEXT]);
  ws.mergeCells(legend.number, 1, legend.number, SHEET_COLUMNS.length);
  legend.getCell(1).alignment = { wrapText: true };
  legend.height = 30;
  if (meta.totalText) ws.addRow([meta.totalText]);
  const buf = await wb.xlsx.writeBuffer();
  save(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), fileName(meta, 'xlsx'));
}
