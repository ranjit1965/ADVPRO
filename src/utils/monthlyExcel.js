// Excel download of the monthly report: one sheet per section of the on-screen report.
import { ACTIVITY_LABEL } from './constants';
import { entrySummary } from './entry';
import { REPORT_GROUPS, hm, hmm, hours1, signedHm, topicOf } from './monthlyReport';

const NAVY = 'FF0F2A4D';
const HEAD = 'FFDFE9F8';
const FOOT = 'FFEEF3FB';
const head = (row) => {
  row.eachCell((c) => {
    c.font = { bold: true, color: { argb: NAVY } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEAD } };
    c.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  });
  row.height = 28;
};
const foot = (row) => row.eachCell((c) => {
  c.font = { bold: true, color: { argb: NAVY } };
  c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: FOOT } };
});

function sheet(wb, name, title, note, columns) {
  const ws = wb.addWorksheet(name, { views: [{ state: 'frozen', ySplit: 3 }] });
  ws.columns = columns.map((c) => ({ key: c.key, width: c.width || 12 }));
  ws.getCell('A1').value = title;
  ws.getCell('A1').font = { bold: true, size: 14, color: { argb: NAVY } };
  ws.getCell('A2').value = note;
  ws.getCell('A2').font = { italic: true, size: 9, color: { argb: 'FF6B7280' } };
  head(ws.addRow(columns.map((c) => c.header)));
  return ws;
}

