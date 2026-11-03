import { ChevronLeft, ChevronRight } from 'lucide-react';
import { PAGE_SIZE_OPTIONS } from '../../utils/constants';

export default function Pagination({ page, pageSize, total, onPageChange, onPageSizeChange }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-ink-100 px-4 py-3 text-[13px] text-ink-600">
      <div className="flex items-center gap-2">
        <span>Rows</span>
        <select value={pageSize} onChange={(e) => onPageSizeChange(Number(e.target.value))} className="rounded-md border border-ink-300 bg-white px-2 py-1 text-[13px]" aria-label="Rows per page">
          {PAGE_SIZE_OPTIONS.map((n) => (
            <option key={n}>{n}</option>
          ))}
        </select>
        <span className="tabular-nums">
          {from}–{to} of {total}
        </span>
      </div>
      <div className="flex items-center gap-1">
        <button disabled={page <= 1} onClick={() => onPageChange(page - 1)} className="rounded-md border border-ink-300 bg-white p-1.5 hover:bg-ink-50 disabled:opacity-40" aria-label="Previous page">
          <ChevronLeft className="size-4" />
        </button>
        <span className="px-2 tabular-nums">
          Page {page} of {pages}
        </span>
        <button disabled={page >= pages} onClick={() => onPageChange(page + 1)} className="rounded-md border border-ink-300 bg-white p-1.5 hover:bg-ink-50 disabled:opacity-40" aria-label="Next page">
          <ChevronRight className="size-4" />
        </button>
      </div>
    </div>
  );
}
