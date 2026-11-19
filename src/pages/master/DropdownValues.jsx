import { useEffect, useMemo, useState } from 'react';
import { Check, Pencil, Plus, Save, Trash2, X } from 'lucide-react';
import * as api from '../../services/api';
import PageHeader from '../../components/ui/PageHeader';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import SearchableSelect from '../../components/ui/SearchableSelect';
import ErrorState from '../../components/ui/ErrorState';
import { PageLoader } from '../../components/ui/Loading';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { useConfirm } from '../../context/ConfirmContext';
import { useLookups } from '../../context/LookupsContext';
import { canManage, isSuperAdmin } from '../../utils/permissions';
import { formatDateTime } from '../../utils/format';
import { cn } from '../../utils/cn';

const CONTACTS = '__issueContacts'; // left-list item for the issue alert contacts (not a dropdown)
const byName = (a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });

/**
 * Master › Dropdown Values (Super Admin, Admin and HR): add and rename (remove: Super Admin only) the values of every dropdown
 * list of the entry form. Faculty and staff only pick from these lists. Also sets the managing person
 * of the Center and of each college, who gets the class issue alert with Ranjit sir.
 */
export default function DropdownValues() {
  const { user } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const { reload: reloadLookups } = useLookups();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [kind, setKind] = useState('');
  const [values, setValues] = useState([]);
  const [newValue, setNewValue] = useState('');
  const [editing, setEditing] = useState(null); // { index, text }
  const [q, setQ] = useState('');
  const [saving, setSaving] = useState(false);
  const [renamed, setRenamed] = useState([]); // saved values that were renamed (Admin / HR may rename, not remove)
  const canRemove = isSuperAdmin(user);

  const load = () => {
    setError('');
    api
      .getLookupLists()
      .then((d) => {
        setData(d);
        setKind((k) => k || d.lists[0]?.kind || '');
      })
      .catch((e) => setError(e.message));
  };
  useEffect(() => {
    if (canManage(user)) load();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const list = data?.lists.find((l) => l.kind === kind);
  useEffect(() => {
    setValues(list ? [...list.values] : []);
    setRenamed([]);
    setEditing(null);
    setNewValue('');
    setQ('');
  }, [list]);

  const changed = useMemo(() => !!list && JSON.stringify([...values].sort(byName)) !== JSON.stringify([...list.values].sort(byName)), [values, list]);

  if (!canManage(user)) {
    return (
      <>
        <PageHeader title="Dropdown Values" />
        <Card><p className="text-sm text-ink-600">Only the Super Admin, Admin and HR can change dropdown values.</p></Card>
      </>
    );
  }
  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!data) return <PageLoader />;

  const exists = (text, except = -1) => values.some((v, i) => i !== except && v.toLowerCase() === text.trim().toLowerCase());
  const pickList = async (k) => {
    if (changed && !(await confirm({ title: 'Unsaved changes', message: `Leave ${list.label} without saving your changes?`, confirmLabel: 'Leave' }))) return;
    setKind(k);
  };
  const add = (e) => {
    e?.preventDefault();
    const v = newValue.trim();
    if (!v) return;
    if (exists(v)) return toast.error(`"${v}" is already in the list.`);
    setValues((list) => [...list, v].sort(byName));
    setNewValue('');
  };
  const rename = () => {
    const v = editing.text.trim();
    if (!v) return;
    if (exists(v, editing.index)) return toast.error(`"${v}" is already in the list.`);
    const old = values[editing.index];
    if (list.values.includes(old)) setRenamed((r) => [...r, old]);
    setValues((list) => list.map((x, i) => (i === editing.index ? v : x)).sort(byName));
    setEditing(null);
  };
  const save = async () => {
    setSaving(true);
    try {
      const saved = await api.saveLookupList(kind, values, renamed);
      setRenamed([]);
      setData((d) => ({ ...d, lists: d.lists.map((l) => (l.kind === kind ? { ...l, values: saved, updatedBy: user.name, updatedAt: new Date().toISOString() } : l)) }));
      reloadLookups?.();
      toast.success(`${list.label} saved. Entries already saved keep the value they had.`);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const shown = values.map((v, i) => [v, i]).filter(([v]) => !q.trim() || v.toLowerCase().includes(q.trim().toLowerCase()));

  return (
    <>
      <PageHeader
        title="Dropdown Values"
        description="Add, rename or remove the values of every dropdown in the entry form. Faculty and staff only pick from these lists."
        breadcrumb={[{ label: 'Dropdown Values' }]}
      />
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[300px_1fr]">
        <Card title="Lists" bodyClassName="p-2">
          <ul className="space-y-1">
            {data.lists.map((l) => (
              <li key={l.kind}>
                <button
                  type="button"
                  onClick={() => pickList(l.kind)}
                  className={cn('flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-[13px] hover:bg-ink-50', l.kind === kind && 'bg-brand-50 text-brand-800 hover:bg-brand-50')}
                >
                  <span className="font-medium">{l.label}</span>
                  <span className="shrink-0 text-xs text-ink-500 tabular-nums">{l.values.length}</span>
                </button>
              </li>
            ))}
            <li className="mt-2 border-t border-ink-100 pt-2">
              <button
                type="button"
                onClick={() => pickList(CONTACTS)}
                className={cn('flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-[13px] hover:bg-ink-50', kind === CONTACTS && 'bg-brand-50 text-brand-800 hover:bg-brand-50')}
              >
                <span className="font-medium">Issue alert contacts</span>
                <span className="shrink-0 text-xs text-ink-500 tabular-nums">{Object.keys(data.contacts).length}</span>
              </button>
            </li>
          </ul>
        </Card>

        <div className="space-y-5">
          {list && (
            <Card
              title={list.label}
              description={list.updatedAt ? `Last changed ${formatDateTime(list.updatedAt)}${list.updatedBy ? ` by ${list.updatedBy}` : ''}` : `${values.length} values`}
              actions={
                <>
                  {changed && <Button size="sm" variant="secondary" icon={X} onClick={() => { setValues([...list.values]); setRenamed([]); }}>Undo changes</Button>}
                  <Button size="sm" icon={Save} loading={saving} disabled={!changed} onClick={save}>Save</Button>
                </>
              }
            >
              <form onSubmit={add} className="mb-4 flex flex-wrap items-end gap-3">
                <Input label="New value" className="min-w-[220px] flex-1" maxLength={200} value={newValue} onChange={(e) => setNewValue(e.target.value)} placeholder="Type a value and press Add" />
                <Button type="submit" icon={Plus} disabled={!newValue.trim()}>Add</Button>
                {values.length > 12 && <Input label="Search" className="w-56" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a value" />}
              </form>
              {values.length === 0 ? (
                <p className="text-sm text-ink-500">No values yet.</p>
              ) : (
                <ul className="divide-y divide-ink-100 rounded-lg border border-ink-100">
                  {shown.map(([v, i]) => (
                    <li key={`${v}-${i}`} className="flex items-center gap-2 px-3 py-1.5 text-[13px]">
                      {editing?.index === i ? (
                        <>
                          <Input
                            aria-label={`Rename ${v}`}
                            className="flex-1"
                            maxLength={200}
                            autoFocus
                            value={editing.text}
                            onChange={(e) => setEditing({ index: i, text: e.target.value })}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                rename();
                              }
                              if (e.key === 'Escape') setEditing(null);
                            }}
                          />
                          <Button size="sm" variant="ghost" icon={Check} onClick={rename} aria-label="Keep the new name" title="OK" />
                          <Button size="sm" variant="ghost" icon={X} onClick={() => setEditing(null)} aria-label="Cancel rename" title="Cancel" />
                        </>
                      ) : (
                        <>
                          <span className="flex-1 text-ink-900">{v}</span>
                          <Button size="sm" variant="ghost" icon={Pencil} onClick={() => setEditing({ index: i, text: v })} aria-label={`Rename ${v}`} title="Rename" />
                          {canRemove && <Button size="sm" variant="ghost" icon={Trash2} onClick={() => setValues((list) => list.filter((_, j) => j !== i))} aria-label={`Remove ${v}`} title="Remove" />}
                        </>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              <p className="mt-3 text-xs text-ink-500">Changes apply after Save. Renaming or removing a value does not change entries already saved with it.{!canRemove && ' Only the Super Admin can remove values.'}</p>
            </Card>
          )}

          {kind === CONTACTS && <IssueContacts data={data} setData={setData} />}
        </div>
      </div>
    </>
  );
}

/** Managing person of the Center and of each college: gets the class issue alert email / WhatsApp. */
function IssueContacts({ data, setData }) {
  const toast = useToast();
  const colleges = data.lists.find((l) => l.kind === 'colleges')?.values || [];
  const places = [data.center, ...colleges.filter((c) => c !== data.center)];
  const [place, setPlace] = useState(data.center);
  const [form, setForm] = useState(() => data.contacts[place] || { name: '', email: '', phone: '' });
  const [busy, setBusy] = useState(false);
  useEffect(() => setForm(data.contacts[place] || { name: '', email: '', phone: '' }), [place, data.contacts]);

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const contacts = await api.saveIssueContact({ place, ...form });
      setData((d) => ({ ...d, contacts }));
      toast.success(contacts[place] ? `Issue contact for ${place} saved.` : `Issue contact for ${place} removed.`);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const listed = Object.entries(data.contacts).sort(([a], [b]) => (a === data.center ? -1 : b === data.center ? 1 : byName(a, b)));

  return (
    <Card title="Issue alert contacts" description="When a faculty saves an entry with an issue, the email and WhatsApp go to Ranjit sir and to the managing person of that Center or college set here.">
      <form onSubmit={save} className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-12">
        <SearchableSelect label="Center / College" className="sm:col-span-2 lg:col-span-12" sort={false} options={places.map((p) => ({ value: p, label: p === data.center ? 'Center (Advantage Pro)' : p }))} value={place} onChange={(v) => setPlace(v?.target ? v.target.value : v)} />
        <Input label="Managing person" className="lg:col-span-4" maxLength={80} value={form.name || ''} onChange={set('name')} placeholder="Name" />
        <Input label="Email" type="email" className="lg:col-span-4" maxLength={120} value={form.email || ''} onChange={set('email')} placeholder="name@example.com" />
        <Input label="WhatsApp number" className="lg:col-span-4" inputMode="tel" maxLength={40} value={form.phone || ''} onChange={set('phone')} placeholder="10-digit mobile" />
        <div className="flex items-end sm:col-span-2 lg:col-span-12">
          <Button type="submit" icon={Save} loading={busy}>Save contact</Button>
        </div>
      </form>
      {listed.length > 0 && (
        <ul className="mt-4 divide-y divide-ink-100 text-[13px]">
          {listed.map(([p, c]) => (
            <li key={p} className="flex flex-wrap justify-between gap-2 py-2">
              <button type="button" className="font-medium text-brand-700 hover:underline" onClick={() => setPlace(p)}>{p === data.center ? 'Center (Advantage Pro)' : p}</button>
              <span className="text-ink-600">{[c.name, c.email, c.phone].filter(Boolean).join(' · ')}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
