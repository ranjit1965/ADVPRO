import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Construction } from 'lucide-react';
import PageHeader from '../components/ui/PageHeader';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import EmptyState from '../components/ui/EmptyState';

/** Menu items from the legacy app whose screens were not in the reference screenshots. */
export default function ModulePlaceholder({ title, section }) {
  const navigate = useNavigate();
  return (
    <>
      <PageHeader title={title} breadcrumb={section ? [{ label: section }, { label: title }] : []} />
      <Card>
        <EmptyState
          icon={Construction}
          title={`${title} screen coming next`}
          message="This menu item is kept so navigation matches the existing Advpro application. Its screen will be built once its layout is shared."
          action={
            <Button variant="secondary" icon={ArrowLeft} onClick={() => navigate('/')}>
              Back to dashboard
            </Button>
          }
        />
      </Card>
    </>
  );
}
