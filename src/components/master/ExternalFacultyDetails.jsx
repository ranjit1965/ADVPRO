import { useEffect, useState } from 'react';
import { Award, Eye, EyeOff, Gift, Landmark, Pencil, Save, Trash2, X } from 'lucide-react';
import * as api from '../../services/api';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import Input from '../ui/Input';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { formatDate, formatDateTime } from '../../utils/format';

const BANK_FIELDS = [
  { key: 'bankName', label: 'Bank name', max: 120 },
  { key: 'accountNo', label: 'Account no', max: 20, digits: true, secret: true },
  { key: 'holderName', label: 'Account holder name', max: 120 },
  { key: 'branch', label: 'Branch', max: 120 },
  { key: 'ifsc', label: 'IFSC code (optional)', max: 11 },
  { key: 'pan', label: 'PAN (optional)', max: 10, secret: true },
  { key: 'aadhaar', label: 'Aadhaar (optional)', max: 12, digits: true, secret: true },
];
export const BANK_ROLES = ['HR', 'ADMIN', 'MANAGER'];
const mask = (v) => (v ? `${'•'.repeat(Math.max(0, v.length - 4))}${v.slice(-4)}` : '');

/**
 * Master › External Faculty › Open (v60): every detail of one external faculty, their external certifications,
 * the Send wishes button on the day, and Bank details (HR, Admin and Super Admin only; kept in a separate
 * collection). Edit and Delete stay in the last column of the list.
 */
export default function ExternalFacultyDetails({ record, fields, display, onClose, onEdit, wishes = [], sending, onWish }) {
  const { user } = useAuth();
  const toast = useToast();
  const canBank = BANK_ROLES.includes(user.role);
  const [bank, setBank] = useState(null); // null: not opened
  const [bankForm, setBankForm] = useState(null); // editing
  const [reveal, setReveal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [certs, setCerts] = useState(null);

  useEffect(() => {
    setBank(null);
    setBankForm(null);
    setReveal(false);
    setCerts(null);
    if (record) api.getExternalCerts(record.id).then(setCerts).catch(() => setCerts([]));
  }, [record]);

  const openBank = async () => {
    try {
      setBank(await api.getExternalBank(record.id));
    } catch (err) {
      toast.error(err.message);
    }
  };
  const saveBank = async () => {
    setSaving(true);
    try {
      setBank(await api.saveExternalBank(record.id, bankForm));
      setBankForm(null);
      toast.success('Bank details saved.');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  if (!record) return null;
  const rows = fields.filter((f) => !f.hidden);
  return (
    <Modal open={!!record} onClose={onClose} size="lg" title={record.name || record.id} description={`External faculty ${record.id}`}
      footer={<><Button variant="secondary" onClick={onClose}>Close</Button><Button icon={Pencil} onClick={onEdit}>Edit</Button></>}>
      <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-[13px] sm:grid-cols-2">
        {rows.map((f) => (
          <div key={f.key} className={f.type === 'textarea' ? 'sm:col-span-2' : ''}>
            <dt className="text-xs font-semibold uppercase tracking-wide text-ink-500">{f.label}</dt>
            <dd className="whitespace-pre-wrap text-ink-900">{display(f, record[f.key]) || <span className="text-ink-400">–</span>}</dd>
          </div>
        ))}
      </dl>
      {wishes.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {wishes.map((w) => (
            <Button key={w.key} size="sm" icon={Gift} loading={sending === w.key} disabled={w.sent} onClick={() => onWish(w)}>
              {w.sent ? `${w.label} wishes sent` : `Send ${w.label.toLowerCase()} wishes`}
            </Button>
          ))}
        </div>
      )}

      <section className="mt-5">
        <h3 className="mb-2 flex items-center gap-2 text-[13px] font-semibold text-ink-800"><Award className="size-4 text-brand-600" aria-hidden /> External certifications</h3>
        {!certs ? (
          <p className="text-[13px] text-ink-500">Loading…</p>
        ) : !certs.length ? (
          <p className="text-[13px] text-ink-500">None yet. Add them in External Faculty › External Certifications.</p>
        ) : (
          <ul className="divide-y divide-ink-100 rounded-lg border border-ink-200 text-[13px]">
            {certs.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                <span>
                  <b className="text-ink-900">{c.name || c.certificationId || c.id}</b>
                  {c.certificationId && c.name && <span className="text-ink-500"> · {c.certificationId}</span>}
                  {c.expiryDate && <span className="text-ink-500"> · expires {formatDate(c.expiryDate)}</span>}
                </span>
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${c.status === 'Current' ? 'bg-success-50 text-success-700' : 'bg-ink-100 text-ink-600'}`}>{c.status}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {canBank && (
        <section className="mt-5">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <h3 className="flex items-center gap-2 text-[13px] font-semibold text-ink-800"><Landmark className="size-4 text-brand-600" aria-hidden /> Bank details</h3>
            {!bank && <Button size="sm" variant="secondary" icon={Landmark} onClick={openBank}>Bank details</Button>}
            {bank && !bankForm && (
              <>
                <Button size="sm" variant="ghost" icon={reveal ? EyeOff : Eye} onClick={() => setReveal((v) => !v)}>{reveal ? 'Hide numbers' : 'Show numbers'}</Button>
                <Button size="sm" variant="secondary" icon={Pencil} onClick={() => setBankForm(Object.fromEntries(BANK_FIELDS.map((f) => [f.key, bank[f.key] || ''])))}>Edit bank details</Button>
              </>
            )}
          </div>
          {bank && !bankForm && (
            <dl className="grid grid-cols-1 gap-x-6 gap-y-2 rounded-lg border border-ink-200 p-3 text-[13px] sm:grid-cols-2">
              {BANK_FIELDS.map((f) => (
                <div key={f.key}>
                  <dt className="text-xs font-semibold uppercase tracking-wide text-ink-500">{f.label}</dt>
                  <dd className="tabular-nums text-ink-900">{(f.secret && !reveal ? mask(bank[f.key]) : bank[f.key]) || <span className="text-ink-400">–</span>}</dd>
                </div>
              ))}
              {bank.updatedAt && <p className="text-xs text-ink-500 sm:col-span-2">Changed {formatDateTime(bank.updatedAt)} by {bank.updatedBy}.</p>}
            </dl>
          )}
          {bankForm && (
            <div className="rounded-lg border border-ink-200 p-3">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {BANK_FIELDS.map((f) => (
                  <Input key={f.key} label={f.label} maxLength={f.max} inputMode={f.digits ? 'numeric' : undefined} value={bankForm[f.key]}
                    onChange={(e) => setBankForm((b) => ({ ...b, [f.key]: f.digits ? e.target.value.replace(/\D/g, '') : e.target.value }))} />
                ))}
              </div>
              <div className="mt-3 flex gap-2">
                <Button size="sm" icon={Save} loading={saving} onClick={saveBank}>Save bank details</Button>
                <Button size="sm" variant="secondary" icon={X} onClick={() => setBankForm(null)}>Cancel</Button>
                {Object.values(bankForm).some(Boolean) && (
                  <Button size="sm" variant="ghost" icon={Trash2} onClick={() => setBankForm(Object.fromEntries(BANK_FIELDS.map((f) => [f.key, ''])))}>Clear all</Button>
                )}
              </div>
            </div>
          )}
        </section>
      )}
    </Modal>
  );
}
