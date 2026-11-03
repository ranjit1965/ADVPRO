import { Inbox } from 'lucide-react';

export default function EmptyState({ icon: Icon = Inbox, title, message, action }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
      <span className="grid size-12 place-items-center rounded-full bg-ink-100 text-ink-500">
        <Icon className="size-6" aria-hidden />
      </span>
      <p className="mt-3 font-semibold text-ink-900">{title}</p>
      {message && <p className="mt-1 max-w-sm text-[13px] text-ink-500">{message}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