export async function downloadMonthlyExcel(report, faculty, courses, biometric) {
  const { default: ExcelJS } = await import('exceljs');
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Daily Entry Report';
  const { kpi, days, weeks, groups, topics, log } = report;
  const g = (k) => groups.find((x) => x.key === k).minutes;

  // Dashboard
  const d = wb.addWorksheet('Dashboard');
  d.columns = [{ width: 30 }, { width: 16 }, { width: 14 }, { width: 12 }, { width: 10 }];
  d.addRow([`${report.monthName} · Activity Report`]).font = { bold: true, size: 16, color: { argb: NAVY } };
  d.addRow([`${faculty?.name ?? ''} (${faculty?.code ?? ''}) · Advantage Pro`]);
  d.addRow([]);
  [
    ['Total working time', hm(kpi.total)],
    ['Working days', `${kpi.workingDays} of ${kpi.calendarDays}`],
    ['Average day', hm(kpi.averageDay)],
    ['Longest day', kpi.longest ? `${hm(kpi.longest.minutes)} (${kpi.longest.dayName} ${kpi.longest.day})` : '-'],
    ['Class and seminar', hm(kpi.classSeminar)],
    ['Preparation / learning', hm(kpi.preparation)],
    ['Others (counted separately)', hm(kpi.others)],
    ['Sessions delivered', `${kpi.sessions} (${kpi.classes} classes, ${kpi.seminars} seminars)`],
  ].forEach((r) => (d.addRow(r).getCell(1).font = { bold: true }));
  d.addRow([]);
  head(d.addRow(['Activity type', 'Hours', 'h:mm', 'Share', 'Days']));
  groups.forEach((x) => d.addRow([x.label, hours1(x.minutes), hmm(x.minutes), +(x.share * 100).toFixed(1), x.days]));
  foot(d.addRow(['All types', hours1(kpi.total), hm(kpi.total), 100, kpi.workingDays]));

  // Daily
  const daily = sheet(wb, 'Daily', 'Daily summary', 'Hours per calendar day by activity type. Others has its own column.', [
    { key: 'date', header: 'Date', width: 13 }, { key: 'day', header: 'Day', width: 6 }, { key: 'week', header: 'Week', width: 6 },
    ...REPORT_GROUPS.map((x) => ({ key: x.key, header: x.label, width: 12 })),
    { key: 'total', header: 'Total (hours)', width: 12 }, { key: 'hmm', header: 'Total (h:mm)', width: 11 },
    { key: 'first', header: 'Start', width: 8 }, { key: 'last', header: 'End', width: 8 }, { key: 'what', header: 'What happened', width: 80 },
  ]);
  days.forEach((x) => {
    const r = daily.addRow({ date: x.date, day: x.dayName, week: x.week, ...Object.fromEntries(REPORT_GROUPS.map((k) => [k.key, x.byGroup[k.key] ? hours1(x.byGroup[k.key]) : null])), total: x.minutes ? hours1(x.minutes) : null, hmm: x.minutes ? hmm(x.minutes) : '', first: x.first, last: x.last, what: x.entries.map((e) => `${ACTIVITY_LABEL[e.activityType]}: ${entrySummary(e)}`).join('; ') || (x.dow === 0 ? 'Sunday' : 'No entry') });
    r.getCell('what').alignment = { wrapText: true, vertical: 'top' };
  });
  foot(daily.addRow({ date: 'Month total', ...Object.fromEntries(REPORT_GROUPS.map((k) => [k.key, hours1(g(k.key))])), total: hours1(kpi.total), hmm: hm(kpi.total) }));

  // Weekly
  const wk = sheet(wb, 'Weekly', 'Weekly summary', 'Weeks run Monday to Sunday and are cut at the month ends.', [
    { key: 'week', header: 'Week', width: 8 }, { key: 'dates', header: 'Dates', width: 10 }, { key: 'days', header: 'Days', width: 6 },
    ...REPORT_GROUPS.map((x) => ({ key: x.key, header: x.label, width: 12 })),
    { key: 'total', header: 'Total (hours)', width: 12 }, { key: 'hmm', header: 'Total (h:mm)', width: 11 }, { key: 'per', header: 'Per day', width: 9 },
  ]);
  weeks.forEach((w) => wk.addRow({ week: w.label, dates: `${w.from}-${w.to}`, days: w.days, ...Object.fromEntries(REPORT_GROUPS.map((k) => [k.key, w.byGroup[k.key] ? hours1(w.byGroup[k.key]) : null])), total: hours1(w.minutes), hmm: hmm(w.minutes), per: w.days ? hmm(Math.round(w.minutes / w.days)) : '' }));
  foot(wk.addRow({ week: 'Month', days: kpi.workingDays, ...Object.fromEntries(REPORT_GROUPS.map((k) => [k.key, hours1(g(k.key))])), total: hours1(kpi.total), hmm: hm(kpi.total), per: hmm(kpi.averageDay) }));

  // Topics
  const tp = sheet(wb, 'Topics', 'Where the time went', 'Every entry grouped by what it was about, split by activity type.', [
    { key: 'topic', header: 'Topic', width: 40 }, { key: 'entries', header: 'Entries', width: 8 }, { key: 'hours', header: 'Hours', width: 9 }, { key: 'share', header: 'Share %', width: 9 },
    ...REPORT_GROUPS.map((x) => ({ key: x.key, header: x.label, width: 12 })), { key: 'notes', header: 'What it covers', width: 70 },
  ]);
  topics.forEach((t) => tp.addRow({ topic: t.topic, entries: t.entries, hours: hours1(t.minutes), share: +(t.share * 100).toFixed(1), ...Object.fromEntries(REPORT_GROUPS.map((k) => [k.key, t.byGroup[k.key] ? hours1(t.byGroup[k.key]) : null])), notes: t.notes }));
  foot(tp.addRow({ topic: 'Month', entries: kpi.entries, hours: hours1(kpi.total), share: 100 }));

  // Calendar
  const cal = wb.addWorksheet('Calendar');
  cal.columns = [{ width: 9 }, ...Array(7).fill({ width: 13 }), { width: 12 }];
  cal.addRow([`Calendar view · ${report.monthName}`]).font = { bold: true, size: 14, color: { argb: NAVY } };
  head(cal.addRow(['Week', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun', 'Week total']));
  const maxDay = Math.max(1, ...days.map((x) => x.minutes));
  weeks.forEach((w) => {
    const vals = Array(7).fill('');
    const shades = Array(7).fill(null);
    days.filter((x) => x.week === w.week).forEach((x) => {
      const col = (x.dow + 6) % 7;
      vals[col] = `${x.day}\n${x.minutes ? hmm(x.minutes) : '-'}${x.minutes ? `\n${x.first}-${x.last}` : ''}`;
      shades[col] = x.minutes ? x.minutes / maxDay : 0;
    });
    const r = cal.addRow([w.label, ...vals, hm(w.minutes)]);
    r.height = 48;
    r.eachCell((c, i) => {
      c.alignment = { wrapText: true, vertical: 'middle', horizontal: 'center' };
      const s = shades[i - 2];
      if (s) {
        const v = Math.round(255 - 140 * s).toString(16).padStart(2, '0');
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${v}${Math.round(255 - 90 * s).toString(16).padStart(2, '0')}FF` } };
      }
    });
  });

  // Log
  const lg = sheet(wb, 'Log', 'Activity log', `All ${log.length} entries of the month.`, [
    { key: 'date', header: 'Date', width: 12 }, { key: 'start', header: 'Start', width: 7 }, { key: 'end', header: 'End', width: 7 }, { key: 'minutes', header: 'Minutes', width: 8 }, { key: 'hours', header: 'Hours', width: 7 },
    { key: 'type', header: 'Type', width: 22 }, { key: 'topic', header: 'Topic', width: 36 }, { key: 'in', header: 'Faculty in', width: 11 }, { key: 'details', header: 'Details', width: 70 },
  ]);
  log.forEach((e) => lg.addRow({ date: e.activityDate, start: e.timeFrom, end: e.timeTo, minutes: e.minutes, hours: +(e.minutes / 60).toFixed(2), type: ACTIVITY_LABEL[e.activityType], topic: topicOf(e, courses), in: e.facultyIn, details: entrySummary(e) }));

  // Biometric Time In / Out vs entries
  if (biometric?.hasData) {
    const bs = sheet(wb, 'Biometric', 'Biometric time in / out vs entries', `Differences up to ${biometric.toleranceMinutes} minutes count as matched.`, [
      { key: 'date', header: 'Date', width: 12 }, { key: 'bioIn', header: 'Bio In', width: 8 }, { key: 'start', header: 'Entries start', width: 10 }, { key: 'inDiff', header: 'In diff', width: 9 },
      { key: 'bioOut', header: 'Bio Out', width: 8 }, { key: 'end', header: 'Entries end', width: 10 }, { key: 'outDiff', header: 'Out diff', width: 9 },
      { key: 'bioHrs', header: 'Bio hrs', width: 8 }, { key: 'entHrs', header: 'Entered hrs', width: 10 }, { key: 'hrsDiff', header: 'Hours diff', width: 10 }, { key: 'status', header: 'Status', width: 18 },
    ]);
    biometric.rows.forEach((r) => bs.addRow({
      date: r.date, bioIn: r.timeIn || '-', start: r.entryStart || '-', inDiff: signedHm(r.inDiff), bioOut: r.timeOut || '-', end: r.entryEnd || '-', outDiff: signedHm(r.outDiff),
      bioHrs: r.bioMinutes === null ? '-' : hmm(r.bioMinutes), entHrs: r.enteredMinutes ? hmm(r.enteredMinutes) : '-', hrsDiff: signedHm(r.hoursDiff), status: r.status,
    }));
    const s = biometric.summary;
    foot(bs.addRow({ date: 'Total', bioHrs: hmm(s.bioMinutes), entHrs: hmm(s.enteredMinutes), hrsDiff: signedHm(s.bioMinutes - s.enteredMinutes), status: `${s.matched} matched · ${s.different} different` }));
  }

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${report.monthName} Activity Report - ${faculty?.name ?? ''}.xlsx`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
