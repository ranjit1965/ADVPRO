import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader';
import Card from '../../components/ui/Card';
import { MASTER_MENU } from '../../config/masterMenu';

/** Master: the same items as the legacy Master menu. */
export default function MasterHome() {
  return (
    <>
      <PageHeader title="Master" description="Master data maintained by the Admin and Manager. Each item is stored in its own collection." />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {MASTER_MENU.map((m) => (
          <Link key={m.key} to={m.to} className="group">
            <Card className="h-full transition group-hover:border-brand-300 group-hover:shadow-pop">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-ink-900">{m.label}</p>
                  <p className="mt-1 text-[13px] text-ink-500">{m.description}</p>
                </div>
                <ChevronRight className="mt-0.5 size-4 shrink-0 text-ink-400 group-hover:text-brand-600" aria-hidden />
              </div>
            </Card>
          </Link>
        ))}
      </div>
    </>
  );
}
