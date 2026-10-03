import { useState, type ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { Field, Modal, btnNeutral, btnPrimary, inputCls } from "./railUi";

/** A small "write a note, then confirm" dialog (investigation note, preliminary report, closing note, allocation reference). */
export default function NoteModal({
  title, label, hint, minLength = 3, submitLabel = "Save", children, onSubmit, onClose,
}: {
  title: string; label: string; hint?: string; minLength?: number; submitLabel?: string;
  /** Extra fields shown above the note (e.g. a party selector). */
  children?: ReactNode;
  onSubmit: (note: string) => Promise<unknown>; onClose: () => void;
}) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const ok = note.trim().length >= minLength;
  return (
    <Modal title={title} onClose={onClose}>
      {children && <div className="mb-3">{children}</div>}
      <Field label={label}>
        <textarea className={`${inputCls} min-h-[110px]`} value={note} onChange={(e) => setNote(e.target.value)} maxLength={4000} />
      </Field>
      {hint && <p className="mt-1 text-[11px] text-slate-500">{hint}</p>}
      <div className="mt-4 flex justify-end gap-2">
        <button type="button" className={btnNeutral} onClick={onClose}>Cancel</button>
        <button
          type="button" className={btnPrimary} disabled={!ok || busy}
          onClick={async () => { setBusy(true); try { await onSubmit(note.trim()); } finally { setBusy(false); } }}
        >
          {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />} {submitLabel}
        </button>
      </div>
    </Modal>
  );
}
