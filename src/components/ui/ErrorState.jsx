import { AlertTriangle, RotateCw } from 'lucide-react';
import Button from './Button';

export default function ErrorState({ message = 'Something went wrong.', onRetry }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-12 text-center" role="alert">
      <span className="grid size-12 place-items-center rounded-full bg-danger-50 text-danger-600">
        <AlertTriangle className="size-6" aria-hidden />
      </span>
      <p className="mt-3 font-semibold text-ink-900">Could not load data</p>
      <p className="mt-1 max-w-sm text-[13px] text-ink-500">{message}</p>
      {onRetry && (
        <Button variant="secondary" icon={RotateCw} className="mt-4" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}
