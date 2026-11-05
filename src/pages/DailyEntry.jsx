import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ListChecks, Printer, RotateCcw } from 'lucide-react';
import PageHeader from '../components/ui/PageHeader';
import Card from '../components/ui/Card';
import Tabs from '../components/ui/Tabs';
import Button from '../components/ui/Button';
import { PageLoader } from '../components/ui/Loading';
import ErrorState from '../components/ui/ErrorState';
import EntryHeaderFields, { EntryTimeFields } from '../components/entry/EntryHeaderFields';
import EntryActionBar from '../components/entry/EntryActionBar';
import EntriesGrid from '../components/entry/EntriesGrid';
import AddLookupModal from '../components/entry/AddLookupModal';
import AddCourseModal from '../components/entry/AddCourseModal';
import RequestCourseModal from '../components/entry/RequestCourseModal';
import { TAB_COMPONENTS } from '../components/entry/tabs';
import { useAuth } from '../context/AuthContext';
import { usePreferences } from '../hooks/usePreferences';
import { useLookups } from '../context/LookupsContext';
import { useToast } from '../context/ToastContext';
import { useConfirm } from '../context/ConfirmContext';
import * as api from '../services/api';
import { ACTIVITY_TYPES, ACTIVITY_LABEL, DAY_START } from '../utils/constants';
import { EMPTY_DETAILS, EMPTY_OUTSTATION, LONG_ENTRY_MINUTES, OTHERS_CONFIRM_MINUTES, buildPayload, emptyHeader, freshDetails, validateEntry } from '../utils/entryForm';
import { formatDate, formatDuration, minutesBetween, toISODate } from '../utils/format';

const NO_ERRORS = { header: {}, details: {}, outstation: {} };

/** Latest Time To among the day's entries ('' when there are none). HH:MM strings compare correctly. */
/** Minutes already logged under Others that day (the entry being edited not counted). */

const lastEndTime = (rows) => rows.reduce((max, r) => (r.timeTo > max ? r.timeTo : max), '');

