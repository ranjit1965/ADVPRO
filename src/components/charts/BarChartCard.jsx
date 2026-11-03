import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

/**
 * Single-series bar chart. One series, so no legend: the card title names it.
 * Thin bars, 4px rounded data-ends, recessive grid, hover tooltip.
 */
function ChartTooltip({ active, payload, label, unit, labelFormatter }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-ink-200 bg-white px-3 py-2 text-[13px] shadow-pop">
      <p className="text-ink-500">{labelFormatter ? labelFormatter(label) : label}</p>
      <p className="font-semibold text-ink-900 tabular-nums">
        {payload[0].value} {unit}
      </p>
    </div>
  );
}

export default function SimpleBarChart({ data, xKey, yKey, unit = 'hrs', height = 240, layout = 'horizontal', xFormatter, labelFormatter }) {
  const vertical = layout === 'vertical';
  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout={layout} margin={{ top: 8, right: 12, bottom: 0, left: vertical ? 8 : -12 }} barCategoryGap={vertical ? 6 : '28%'}>
          <CartesianGrid stroke="var(--color-ink-100)" vertical={vertical} horizontal={!vertical} />
          {vertical ? (
            <>
              <XAxis type="number" tick={{ fontSize: 12, fill: 'var(--color-ink-500)' }} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey={xKey} width={150} tick={{ fontSize: 12, fill: 'var(--color-ink-600)' }} axisLine={false} tickLine={false} tickFormatter={xFormatter} />
            </>
          ) : (
            <>
              <XAxis dataKey={xKey} tick={{ fontSize: 12, fill: 'var(--color-ink-500)' }} axisLine={{ stroke: 'var(--color-ink-200)' }} tickLine={false} tickFormatter={xFormatter} />
              <YAxis tick={{ fontSize: 12, fill: 'var(--color-ink-500)' }} axisLine={false} tickLine={false} allowDecimals={false} />
            </>
          )}
          <Tooltip cursor={{ fill: 'var(--color-ink-50)' }} content={<ChartTooltip unit={unit} labelFormatter={labelFormatter || xFormatter} />} />
          <Bar dataKey={yKey} fill="var(--color-brand-600)" radius={vertical ? [0, 4, 4, 0] : [4, 4, 0, 0]} maxBarSize={vertical ? 18 : 28} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
