import { Link } from 'react-router-dom';
import { Compass } from 'lucide-react';
import EmptyState from '../components/ui/EmptyState';

export default function NotFound() {
  return (
    <div className="card">
      <EmptyState
        icon={Compass}
        title="Page not found"
        message="The page you are looking for does not exist."
        action={
          <Link to="/" className="font-medium text-brand-700 hover:underline">
            Go to dashboard
          </Link>
        }
      />
    </div>
  );
}