export default function DailyEntry() {
  const { id: routeId } = useParams();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const { lookups, error: lookupsError, reload: reloadLookups } = useLookups();
  const toast = useToast();
  const confirm = useConfirm();
  const navigate = useNavigate();

  const [prefs] = usePreferences();
  const [header, setHeader] = useState(() => ({ ...emptyHeader(user.code, searchParams.get('date') || toISODate()), facultyIn: prefs.defaultFacultyIn }));
  const openTab = (t) => (ACTIVITY_TYPES.some((a) => a.key === t) ? t : 'class');
  const [tab, setTab] = useState(openTab(searchParams.get('type') || prefs.defaultTab));
  const [details, setDetails] = useState(freshDetails);
  const [outstation, setOutstation] = useState(EMPTY_OUTSTATION);
  const [errors, setErrors] = useState(NO_ERRORS);
  const [editingId, setEditingId] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [grid, setGrid] = useState({ rows: [], loading: true });
  const [lookupModal, setLookupModal] = useState(null); // { kind, apply }
  const [courseModal, setCourseModal] = useState(null); // { apply }
  const [requestCourseOpen, setRequestCourseOpen] = useState(false);
  const [loadingEntry, setLoadingEntry] = useState(!!routeId);
  const formRef = useRef(null);
  // Time From of a new entry = Time To of the day's last entry. Remember what was auto-filled
  // so a later grid reload can move it on, while a time the user typed is left alone.
  const autoFromRef = useRef('');

  // Menu links such as Faculty › Others open the form on a specific tab.
  const typeParam = searchParams.get('type');
  useEffect(() => {
    if (typeParam && TAB_COMPONENTS[typeParam]) setTab(openTab(typeParam));
  }, [typeParam]);

  /* ---------- grid: entries of the selected faculty on the activity date ---------- */
  const loadGrid = useCallback(async () => {
    if (!header.facultyCode || !header.activityDate) {
      setGrid({ rows: [], loading: false });
      return [];
    }
    setGrid((g) => ({ ...g, loading: true }));
    const { items } = await api.getDailyEntries({ facultyCode: header.facultyCode, dateFrom: header.activityDate, dateTo: header.activityDate, sortBy: 'timeFrom', sortDir: 'asc' });
    setGrid({ rows: items, loading: false });
    return items;
  }, [header.facultyCode, header.activityDate]);

  useEffect(() => {
    loadGrid().then((items) => {
      setSelectedId((sel) => (items.some((i) => i.id === sel) ? sel : null));
      // Next entry starts where the last one ended: Time From = latest Time To of that day.
      if (!editingId) {
        const end = lastEndTime(items) || DAY_START;
        setHeader((h) => {
          if (h.timeFrom && h.timeFrom !== autoFromRef.current) return h;
          autoFromRef.current = end;
          return { ...h, timeFrom: end };
        });
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadGrid]);

  /* ---------- load an entry into the form (Edit) ---------- */
  const loadIntoForm = useCallback((entry) => {
    setHeader({ facultyCode: entry.facultyCode, activityDate: entry.activityDate, facultyIn: entry.facultyIn, timeFrom: entry.timeFrom, timeTo: entry.timeTo });
    setTab(entry.activityType);
    const old = entry.outstation || {};
    // Older College / OD entries kept No of Students and Daily test in the College / OD block.
    const moved = entry.activityType === 'class' ? { noOfStudents: entry.details?.noOfStudents || old.totalStudent || '', dailyTest: entry.details?.dailyTest || old.dailyTest || '' } : {};
    setDetails((d) => ({ ...d, [entry.activityType]: { ...EMPTY_DETAILS[entry.activityType], ...entry.details, ...moved } }));
    setOutstation(entry.outstation ? { ...EMPTY_OUTSTATION, ...entry.outstation } : EMPTY_OUTSTATION);
    setEditingId(entry.id);
    setSelectedId(entry.id);
    setErrors(NO_ERRORS);
    setDirty(false);
  }, []);

  useEffect(() => {
    if (!routeId) return;
    setLoadingEntry(true);
    api
      .getDailyEntry(routeId)
      .then(loadIntoForm)
      .catch((e) => {
        toast.error(e.message);
        navigate('/faculty/daily-activity/entry', { replace: true });
      })
      .finally(() => setLoadingEntry(false));
  }, [routeId, loadIntoForm, navigate, toast]);

  /* ---------- field setters ---------- */
  const changeHeader = (patch) => {
    setHeader((h) => ({ ...h, ...patch }));
    setErrors((e) => ({ ...e, header: Object.fromEntries(Object.entries(e.header).filter(([k]) => !(k in patch) && !(k === 'timeTo' && 'timeFrom' in patch))) }));
    setDirty(true);
  };
  const setMany = (patch) => {
    setDetails((d) => ({ ...d, [tab]: { ...d[tab], ...patch } }));
    setErrors((e) => ({ ...e, details: Object.fromEntries(Object.entries(e.details).filter(([k]) => !(k in patch))) }));
    setDirty(true);
  };
  const setField = (name, value) => setMany({ [name]: value });
  const setOutstationField = (name, value) => {
    setOutstation((o) => ({ ...o, [name]: value }));
    setErrors((e) => ({ ...e, outstation: { ...e.outstation, [name]: undefined } }));
    setDirty(true);
  };

  /* ---------- actions ---------- */
  const resetTab = ({ keepTimes } = {}) => {
    setDetails((d) => ({ ...d, [tab]: { ...EMPTY_DETAILS[tab] } }));
    setOutstation(EMPTY_OUTSTATION);
    setErrors(NO_ERRORS);
    setEditingId(null);
    setDirty(false);
    if (!keepTimes) {
      const end = lastEndTime(grid.rows) || DAY_START;
      autoFromRef.current = end;
      setHeader((h) => ({ ...h, timeFrom: end, timeTo: '' }));
    }
    if (routeId) navigate('/faculty/daily-activity/entry', { replace: true });
  };

  const handleSave = async (e) => {
    e?.preventDefault();
    const form = { header, tab, details: details[tab], outstation };
    const { errors: errs, valid: formValid } = validateEntry(form);
    setErrors(errs);
    if (!formValid) {
      toast.error('Please fill the highlighted fields.', 'Entry not saved');
      requestAnimationFrame(() => formRef.current?.querySelector('[aria-invalid="true"]')?.focus());
      return;
    }
    // Long slots are allowed, but the faculty confirms them first.
    const mins = minutesBetween(header.timeFrom, header.timeTo);
    const span = `${header.timeFrom} to ${header.timeTo} (${formatDuration(mins)})`;
    if (tab === 'others' && mins > OTHERS_CONFIRM_MINUTES) {
      if (!(await confirm({ title: 'Others more than 1 hour', message: `This Others entry is ${span}, more than 1 hour. Are you sure?`, confirmLabel: 'Yes, save' }))) return;
    } else if (mins > LONG_ENTRY_MINUTES) {
      if (!(await confirm({ title: 'More than 2 hours', message: `This entry is ${span}, more than 2 hours. Are you sure?`, confirmLabel: 'Yes, save' }))) return;
    }
    setSaving(true);
    try {
      const payload = buildPayload(form);
      if (editingId) {
        await api.updateDailyEntry(editingId, payload);
        toast.success('Daily entry updated successfully.');
      } else {
        await api.createDailyEntry(payload);
        toast.success('Daily entry saved successfully.');
      }
      resetTab({ keepTimes: true });
      const items = await loadGrid();
      const nextFrom = lastEndTime(items) || header.timeTo || DAY_START;
      autoFromRef.current = nextFrom;
      setHeader((h) => ({ ...h, timeFrom: nextFrom, timeTo: '' }));
      setSelectedId(null);
    } catch (err) {
      toast.error(err.message, 'Could not save');
    } finally {
      setSaving(false);
    }
  };

  const handleClear = async () => {
    if (dirty && !(await confirm({ title: 'Clear form', message: 'Clear the fields of this tab? Unsaved changes will be lost.', confirmLabel: 'Clear' }))) return;
    resetTab();
    setSelectedId(null);
    toast.info(`${ACTIVITY_LABEL[tab]} fields cleared.`);
  };

  const handleEdit = async () => {
    const row = grid.rows.find((r) => r.id === selectedId);
    if (!row) return;
    if (dirty && !(await confirm({ title: 'Discard changes?', message: 'Load the selected entry for editing? Your unsaved changes will be lost.', confirmLabel: 'Load entry' }))) return;
    loadIntoForm(row);
    toast.info(`Editing ${ACTIVITY_LABEL[row.activityType]} entry (${row.timeFrom}–${row.timeTo}). Click Update to save changes.`);
    formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const handleDelete = async () => {
    const row = grid.rows.find((r) => r.id === selectedId);
    if (!row) return;
    const ok = await confirm({
      title: 'Delete entry',
      message: `Delete the ${ACTIVITY_LABEL[row.activityType]} entry (${row.timeFrom}–${row.timeTo}) on ${formatDate(row.activityDate)}? This cannot be undone.`,
      confirmLabel: 'Delete',
      tone: 'danger',
    });
    if (!ok) return;
    setDeleting(true);
    try {
      await api.deleteDailyEntry(row.id);
      toast.success('Daily entry deleted.');
      if (editingId === row.id) resetTab();
      setSelectedId(null);
      await loadGrid();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setDeleting(false);
    }
  };

  const handleExit = async () => {
    if (dirty && !(await confirm({ title: 'Exit without saving?', message: 'You have unsaved changes on this form.', confirmLabel: 'Exit', tone: 'danger' }))) return;
    navigate('/');
  };

  // Ctrl + S saves, like a desktop form.
  const saveRef = useRef(handleSave);
  saveRef.current = handleSave;
  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        saveRef.current();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  /* ---------- Ctrl + A: add college / dept ---------- */
  const openLookupModal = (kind, apply) => setLookupModal({ kind, apply });
  const submitLookup = async (value) => {
    await api.addLookupValue(lookupModal.kind, value);
    await reloadLookups();
    lookupModal.apply(value);
    toast.success(`"${value}" added.`);
    setLookupModal(null);
  };

  /* ---------- Add course (Learning tab) ---------- */
  const openCourseModal = (apply) => setCourseModal({ apply });
  const submitCourse = async (course) => {
    const saved = await api.addCourse(course);
    await reloadLookups();
    courseModal.apply(saved.id);
    toast.success(`Course ${saved.id} – ${saved.name} added.`);
    setCourseModal(null);
  };

  const tabCounts = useMemo(() => {
    const counts = {};
    grid.rows.forEach((r) => (counts[r.activityType] = (counts[r.activityType] || 0) + 1));
    return counts;
  }, [grid.rows]);
  const dayMinutes = grid.rows.reduce((s, r) => s + r.minutes, 0);

  if (lookupsError) return <ErrorState message={lookupsError} onRetry={reloadLookups} />;
  if (!lookups || loadingEntry) return <PageLoader label="Loading form…" />;

  const TabPanel = TAB_COMPONENTS[tab];
  const tabErrorCount = Object.values(errors.details).filter(Boolean).length + Object.values(errors.outstation).filter(Boolean).length;

  return (
    <>
      <PageHeader
        title="Faculty Daily Activity Entry"
        breadcrumb={[{ label: 'Faculty' }, { label: 'Daily Activity' }, { label: 'Entry' }]}
        description="Record each activity with its time slot. Saved entries for the day appear in the grid below."
        actions={
          <>
            <Button variant="secondary" icon={ListChecks} onClick={() => navigate('/faculty/daily-activity/history')}>
              My entries
            </Button>
            <Button variant="secondary" icon={Printer} onClick={() => navigate(`/faculty/daily-activity/print?date=${header.activityDate}&faculty=${header.facultyCode}`)}>
              Print
            </Button>
          </>
        }
      />

      <form ref={formRef} onSubmit={handleSave} noValidate className="space-y-5">
        {editingId && (
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-brand-200 bg-brand-50 px-4 py-3 text-[13px] text-brand-800" role="status">
            <span className="flex-1">
              Editing entry <b>{editingId}</b>. Change the fields and click <b>Update</b>.
            </span>
            <Button size="sm" variant="secondary" icon={RotateCcw} onClick={() => resetTab()}>
              Cancel edit
            </Button>
          </div>
        )}

        <Card bodyClassName="p-5">
          <EntryHeaderFields header={header} errors={errors.header} onChange={changeHeader} lookups={lookups} />
        </Card>

        <Card bodyClassName="p-0">
          <div className="border-b border-ink-100 bg-ink-50/40 p-5">
            <EntryTimeFields header={header} errors={errors.header} onChange={changeHeader} lastEnd={editingId ? '' : lastEndTime(grid.rows)} />
          </div>
          <div className="border-b border-ink-100 p-3">
            <Tabs tabs={ACTIVITY_TYPES.map((t) => ({ ...t, badge: tabCounts[t.key] }))} value={tab} onChange={setTab} idPrefix="activity" />
          </div>
          <div id="activity-panel" role="tabpanel" aria-labelledby={`activity-${tab}`} className="p-5">
            <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-base font-semibold text-accent-600">{ACTIVITY_LABEL[tab]}</h2>
              {tabErrorCount > 0 && (
                <p className="text-xs font-medium text-danger-600" role="alert">
                  {tabErrorCount} field(s) need attention
                </p>
              )}
            </div>
            <TabPanel
              values={details[tab]}
              errors={errors.details}
              set={setField}
              setMany={setMany}
              lookups={lookups}
              facultyCode={header.facultyCode}
              facultyIn={header.facultyIn}
              outstation={outstation}
              outstationErrors={errors.outstation}
              setOutstation={setOutstationField}
              onAddLookup={openLookupModal}
              onAddCourse={openCourseModal}
              onRequestCourse={() => setRequestCourseOpen(true)}
            />
          </div>
          <div className="border-t border-ink-100 bg-ink-50/60 px-5 py-3">
            <EntryActionBar
              editing={!!editingId}
              saving={saving}
              deleting={deleting}
              hasSelection={!!selectedId}
              onSave={handleSave}
              onClear={handleClear}
              onEdit={handleEdit}
              onDelete={handleDelete}
              onExit={handleExit}
            />
          </div>
        </Card>
      </form>

      <Card
        className="mt-5"
        bodyClassName="p-0"
        title="Entries for the day"
        description={
          header.facultyCode
            ? `${[...(lookups.faculties || []), ...(lookups.employees || [])].find((f) => f.code === header.facultyCode)?.name || header.facultyCode} · ${formatDate(header.activityDate)} · ${grid.rows.length} entr${grid.rows.length === 1 ? 'y' : 'ies'} · ${formatDuration(dayMinutes)}`
            : 'Select a faculty to see entries'
        }
        actions={<span className="text-xs text-ink-500">Select a row, then use Edit or Delete</span>}
      >
        <EntriesGrid rows={grid.rows} loading={grid.loading} selectedId={selectedId} editingId={editingId} onSelect={setSelectedId} />
      </Card>

      <AddLookupModal kind={lookupModal?.kind} onClose={() => setLookupModal(null)} onSubmit={submitLookup} />
      <AddCourseModal open={!!courseModal} onClose={() => setCourseModal(null)} onSubmit={submitCourse} />
      <RequestCourseModal open={requestCourseOpen} onClose={() => setRequestCourseOpen(false)} />
    </>
  );
}
