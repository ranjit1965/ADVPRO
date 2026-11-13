import { Bar, BarChart, CartesianGrid, Cell, LabelList, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ACTIVITY_LABEL, facultyInLabel } from '../../utils/constants';
import { entrySummary } from '../../utils/entry';
import { REPORT_GROUPS, dateLabel, hm, hmm, hours1, pct, signedHm, topicOf } from '../../utils/monthlyReport';
import { cn } from '../../utils/cn';

const NAVY = '#0f2a4d';
const HEAD = '#dfe9f8';
const FOOT = '#eef3fb';
const tick = { fontSize: 11, fill: '#5b6478' };

function Section({ no, title, note, children, className, breakBefore }) {
  return (
    <section className={cn('report-section', breakBefore && 'report-break', className)}>
      <h2 className="border-b-2 pb-1 text-[15px] font-bold" style={{ color: NAVY, borderColor: NAVY }}>
        {no && <span className="mr-2">{no}</span>}
        {title}
      </h2>
      {note && <p className="mt-1 text-xs text-ink-500 italic">{note}</p>}
      <div className="mt-3">{children}</div>
    </section>
  );
}

function Kpi({ label, value, sub, color }) {
  return (
    <div className="border-t-4 bg-[#f3f5f9] px-3 py-3" style={{ borderColor: color || NAVY }}>
      <p className="text-[10px] font-semibold tracking-wide text-ink-500 uppercase">{label}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums" style={{ color: NAVY }}>{value}</p>
      {sub && <p className="mt-1 text-[11px] text-ink-500">{sub}</p>}
    </div>
  );
}

const Th = ({ children, className }) => <th className={cn('px-2 py-2 text-[11px] font-semibold whitespace-nowrap text-[#0f2a4d]', className)}>{children}</th>;
const Td = ({ children, className }) => <td className={cn('px-2 py-1.5 tabular-nums', className)}>{children}</td>;
const dash = (min) => (min ? hours1(min).toFixed(2) : '-');

function ChartBox({ title, height = 300, children }) {
  return (
    <div className="chart-box rounded border border-ink-200 p-3">
      <p className="mb-2 text-center text-sm font-bold" style={{ color: NAVY }}>{title}</p>
      <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">{children}</ResponsiveContainer>
      </div>
    </div>
  );
}

const legendProps = { iconType: 'square', iconSize: 9, wrapperStyle: { fontSize: 11 } };
const tooltipProps = { formatter: (v, n) => [`${v} h`, n], contentStyle: { fontSize: 12 } };

