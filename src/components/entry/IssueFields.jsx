import { AlertTriangle } from 'lucide-react';
import Select from '../ui/Select';
import Input from '../ui/Input';
import RadioGroup from '../ui/RadioGroup';
import Textarea from '../ui/Textarea';
import { ISSUE_FLAG_MINUTES } from '../../utils/entryForm';

/**
 * "Issue faced?" under every activity tab: a faculty who faced a problem anywhere (class, college,
 * seminar, marketing, travelling ...) records the issue type, minutes lost and details. On Save the
 * issue is emailed and sent on WhatsApp to Ranjit sir and the managing person of that Center / college.
 */
export default function IssueFields({ values, errors, set, setMany, lookups, place }) {
  const issue = values.issueFaced === 'Yes';
  const minutes = Number(values.issueMinutes || 0);
  const field = (k) => ({ id: `issue-${k}`, value: values[k] ?? '', error: errors[k], onChange: (e) => set(k, e?.target ? e.target.value : e) });
  return (
    <fieldset className="grid grid-cols-2 gap-x-3 gap-y-4 rounded-xl border border-ink-200 p-4 sm:gap-4 lg:grid-cols-12">
      <legend className="px-1 text-[13px] font-semibold text-ink-700">Issue faced</legend>
      <RadioGroup
        className="col-span-2 lg:col-span-3"
        label="Did you face any issue?"
        name="issueFaced"
        options={['Yes', 'No']}
        value={values.issueFaced ?? ''}
        onChange={(v) => (v === 'Yes' ? set('issueFaced', v) : setMany({ issueFaced: v, issueType: '', issueDetails: '', issueMinutes: '' }))}
      />
      {issue && (
        <>
          <Select label="Issue type" required className="lg:col-span-5" options={lookups.issueTypes || []} {...field('issueType')} />
          <Input
            label="Minutes lost"
            required
            className="lg:col-span-4"
            inputMode="numeric"
            maxLength={3}
            placeholder="e.g. 45"
            hint={minutes > ISSUE_FLAG_MINUTES ? 'Over 1 hour: shown in the Monthly Report' : undefined}
            {...field('issueMinutes')}
            onChange={(e) => set('issueMinutes', e.target.value.replace(/\D/g, ''))}
          />
          <Textarea label="Issue details" required className="col-span-2 lg:col-span-12" rows={2} maxLength={500} placeholder="What happened and what was done" {...field('issueDetails')} />
          <p className="col-span-2 flex items-start gap-2 text-[12px] text-ink-600 lg:col-span-12">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-accent-600" aria-hidden />
            On Save, an email and WhatsApp message go to Ranjit sir and the managing person of {place}.
          </p>
        </>
      )}
    </fieldset>
  );
}
