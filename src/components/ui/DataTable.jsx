import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import { cn } from '../../utils/cn';
import { Skeleton } from './Loading';
import EmptyState from './EmptyState';

/**
 * Presentational table.
 * columns: [{ key, header, render?(row), sortable?, align?, className?, hideOnMobile? }]
 * sort: { key, dir }  onSort(key)
 */
export default function DataTable({ columns, rows, rowKey = 'id', sort, onSort, loading, onRowClick, selectedKey, empty, dense, caption, footer, minWidth = 'min-w-[640px]' }) {
  const pad = dense ? 'px-3 py-2' : 'px-4 py-3';
  return (
    <div className="relative overflow-x-auto">
      <table className={cn('w-full border-collapse text-left text-[13px]', minWidth)}>
        {caption && <caption className="sr-only">{caption}</caption>}
        <thead>
          <tr className="border-b border-ink-200 bg-ink-50/80">
            {columns.map((c) => {
              const active = sort?.key === c.key;
              const SortIcon = active ? (sort.dir === 'asc' ? ArrowUp : ArrowDown) : ArrowUpDown;
              return (
                <th
                  key={c.key}
                  scope="col"
                  aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined}
                  className={cn(pad, 'text-xs font-semibold tracking-wide whitespace-nowrap text-ink-500 uppercase', c.align === 'right' && 'text-right', c.headerClassName)}
                >
                  {c.sortable && onSort ? (
                    <button onClick={() => onSort(c.key)} className={cn('inline-flex items-center gap-1 uppercase hover:text-ink-900', active && 'text-ink-900')}>
                      {c.header}
                      <SortIcon className={cn('size-3.5', !active && 'opacity-40')} aria-hidden />
                    </button>
                  ) : (
                    c.header
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {loading &&
            Array.from({ length: 5 }).map((_, i) => (
              <tr key={`sk-${i}`} className="border-b border-ink-100">
                {columns.map((c) => (
                  <td key={c.key} className={pad}>
                    <Skeleton className="h-4 w-full max-w-[140px]" />
                  </td>
                ))}
              </tr>
            ))}
          {!loading &&
            rows.map((row) => {
              const key = row[rowKey];
              const selected = selectedKey !== undefined && selectedKey === key;
              return (
                <tr
                  key={key}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  onKeyDown={onRowClick ? (e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onRowClick(row)) : undefined}
                  tabIndex={onRowClick ? 0 : undefined}
                  aria-selected={selectedKey !== undefined ? selected : undefined}
                  className={cn(
                    'border-b border-ink-100 transition-colors last:border-b-0',
                    onRowClick && 'cursor-pointer hover:bg-brand-50/50 focus-visible:bg-brand-50/50 focus-visible:outline-none',
                    selected && 'bg-brand-50 hover:bg-brand-50',
                  )}
                >
                  {columns.map((c) => (
                    <td key={c.key} className={cn(pad, 'align-middle text-ink-700', c.align === 'right' && 'text-right tabular-nums', c.className)}>
                      {c.render ? c.render(row) : row[c.key]}
                    </td>
                  ))}
                </tr>
              );
            })}
        </tbody>
        {footer && !loading && rows.length > 0 && <tfoot>{footer}</tfoot>}
      </table>
      {!loading && rows.length === 0 && (empty || <EmptyState title="No records found" message="Try changing the filters." />)}
    </div>
  );
}
