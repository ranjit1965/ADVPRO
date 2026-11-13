import { Save, Eraser, Trash2, LogOut } from 'lucide-react';
import Button from '../ui/Button';

/**
 * Save (Update while editing), Clear (entry mode only), Delete, Exit.
 * Edit lives above the "Entries for the day" grid; Delete acts on the row selected there.
 */
export default function EntryActionBar({ editing, saving, deleting, hasSelection, onSave, onClear, onDelete, onExit }) {
  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <p className="mr-auto hidden text-xs text-ink-500 md:block">
        <kbd className="rounded border border-ink-200 bg-white px-1 font-sans">Ctrl</kbd> + <kbd className="rounded border border-ink-200 bg-white px-1 font-sans">S</kbd> to save
      </p>
      <Button icon={Save} loading={saving} onClick={onSave}>
        {editing ? 'Update' : 'Save'}
      </Button>
      {!editing && (
        <Button variant="secondary" icon={Eraser} onClick={onClear}>
          Clear
        </Button>
      )}
      <Button variant="danger-outline" icon={Trash2} onClick={onDelete} disabled={!hasSelection} loading={deleting} title={hasSelection ? 'Delete the selected entry' : 'Select an entry in the grid to delete'}>
        Delete
      </Button>
      <Button variant="secondary" icon={LogOut} onClick={onExit}>
        Exit
      </Button>
    </div>
  );
}