/** The monthly report, laid out like the September activity report sample. Printable (A4 landscape). */
export default function MonthlyReportView({ report, faculty, courses, biometric }) {
  const { kpi, days, weeks, groups, topics, log } = report;
  const used = groups.filter((g) => g.minutes > 0);
  const series = used.length ? used : groups.slice(0, 1);
  const dayData = days.map((d) => ({ label: d.label, total: d.minutes ? hours1(d.minutes) : null, ...Object.fromEntries(REPORT_GROUPS.map((g) => [g.key, hours1(d.byGroup[g.key])])) }));
  const weekData = weeks.map((w) => ({ label: `${w.label} · ${hm(w.minutes)}`, ...Object.fromEntries(REPORT_GROUPS.map((g) => [g.key, hours1(w.byGroup[g.key])])) }));
  const topicData = topics.slice(0, 10).map((t) => ({ topic: t.topic, ...Object.fromEntries(REPORT_GROUPS.map((g) => [g.key, hours1(t.byGroup[g.key])])) }));
  const maxDay = Math.max(1, ...days.map((d) => d.minutes));
  const lastIdx = (row) => [...series].reverse().find((g) => row[g.key] > 0)?.key;

  // Calendar grid: Monday-first rows.
  const lead = (days[0].dow + 6) % 7;
  const cells = [...Array(lead).fill(null), ...days];
  while (cells.length % 7) cells.push(null);
  const calRows = [];
  for (let i = 0; i < cells.length; i += 7) calRows.push(cells.slice(i, i + 7));

  return (
    <div id="monthly-report" className="report space-y-8 bg-white p-4 text-[12px] text-ink-800 sm:p-6">
      <header className="flex flex-wrap items-end justify-between gap-4 border-l-4 border-brand-500 px-5 py-4" style={{ background: HEAD, color: NAVY }}>
        <div>
          <h1 className="text-2xl font-bold">{report.monthName} · Activity Report</h1>
          <p className="mt-1 text-sm">{faculty ? `${faculty.name} (${faculty.code})` : ''} · Advantage Pro</p>
          <p className="mt-1 text-[11px] text-ink-600">Built from the {kpi.entries} entries of the daily activity report for {report.monthName}. Others is shown in its own column.</p>
        </div>
        <div className="text-right">
          <p className="text-[10px] font-semibold tracking-widest text-ink-600 uppercase">Total working time</p>
          <p className="text-4xl font-bold tabular-nums">{hm(kpi.total)}</p>
        </div>
      </header>

      <div className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-7">
        <Kpi label="Working days" value={kpi.workingDays} sub={`of ${kpi.calendarDays} calendar days`} color={NAVY} />
        <Kpi label="Average day" value={hm(kpi.averageDay)} sub="per working day" color={NAVY} />
        <Kpi label="Longest day" value={kpi.longest ? hm(kpi.longest.minutes) : '-'} sub={kpi.longest ? `${kpi.longest.dayName} ${kpi.longest.day}` : ''} color={NAVY} />
        <Kpi label="Performance time" value={hm(kpi.performance)} sub={`${pct(kpi.total ? kpi.performance / kpi.total : 0)}, all except Others`} color="#1f9d55" />
        <Kpi label="Class and seminar" value={hm(kpi.classSeminar)} sub={`${pct(kpi.total ? kpi.classSeminar / kpi.total : 0)} of logged time`} color="#2b78d6" />
        <Kpi label="Preparation / learning" value={hm(kpi.preparation)} sub={`${pct(kpi.total ? kpi.preparation / kpi.total : 0)} of logged time`} color="#e9a20a" />
        <Kpi label="Others" value={hm(kpi.others)} sub={`${pct(kpi.total ? kpi.others / kpi.total : 0)}, counted separately`} color="#8a93a6" />
      </div>

      <Section no="1" title="Day by day" note="Each column is one calendar day, stacked by activity type, with the day's total above it. Days without a column had nothing logged.">
        <ChartBox title="Working hours per day" height={320}>
          <BarChart data={dayData} margin={{ top: 18, right: 8, left: -14, bottom: 4 }}>
            <CartesianGrid stroke="#e6e9ef" vertical={false} />
            <XAxis dataKey="label" tick={{ ...tick, fontSize: 10 }} angle={-90} textAnchor="end" height={50} interval={0} />
            <YAxis tick={tick} />
            <Tooltip {...tooltipProps} />
            <Legend {...legendProps} />
            {series.map((g) => (
              <Bar key={g.key} dataKey={g.key} name={g.label} stackId="a" fill={g.color} isAnimationActive={false}>
                <LabelList dataKey="total" position="top" content={({ x, y, width, value, index }) => (lastIdx(dayData[index]) === g.key && value ? <text x={x + width / 2} y={y - 4} textAnchor="middle" fontSize={10} fontWeight={700} fill={NAVY}>{value.toFixed(1)}</text> : null)} />
              </Bar>
            ))}
          </BarChart>
        </ChartBox>
      </Section>

      <div className="print-2col grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Section no="2" title="Time by activity type" note="Share of the month's working time. Others is listed separately and is not part of activity performance.">
          <ChartBox title="Share of working time by type" height={260}>
            <PieChart>
              <Pie data={used} dataKey="minutes" nameKey="label" innerRadius="45%" outerRadius="80%" isAnimationActive={false} label={({ share }) => (share >= 0.04 ? `${Math.round(share * 100)}%` : '')} labelLine={false}>
                {used.map((g) => <Cell key={g.key} fill={g.color} />)}
              </Pie>
              <Legend {...legendProps} layout="vertical" align="right" verticalAlign="middle" />
              <Tooltip formatter={(v, n) => [hm(v), n]} contentStyle={{ fontSize: 12 }} />
            </PieChart>
          </ChartBox>
        </Section>
        <Section no="3" title="Week by week" note="Weeks run Monday to Sunday, cut at the month ends. The label under each bar is the week's total.">
          <ChartBox title="Hours per week" height={260}>
            <BarChart data={weekData} margin={{ top: 8, right: 8, left: -14, bottom: 4 }}>
              <CartesianGrid stroke="#e6e9ef" vertical={false} />
              <XAxis dataKey="label" tick={{ ...tick, fontSize: 10 }} interval={0} />
              <YAxis tick={tick} />
              <Tooltip {...tooltipProps} />
              <Legend {...legendProps} />
              {series.map((g) => <Bar key={g.key} dataKey={g.key} name={g.label} stackId="w" fill={g.color} isAnimationActive={false} />)}
            </BarChart>
          </ChartBox>
        </Section>
      </div>

      <div className="print-2col grid grid-cols-1 gap-6 xl:grid-cols-2">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead style={{ background: HEAD }}><tr><Th className="text-left">Activity type</Th><Th className="text-right">Hours</Th><Th className="text-right">h:mm</Th><Th className="text-right">Share</Th><Th className="text-right">Days</Th></tr></thead>
            <tbody>
              {groups.map((g) => (
                <tr key={g.key} className="border-b border-ink-100">
                  <Td className="font-semibold"><span className="mr-2 inline-block size-2.5 rounded-sm align-middle" style={{ background: g.color }} />{g.label}</Td>
                  <Td className="text-right">{g.minutes ? hours1(g.minutes).toFixed(1) : '-'}</Td>
                  <Td className="text-right">{g.minutes ? hmm(g.minutes) : '-'}</Td>
                  <Td className="text-right">{pct(g.share)}</Td>
                  <Td className="text-right">{g.days}</Td>
                </tr>
              ))}
            </tbody>
            <tfoot style={{ background: FOOT, color: NAVY }} className="font-bold"><tr><Td>All types</Td><Td className="text-right">{hours1(kpi.total).toFixed(1)}</Td><Td className="text-right">{hm(kpi.total)}</Td><Td className="text-right">100.0%</Td><Td className="text-right">{kpi.workingDays}</Td></tr></tfoot>
          </table>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead style={{ background: HEAD }}><tr><Th className="text-left">Week</Th><Th className="text-left">Dates</Th><Th className="text-right">Days</Th><Th className="text-right">Hours</Th><Th className="text-right">h:mm</Th><Th className="text-right">Per day</Th></tr></thead>
            <tbody>
              {weeks.map((w) => (
                <tr key={w.week} className="border-b border-ink-100">
                  <Td className="font-semibold">{w.label}</Td>
                  <Td>{`${w.from}-${w.to} ${report.monthName.split(' ')[0].slice(0, 3)}`}</Td>
                  <Td className="text-right">{w.days}</Td>
                  <Td className="text-right">{hours1(w.minutes).toFixed(1)}</Td>
                  <Td className="text-right">{hmm(w.minutes)}</Td>
                  <Td className="text-right">{w.days ? hmm(Math.round(w.minutes / w.days)) : '-'}</Td>
                </tr>
              ))}
            </tbody>
            <tfoot style={{ background: FOOT, color: NAVY }} className="font-bold"><tr><Td>Month</Td><Td /><Td className="text-right">{kpi.workingDays}</Td><Td className="text-right">{hours1(kpi.total).toFixed(1)}</Td><Td className="text-right">{hm(kpi.total)}</Td><Td className="text-right">{hmm(kpi.averageDay)}</Td></tr></tfoot>
          </table>
        </div>
      </div>

      <Section no="4" title="Where the time went" note="Every entry grouped by what it was about (course, seminar, marketing type, Others heading), split by activity type." breakBefore>
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[3fr_2fr]">
          <ChartBox title="Hours by topic, split by activity type" height={Math.max(220, topicData.length * 36 + 60)}>
            <BarChart data={topicData} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 4 }}>
              <CartesianGrid stroke="#e6e9ef" horizontal={false} />
              <XAxis type="number" tick={tick} />
              <YAxis type="category" dataKey="topic" width={190} tick={{ ...tick, fontSize: 10 }} />
              <Tooltip {...tooltipProps} />
              <Legend {...legendProps} />
              {series.map((g) => <Bar key={g.key} dataKey={g.key} name={g.label} stackId="t" fill={g.color} isAnimationActive={false} />)}
            </BarChart>
          </ChartBox>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead style={{ background: HEAD }}><tr><Th className="text-left">Topic</Th><Th className="text-right">Entries</Th><Th className="text-right">Hours</Th><Th className="text-right">Share</Th></tr></thead>
              <tbody>
                {topics.map((t) => (
                  <tr key={t.topic} className="border-b border-ink-100">
                    <Td className="font-semibold">{t.topic}</Td>
                    <Td className="text-right">{t.entries}</Td>
                    <Td className="text-right" ><span className="inline-block px-1" style={{ background: `linear-gradient(90deg, #b9d3f5 ${Math.round(t.share * 100)}%, transparent 0)` }}>{hours1(t.minutes).toFixed(1)}</span></Td>
                    <Td className="text-right">{pct(t.share)}</Td>
                  </tr>
                ))}
              </tbody>
              <tfoot style={{ background: FOOT, color: NAVY }} className="font-bold"><tr><Td>Month</Td><Td className="text-right">{kpi.entries}</Td><Td className="text-right">{hours1(kpi.total).toFixed(1)}</Td><Td className="text-right">100.0%</Td></tr></tfoot>
            </table>
          </div>
        </div>
      </Section>

      <Section title="Daily summary" note="Hours per calendar day by activity type, with the first start and last finish of the day. Others has its own column." breakBefore>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[960px] border-collapse text-[11px]">
            <thead style={{ background: HEAD }}>
              <tr>
                <Th className="text-left">Date</Th><Th className="text-left">Day</Th><Th>Week</Th>
                {REPORT_GROUPS.map((g) => <Th key={g.key} className="text-right">{g.label}</Th>)}
                <Th className="text-right">Total (hours)</Th><Th className="text-right">Total (h:mm)</Th><Th>Start</Th><Th>End</Th><Th className="text-left">What happened</Th>
              </tr>
            </thead>
            <tbody>
              {days.map((d) => (
                <tr key={d.date} className={cn('border-b border-ink-100 align-top', d.dow === 0 && 'bg-ink-50')}>
                  <Td className="whitespace-nowrap">{dateLabel(d.date)}</Td>
                  <Td>{d.dayName}</Td>
                  <Td className="text-center">{d.week}</Td>
                  {REPORT_GROUPS.map((g) => <Td key={g.key} className="text-right">{dash(d.byGroup[g.key])}</Td>)}
                  <Td className="text-right font-bold"><span className="inline-block px-1" style={d.minutes ? { background: `linear-gradient(90deg, #b9d3f5 ${Math.round((d.minutes / maxDay) * 100)}%, transparent 0)` } : undefined}>{dash(d.minutes)}</span></Td>
                  <Td className="text-right">{d.minutes ? hmm(d.minutes) : '-'}</Td>
                  <Td className="text-center">{d.first || '-'}</Td>
                  <Td className="text-center">{d.last || '-'}</Td>
                  <Td className="what min-w-[260px] max-w-[420px] text-ink-600">{d.entries.length ? d.entries.map((e) => `${ACTIVITY_LABEL[e.activityType]}: ${entrySummary(e)}`).join('; ') : <span className="text-ink-400">{d.dow === 0 ? 'Sunday' : d.future ? '' : 'No entry'}</span>}</Td>
                </tr>
              ))}
            </tbody>
            <tfoot style={{ background: FOOT, color: NAVY }} className="font-bold">
              <tr>
                <Td>Month total</Td><Td /><Td />
                {REPORT_GROUPS.map((g) => <Td key={g.key} className="text-right">{dash(groups.find((x) => x.key === g.key).minutes)}</Td>)}
                <Td className="text-right">{dash(kpi.total)}</Td><Td className="text-right">{hm(kpi.total)}</Td><Td /><Td /><Td>{kpi.workingDays} working days of {kpi.calendarDays}</Td>
              </tr>
            </tfoot>
          </table>
        </div>
      </Section>

      <Section title="Weekly summary" note="Weeks run Monday to Sunday and are cut at the month ends.">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[800px] border-collapse">
            <thead style={{ background: HEAD }}>
              <tr><Th>Week</Th><Th className="text-left">Dates</Th><Th className="text-right">Days</Th>{REPORT_GROUPS.map((g) => <Th key={g.key} className="text-right">{g.label}</Th>)}<Th className="text-right">Total (hours)</Th><Th className="text-right">Total (h:mm)</Th><Th className="text-right">Per day</Th></tr>
            </thead>
            <tbody>
              {weeks.map((w) => (
                <tr key={w.week} className="border-b border-ink-100">
                  <Td className="text-center font-semibold">{w.week}</Td>
                  <Td>{`${w.from}-${w.to}`}</Td>
                  <Td className="text-right">{w.days}</Td>
                  {REPORT_GROUPS.map((g) => <Td key={g.key} className="text-right">{dash(w.byGroup[g.key])}</Td>)}
                  <Td className="text-right font-bold">{dash(w.minutes)}</Td>
                  <Td className="text-right">{hmm(w.minutes)}</Td>
                  <Td className="text-right">{w.days ? hmm(Math.round(w.minutes / w.days)) : '-'}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section title="Calendar view" note="Hours worked each day. Shading runs from white (nothing logged) to blue (the month's longest day). Each box shows the hours and the first start to last finish." breakBefore>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] border-collapse text-center">
            <thead style={{ background: HEAD }}><tr><Th>Week</Th>{['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => <Th key={d}>{d}</Th>)}<Th>Week total</Th></tr></thead>
            <tbody>
              {calRows.map((row, i) => {
                const wk = row.find(Boolean)?.week;
                const w = weeks[wk - 1];
                return (
                  <tr key={i}>
                    <td className="px-2 font-bold" style={{ color: NAVY }}>Week {wk}</td>
                    {row.map((d, j) => (
                      <td key={j} className="border border-ink-200 p-0 align-top">
                        {d && (
                          <div>
                            <p className="px-1.5 pt-1 text-left text-[10px] font-semibold text-ink-500">{d.day}</p>
                            <p className="py-2 text-lg font-bold tabular-nums" style={{ background: d.minutes ? `rgba(43,120,214,${0.15 + 0.6 * (d.minutes / maxDay)})` : '#f5f7fb', color: NAVY }}>{d.minutes ? hmm(d.minutes) : '-'}</p>
                            <p className="h-5 text-[10px] text-ink-500">{d.minutes ? `${d.first}-${d.last}` : ''}</p>
                          </div>
                        )}
                      </td>
                    ))}
                    <td className="bg-[#f3f5f9] px-2 text-[15px] font-bold" style={{ color: NAVY }}>{w ? hm(w.minutes) : ''}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Section>

      {biometric && <BiometricSection biometric={biometric} days={days} />}

      <Section title="Activity log" note={`All ${log.length} entries of the month. Minutes and hours are Time To minus Time From.`} breakBefore>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[960px] border-collapse text-[11px]">
            <thead style={{ background: HEAD }}><tr><Th className="text-left">Date</Th><Th className="text-left">Day</Th><Th>Start</Th><Th>End</Th><Th className="text-right">Minutes</Th><Th className="text-right">Hours</Th><Th className="text-left">Type</Th><Th className="text-left">Topic</Th><Th className="text-left">In</Th><Th className="text-left">Details</Th></tr></thead>
            <tbody>
              {log.map((e) => {
                const g = REPORT_GROUPS.find((x) => x.key === (['learning', 'selfLearning'].includes(e.activityType) ? 'preparation' : ['class', 'seminar', 'marketing', 'others'].includes(e.activityType) ? e.activityType : 'support'));
                return (
                  <tr key={e.id} className="border-b border-ink-100 align-top">
                    <Td className="whitespace-nowrap">{dateLabel(e.activityDate)}</Td>
                    <Td>{days.find((d) => d.date === e.activityDate)?.dayName}</Td>
                    <Td className="text-center">{e.timeFrom}</Td>
                    <Td className="text-center">{e.timeTo}</Td>
                    <Td className="text-right">{e.minutes}</Td>
                    <Td className="text-right">{hours1(e.minutes).toFixed(2)}</Td>
                    <Td className="whitespace-nowrap"><span className="mr-1 inline-block size-2 rounded-sm" style={{ background: g.color }} />{ACTIVITY_LABEL[e.activityType]}</Td>
                    <Td>{topicOf(e, courses)}</Td>
                    <Td>{facultyInLabel(e.facultyIn)}</Td>
                    <Td className="max-w-[380px] text-ink-600">{entrySummary(e)}</Td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Section>

      <p className="text-[10px] text-ink-400 italic">Source: Daily Activity entries, Advantage Pro. Generated {new Date().toLocaleString('en-GB')}.</p>
    </div>
  );
}

const BIO_TONE = {
  Matched: 'bg-success-50 text-success-700',
  Difference: 'bg-danger-50 text-danger-700',
  'Missing out punch': 'bg-warning-50 text-warning-700',
  'No entries': 'bg-warning-50 text-warning-700',
  'No biometric': 'bg-ink-100 text-ink-600',
};

/** Biometric Time In / Out against the first start and last finish of the day's entries. */
function BiometricSection({ biometric, days }) {
  const { rows, summary, toleranceMinutes } = biometric;
  const diffCls = (m) => (m === null || m === undefined ? '' : Math.abs(m) > toleranceMinutes ? 'font-semibold text-danger-700' : 'text-success-700');
  return (
    <Section
      title="Biometric time in / out vs entries"
      note={`Time In / Time Out from the biometric device against the first start and last finish of the day's entries. Differences up to ${toleranceMinutes} minutes count as matched. In diff + means entries start after punch-in; Out diff + means punch-out is after the last entry.`}
      breakBefore
    >
      {!biometric.hasData ? (
        <p className="text-[12px] text-ink-500">No biometric data has been imported for this person and month. Master › Biometric reads the device files.</p>
      ) : (
        <>
          <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
            <Kpi label="Days compared" value={summary.days} />
            <Kpi label="Matched" value={summary.matched} color="#079455" />
            <Kpi label="Difference" value={summary.different} color="#d92d20" />
            <Kpi label="Missing out punch" value={summary.missingOut} color="#dc6803" />
            <Kpi label="No entries" value={summary.noEntries} color="#dc6803" />
            <Kpi label="Biometric hours" value={hm(summary.bioMinutes)} />
            <Kpi label="Entered hours" value={hm(summary.enteredMinutes)} sub={`Difference ${signedHm(summary.bioMinutes - summary.enteredMinutes)}`} />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] border-collapse text-[11px]">
              <thead style={{ background: HEAD }}>
                <tr>
                  <Th className="text-left">Date</Th><Th className="text-left">Day</Th>
                  <Th>Bio In</Th><Th>Entries start</Th><Th className="text-right">In diff</Th>
                  <Th>Bio Out</Th><Th>Entries end</Th><Th className="text-right">Out diff</Th>
                  <Th className="text-right">Bio hrs</Th><Th className="text-right">Entered hrs</Th><Th className="text-right">Hours diff</Th><Th className="text-left">Status</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.date} className="border-b border-ink-100">
                    <Td className="whitespace-nowrap">{dateLabel(r.date)}</Td>
                    <Td>{days.find((d) => d.date === r.date)?.dayName}</Td>
                    <Td className="text-center">{r.timeIn || '-'}</Td>
                    <Td className="text-center">{r.entryStart || '-'}</Td>
                    <Td className={cn('text-right', diffCls(r.inDiff))}>{signedHm(r.inDiff)}</Td>
                    <Td className="text-center">{r.timeOut || '-'}</Td>
                    <Td className="text-center">{r.entryEnd || '-'}</Td>
                    <Td className={cn('text-right', diffCls(r.outDiff))}>{signedHm(r.outDiff)}</Td>
                    <Td className="text-right">{r.bioMinutes === null ? '-' : hmm(r.bioMinutes)}</Td>
                    <Td className="text-right">{r.enteredMinutes ? hmm(r.enteredMinutes) : '-'}</Td>
                    <Td className="text-right">{signedHm(r.hoursDiff)}</Td>
                    <Td><span className={cn('rounded px-1.5 py-0.5 font-medium whitespace-nowrap', BIO_TONE[r.status])}>{r.status}</span></Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Section>
  );
}
