import { Save, Eraser, Pencil, Trash2, LogOut } from 'lucide-react';
import Button from '../ui/Button';

/**
 * The five legacy buttons, in legacy order: Save, Clear, Edit, Delete, Exit.
 * Edit and Delete act on the row selected in the grid below (Delete starts disabled, as before).
 */
export default function EntryActionBar({ editing, saving, deleting, hasSelection, onSave, onClear, onEdit, onDelete, onExit }) {
  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <p className="mr-auto hidden text-xs text-ink-500 md:block">
        <kbd className="rounded border border-ink-200 bg-white px-1 font-sans">Ctrl</kbd> + <kbd className="rounded border border-ink-200 bg-white px-1 font-sans">S</kbd> to save
      </p>
      <Button icon={Save} loading={saving} onClick={onSave}>
        {editing ? 'Update' : 'Save'}
      </Button>
      <Button variant="secondary" icon={Eraser} onClick={onClear}>
        Clear
      </Button>
      <Button variant="secondary" icon={Pencil} onClick={onEdit} disabled={!hasSelection} title={hasSelection ? 'Load the selected entry for editing' : 'Select an entry in the grid to edit'}>
        Edit
      </Button>
      <Button variant="danger-outline" icon={Trash2} onClick={onDelete} disabled={!hasSelection} loading={deleting} title={hasSelection ? 'Delete the selected entry' : 'Select an entry in the grid to delete'}>
        Delete
      </Button>
      <Button variant="secondary" icon={LogOut} onClick={onExit}>
        Exit
      </Button>
    </div>
  );
}
