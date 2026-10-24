import * as React from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../ui/alert-dialog';
import { cn } from '../../lib/utils';

/**
 * Confirmation for an action that cannot be undone.
 *
 * Two things make this more than a yes/no box for a platform of record:
 *
 * 1. It can require the user to type a confirmation phrase before the button
 *    enables. Deleting a period, voiding an invoice or withdrawing a signed
 *    handshake are the moments where a mis-click becomes an audit finding, and
 *    a slip is far more likely than intent.
 * 2. It states the consequence, not just the action. "Delete 14 records" is a
 *    decision; "Delete?" is a reflex.
 *
 * Focus lands on the cancel button by default, so Enter does not destroy.
 */
export interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  /** What will happen, in plain language. */
  description?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** `destructive` for irreversible actions, `default` for routine confirmations. */
  tone?: 'destructive' | 'default';
  onConfirm: () => void | Promise<void>;
  /** When set, the user must type this exact string to enable the button. */
  requireTypedConfirmation?: string;
  /** Set while the confirm action is in flight. */
  busy?: boolean;
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  tone = 'destructive',
  onConfirm,
  requireTypedConfirmation,
  busy = false,
}: ConfirmDialogProps) {
  const [typed, setTyped] = React.useState('');

  // Reset the typed value whenever the dialog closes, so a previous entry
  // cannot satisfy the check the next time it opens. Adjusting state during
  // render on the open transition is the React-endorsed replacement for the
  // effect that used to do this.
  const [wasOpen, setWasOpen] = React.useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (!open) setTyped('');
  }

  const phraseOk =
    !requireTypedConfirmation || typed.trim() === requireTypedConfirmation.trim();
  const canConfirm = phraseOk && !busy;

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="border-white/10 bg-slate-900 text-white">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-white">{title}</AlertDialogTitle>
          {/*
            Radix requires a description for the dialog to be announced
            correctly, and warns loudly without one. That warning is a real
            accessibility defect, not noise: an undescribed dialog leaves a
            screen reader user with a title and no idea what they are agreeing
            to. So a description is always rendered — visually hidden when the
            caller supplied none, rather than silently omitted.
          */}
          <AlertDialogDescription className={description ? 'text-slate-400' : 'sr-only'}>
            {description ?? 'Review this action before confirming.'}
          </AlertDialogDescription>
        </AlertDialogHeader>

        {requireTypedConfirmation ? (
          <div className="space-y-2">
            <label htmlFor="confirm-phrase" className="block text-sm text-slate-300">
              Type <span className="font-mono font-medium text-white">{requireTypedConfirmation}</span> to
              confirm
            </label>
            <input
              id="confirm-phrase"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              autoComplete="off"
              className="w-full rounded-md border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-sky-400/50 focus:outline-none"
              placeholder={requireTypedConfirmation}
            />
          </div>
        ) : null}

        <AlertDialogFooter>
          <AlertDialogCancel
            className="border-white/15 bg-white/5 text-white hover:bg-white/10"
            disabled={busy}
          >
            {cancelLabel}
          </AlertDialogCancel>
          <AlertDialogAction
            className={cn(
              tone === 'destructive'
                ? 'bg-red-500 text-white hover:bg-red-400'
                : 'bg-sky-500 text-white hover:bg-sky-400',
              !canConfirm && 'pointer-events-none opacity-50',
            )}
            disabled={!canConfirm}
            onClick={(e) => {
              // The primitive closes the dialog on click; keep it open while
              // the action runs so the user cannot click twice.
              if (busy) {
                e.preventDefault();
                return;
              }
              e.preventDefault();
              void onConfirm();
            }}
          >
            {busy ? 'Working…' : confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

ConfirmDialog.displayName = 'ConfirmDialog';
