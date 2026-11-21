import { effectiveMark, monthTitle } from '../components/attendance/AttendanceSheet';

const FILL = { S: 'FFFFFFFF', 'S(L)': 'FFFEF3C7', '#': 'FFFEE2E2', X: 'FFFEE2E2', H: 'FFDCFCE7', W: 'FFF1F5F9', P: 'FFE0E7FF', C: 'FFE0E7FF' };

/**
 * v59: Daily Entry Submission as an Excel file: EMPLOYEE NAME, ROLE, days 1 … 31 and a count of each code,
 * the marks as shown on screen (saved by hand, else automatic). Holiday columns are green.
 */
export async function downloadAttendanceExcel({ month, days, employees, codes, marks, auto, holidays, roleLabel }) {
  const { default: ExcelJS } = await import('exceljs');
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Daily Entry Submission', { pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 } });
  const dayList = Array.from({ length: days }, (_, i) => i + 1);
  const counted = codes.map((c) => c.code);
  ws.columns = [{ width: 28 }, { width: 12 }, ...dayList.map(() => ({ width: 5 })), ...counted.map(() => ({ width: 6 }))];
  ws.addRow([`DAILY ENTRY SUBMISSION - ${monthTitle(month)}`]).font = { bold: true, size: 14 };
  ws.addRow([codes.map((c) => `${c.code} - ${c.label}`).join('  /  ')]).font = { size: 9 };
  ws.addRow([]);
  const head = ws.addRow(['EMPLOYEE NAME', 'ROLE', ...dayList, ...counted]);
  head.font = { bold: true };
  const border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
  for (const p of employees) {
    const row = dayList.map((d) => effectiveMark(marks, auto, p.code, d));
    ws.addRow([p.name, roleLabel(p.role), ...row, ...counted.map((c) => row.filter((v) => v === c).length)]);
  }
  for (let i = head.number; i <= ws.rowCount; i += 1) {
    ws.getRow(i).eachCell({ includeEmpty: true }, (cell, col) => {
      cell.border = border;
      if (col > 2) cell.alignment = { horizontal: 'center' };
      const day = col - 2;
      const v = cell.value;
      if (i > head.number && day >= 1 && day <= days && FILL[v]) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: FILL[v] } };
      if (day >= 1 && day <= days && holidays.has(day) && (i === head.number || !v)) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDCFCE7' } };
    });
  }
  ws.views = [{ state: 'frozen', xSplit: 1, ySplit: head.number }];
  const buf = await wb.xlsx.writeBuffer();
  const url = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `Daily Entry Submission ${month}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}
