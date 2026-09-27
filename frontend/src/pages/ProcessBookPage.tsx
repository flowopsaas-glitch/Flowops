import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  FileCheck2,
  Loader2,
  Play,
  RefreshCw,
  ShieldAlert,
  Sparkles,
} from 'lucide-react';
import { processControlApi, type ProcessAuditEvent, type ProcessBookEntry, type ProcessIncident, type ProcessInstance, type ProcessInstanceDetail } from '../api/processControl';

/**
 * Process Book — the versioned standards an operation actually runs on, plus
 * the evidence of what happened when they ran.
 *
 * Honesty rules this page follows:
 *   • a standard is only shown as executable when a version is PILOT/APPROVED;
 *   • evidence and incidents are shown as records, not as green ticks;
 *   • "first time right" is only claimed when the execution recorded it.
 */

const STATUS_STYLES: Record<string, string> = {
  DRAFT: 'bg-slate-500/10 text-slate-300 border-slate-500/30',
  PILOT: 'bg-amber-500/10 text-amber-300 border-amber-500/30',
  APPROVED: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30',
  RETIRED: 'bg-slate-700/20 text-slate-400 border-slate-600/30',
  IN_PROGRESS: 'bg-sky-500/10 text-sky-300 border-sky-500/30',
  BLOCKED: 'bg-red-500/10 text-red-300 border-red-500/30',
  COMPLETED: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30',
  COMPLETED_WITH_EXCEPTIONS: 'bg-amber-500/10 text-amber-300 border-amber-500/30',
  ABANDONED: 'bg-slate-700/20 text-slate-400 border-slate-600/30',
  FAILED: 'bg-red-500/10 text-red-300 border-red-500/30',
  OPEN: 'bg-red-500/10 text-red-300 border-red-500/30',
  INVESTIGATING: 'bg-amber-500/10 text-amber-300 border-amber-500/30',
  ESCALATED: 'bg-fuchsia-500/10 text-fuchsia-300 border-fuchsia-500/30',
  RESOLVED: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30',
  BLOCKING: 'bg-red-500/10 text-red-300 border-red-500/30',
  CRITICAL: 'bg-red-500/10 text-red-300 border-red-500/30',
  MAJOR: 'bg-amber-500/10 text-amber-300 border-amber-500/30',
  MINOR: 'bg-slate-500/10 text-slate-300 border-slate-500/30',
};

function Badge({ value }: { value?: string | null }) {
  if (!value) return null;
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium tracking-wide ${STATUS_STYLES[value] ?? STATUS_STYLES.DRAFT}`}>
      {value.replace(/_/g, ' ')}
    </span>
  );
}

function formatDateTime(value?: string | null) {
  if (!value) return '—';
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}

export default function ProcessBookPage() {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [book, setBook] = useState<ProcessBookEntry[]>([]);
  const [instances, setInstances] = useState<ProcessInstance[]>([]);
  const [incidents, setIncidents] = useState<ProcessIncident[]>([]);
  const [selectedInstance, setSelectedInstance] = useState<ProcessInstanceDetail | null>(null);
  const [audit, setAudit] = useState<ProcessAuditEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { enabled: isEnabled } = await processControlApi.isEnabled();
      setEnabled(isEnabled);
      if (!isEnabled) {
        setBook([]);
        setInstances([]);
        setIncidents([]);
        return;
      }
      const [bookData, instanceData, incidentData, auditData] = await Promise.all([
        processControlApi.getBook(),
        processControlApi.listInstances(),
        processControlApi.listIncidents(),
        processControlApi.listAudit(),
      ]);
      setBook(bookData);
      setInstances(instanceData);
      setIncidents(incidentData);
      setAudit(auditData);
    } catch (err: any) {
      setError(err?.response?.data?.message ?? err?.message ?? 'Could not load the Process Book');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const openIncidents = useMemo(
    () => incidents.filter((i) => i.status !== 'RESOLVED'),
    [incidents],
  );

  const blockedInstances = useMemo(
    () => instances.filter((i) => i.status === 'BLOCKED'),
    [instances],
  );

  async function run(action: string, fn: () => Promise<unknown>, successMessage?: string) {
    setBusy(action);
    setError(null);
    setNotice(null);
    try {
      await fn();
      if (successMessage) setNotice(successMessage);
      await load();
    } catch (err: any) {
      setError(err?.response?.data?.message ?? err?.message ?? 'Action failed');
    } finally {
      setBusy(null);
    }
  }

  async function openInstance(id: string) {
    setBusy(`instance-${id}`);
    setError(null);
    try {
      setSelectedInstance(await processControlApi.getInstance(id));
    } catch (err: any) {
      setError(err?.response?.data?.message ?? 'Could not load the instance');
    } finally {
      setBusy(null);
    }
  }

  if (loading && enabled === null) {
    return (
      <div className="flex items-center justify-center h-64 text-slate-400">
        <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading Process Book…
      </div>
    );
  }

  if (enabled === false) {
    return (
      <div className="p-6 max-w-3xl">
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-5 text-amber-200">
          <div className="flex items-center gap-2 font-semibold">
            <ShieldAlert className="h-5 w-5" /> Process Control is switched off
          </div>
          <p className="mt-2 text-sm text-amber-100/80">
            This capability ships disabled. Nothing is executed, recorded or shown until it is
            enabled for this environment with <code className="text-amber-200">PROCESS_CONTROL_ENABLED=true</code>{' '}
            (and, for the goods-receipt bridge, <code className="text-amber-200">PROCESS_CONTROL_WMS_RECEIPT_ENABLED=true</code>).
            It also stays off in production until the production gates are signed off.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold text-slate-100">
            <BookOpen className="h-6 w-6 text-sky-400" /> Process Book
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            Versioned standards, the evidence each execution produced, and the exceptions that are still owned.
          </p>
        </div>
        <button
          onClick={() => void load()}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-300 hover:bg-slate-800/60"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </header>

      {(error || notice) && (
        <div
          className={`rounded-lg border p-3 text-sm ${
            error ? 'border-red-500/30 bg-red-500/10 text-red-200' : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
          }`}
        >
          {error ?? notice}
        </div>
      )}

      <section className="grid gap-4 md:grid-cols-3">
        <StatCard label="Standards" value={book.length} hint="Definitions in this tenant" />
        <StatCard
          label="Executions in flight"
          value={instances.filter((i) => i.status === 'IN_PROGRESS').length}
          hint={`${blockedInstances.length} blocked`}
          tone={blockedInstances.length > 0 ? 'warn' : 'default'}
        />
        <StatCard
          label="Open exceptions"
          value={openIncidents.length}
          hint={`${openIncidents.filter((i) => i.isBlocking).length} blocking`}
          tone={openIncidents.some((i) => i.isBlocking) ? 'danger' : 'default'}
        />
      </section>

      <section className="rounded-xl border border-slate-800 bg-slate-900/40">
        <div className="flex items-center gap-2 border-b border-slate-800 px-4 py-3 text-sm font-medium text-slate-200">
          <ClipboardList className="h-4 w-4 text-sky-400" /> Standards
        </div>
        {book.length === 0 ? (
          <p className="p-4 text-sm text-slate-400">
            No standards yet. They are created through the API (or auto-provisioned by the goods-receipt
            bridge when it is enabled), never invented here.
          </p>
        ) : (
          <div className="divide-y divide-slate-800">
            {book.map((definition) => {
              const executable =
                definition.currentVersion &&
                ['PILOT', 'APPROVED'].includes(definition.currentVersion.status);
              return (
                <div key={definition.id} className="p-4 space-y-3">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="font-mono text-xs text-slate-400">{definition.code}</span>
                    <span className="text-sm font-medium text-slate-100">{definition.name}</span>
                    <Badge value={definition.currentVersion?.status ?? 'DRAFT'} />
                    {definition.currentVersion && (
                      <span className="text-xs text-slate-500">
                        v{definition.currentVersion.versionNumber} · hash{' '}
                        {definition.currentVersion.contentHash.slice(0, 10)}…
                      </span>
                    )}
                  </div>

                  {definition.description && (
                    <p className="text-sm text-slate-400">{definition.description}</p>
                  )}

                  <div className="flex flex-wrap items-center gap-4 text-xs text-slate-400">
                    <span>In progress: {definition.execution?.inProgress ?? 0}</span>
                    <span className={definition.execution?.blocked ? 'text-red-300' : ''}>
                      Blocked: {definition.execution?.blocked ?? 0}
                    </span>
                    <span>Completed: {definition.execution?.completed ?? 0}</span>
                    <span>Versions: {definition.versions?.length ?? 0}</span>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {definition.currentVersion && definition.currentVersion.status === 'DRAFT' && (
                      <button
                        disabled={busy === `pilot-${definition.currentVersion.id}`}
                        onClick={() =>
                          run(
                            `pilot-${definition.currentVersion!.id}`,
                            () => processControlApi.transitionVersion(definition.currentVersion!.id, 'PILOT'),
                            'Version moved to pilot',
                          )
                        }
                        className="inline-flex items-center gap-1.5 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-xs text-amber-200 hover:bg-amber-500/20"
                      >
                        <Play className="h-3.5 w-3.5" /> Start pilot
                      </button>
                    )}

                    {definition.currentVersion && definition.currentVersion.status === 'PILOT' && (
                      <button
                        disabled={busy === `approve-${definition.currentVersion.id}`}
                        onClick={() =>
                          run(
                            `approve-${definition.currentVersion!.id}`,
                            () => processControlApi.transitionVersion(definition.currentVersion!.id, 'APPROVED', 'Approved in the Process Book'),
                            'Version approved — it is now immutable',
                          )
                        }
                        className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-1.5 text-xs text-emerald-200 hover:bg-emerald-500/20"
                      >
                        <FileCheck2 className="h-3.5 w-3.5" /> Approve standard
                      </button>
                    )}

                    {executable && (
                      <button
                        disabled={busy === `start-${definition.id}`}
                        onClick={() =>
                          run(
                            `start-${definition.id}`,
                            () => {
                              const key = `${definition.code}:${new Date().toISOString().slice(0, 19)}`;
                              return processControlApi.startInstance({
                                definitionId: definition.id,
                                businessKey: key,
                                context: { startedFrom: 'process-book-ui' },
                              });
                            },
                            'Execution started — replays of the same key return the same instance',
                          )
                        }
                        className="inline-flex items-center gap-1.5 rounded-lg border border-sky-500/40 bg-sky-500/10 px-3 py-1.5 text-xs text-sky-200 hover:bg-sky-500/20"
                      >
                        <Sparkles className="h-3.5 w-3.5" /> Start a controlled run
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="rounded-xl border border-slate-800 bg-slate-900/40">
        <div className="flex items-center gap-2 border-b border-slate-800 px-4 py-3 text-sm font-medium text-slate-200">
          <Play className="h-4 w-4 text-sky-400" /> Executions
        </div>
        {instances.length === 0 ? (
          <p className="p-4 text-sm text-slate-400">No executions recorded yet.</p>
        ) : (
          <div className="divide-y divide-slate-800">
            {instances.slice(0, 25).map((instance) => (
              <button
                key={instance.id}
                onClick={() => void openInstance(instance.id)}
                className="flex w-full flex-wrap items-center gap-3 px-4 py-3 text-left hover:bg-slate-800/40"
              >
                <Badge value={instance.status} />
                <span className="font-mono text-xs text-slate-300">{instance.businessKey}</span>
                <span className="text-xs text-slate-500">{instance.definition?.code}</span>
                <span className="text-xs text-slate-400">
                  current: {instance.currentStep?.code ?? '—'}
                </span>
                <span className="text-xs text-slate-500">incidents: {instance._count?.incidents ?? 0}</span>
                <span className="text-xs text-slate-500">started {formatDateTime(instance.startedAt)}</span>
                {busy === `instance-${instance.id}` ? (
                  <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
                ) : (
                  <ChevronRight className="ml-auto h-4 w-4 text-slate-500" />
                )}
              </button>
            ))}
          </div>
        )}
      </section>

      {openIncidents.length > 0 && (
        <section className="rounded-xl border border-slate-800 bg-slate-900/40">
          <div className="flex items-center gap-2 border-b border-slate-800 px-4 py-3 text-sm font-medium text-slate-200">
            <AlertTriangle className="h-4 w-4 text-amber-400" /> Exceptions that are still owned
          </div>
          <div className="divide-y divide-slate-800">
            {openIncidents.map((incident) => (
              <div key={incident.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <Badge value={incident.severity} />
                {incident.isBlocking && <Badge value="BLOCKING" />}
                <span className="font-mono text-xs text-slate-300">{incident.code}</span>
                <span className="text-sm text-slate-200">{incident.name}</span>
                <span className="text-xs text-slate-500">{incident.instance?.businessKey}</span>
                <button
                  disabled={busy === `resolve-${incident.id}`}
                  onClick={() =>
                    run(
                      `resolve-${incident.id}`,
                      () =>
                        processControlApi.resolveIncident(incident.id, {
                          resolution: 'Resolved from the Process Book',
                        }),
                      'Exception resolved — the process can continue',
                    )
                  }
                  className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-1.5 text-xs text-emerald-200 hover:bg-emerald-500/20"
                >
                  <CheckCircle2 className="h-3.5 w-3.5" /> Resolve
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {selectedInstance && (
        <section className="rounded-xl border border-slate-800 bg-slate-900/40">
          <div className="flex items-center gap-2 border-b border-slate-800 px-4 py-3 text-sm font-medium text-slate-200">
            <ClipboardList className="h-4 w-4 text-sky-400" /> Execution {selectedInstance.businessKey}
            <button
              onClick={() => setSelectedInstance(null)}
              className="ml-auto text-xs text-slate-400 hover:text-slate-200"
            >
              Close
            </button>
          </div>
          <div className="grid gap-4 p-4 md:grid-cols-2">
            <div>
              <h3 className="text-xs uppercase tracking-wide text-slate-500">Steps</h3>
              <ol className="mt-2 space-y-2">
                {selectedInstance.stepInstances.map((step) => (
                  <li key={step.id} className="rounded-lg border border-slate-800 bg-slate-950/40 p-3">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-500">#{step.stepNumber}</span>
                      <span className="font-mono text-xs text-slate-300">{step.code}</span>
                      <Badge value={step.status} />
                      {step.attempt > 1 && <span className="text-[11px] text-amber-300">attempt {step.attempt}</span>}
                    </div>
                    <p className="mt-1 text-xs text-slate-400">
                      {step.executedByName ? `by ${step.executedByName} · ` : ''}
                      {formatDateTime(step.completedAt ?? step.startedAt)}
                    </p>
                    {step.evidence && (
                      <pre className="mt-2 overflow-x-auto rounded bg-slate-950/60 p-2 text-[11px] text-slate-400">
                        {JSON.stringify(step.evidence, null, 2)}
                      </pre>
                    )}
                  </li>
                ))}
              </ol>
            </div>
            <div className="space-y-4">
              <div>
                <h3 className="text-xs uppercase tracking-wide text-slate-500">Exceptions</h3>
                {selectedInstance.incidents.length === 0 ? (
                  <p className="mt-2 text-xs text-slate-400">No exceptions recorded for this execution.</p>
                ) : (
                  <ul className="mt-2 space-y-2">
                    {selectedInstance.incidents.map((incident) => (
                      <li key={incident.id} className="rounded-lg border border-slate-800 bg-slate-950/40 p-3 text-xs text-slate-300">
                        <div className="flex items-center gap-2">
                          <Badge value={incident.severity} />
                          <span className="font-mono">{incident.code}</span>
                          <Badge value={incident.status} />
                        </div>
                        <p className="mt-1 text-slate-400">{incident.description ?? incident.name}</p>
                        {incident.resolution && (
                          <p className="mt-1 text-emerald-300">Resolved: {incident.resolution}</p>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div>
                <h3 className="text-xs uppercase tracking-wide text-slate-500">Audit trail</h3>
                <ul className="mt-2 space-y-1">
                  {selectedInstance.auditEvents.slice(0, 12).map((event) => (
                    <li key={event.id} className="text-xs text-slate-400">
                      <span className="text-slate-500">{formatDateTime(event.createdAt)}</span>{' '}
                      <span className="font-mono text-slate-300">{event.eventType}</span> — {event.description}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </section>
      )}

      <section className="rounded-xl border border-slate-800 bg-slate-900/40">
        <div className="flex items-center gap-2 border-b border-slate-800 px-4 py-3 text-sm font-medium text-slate-200">
          <ShieldAlert className="h-4 w-4 text-slate-400" /> Recent audit events
        </div>
        {audit.length === 0 ? (
          <p className="p-4 text-sm text-slate-400">Nothing recorded yet.</p>
        ) : (
          <ul className="divide-y divide-slate-800">
            {audit.slice(0, 15).map((event) => (
              <li key={event.id} className="flex flex-wrap items-center gap-2 px-4 py-2 text-xs text-slate-400">
                <span className="text-slate-500">{formatDateTime(event.createdAt)}</span>
                <span className="font-mono text-slate-300">{event.eventType}</span>
                <span>{event.description}</span>
                <span className="ml-auto text-slate-500">{event.actorName ?? event.actorId}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function StatCard({
  label,
  value,
  hint,
  tone = 'default',
}: {
  label: string;
  value: number;
  hint?: string;
  tone?: 'default' | 'warn' | 'danger';
}) {
  const toneClass =
    tone === 'danger' ? 'text-red-300' : tone === 'warn' ? 'text-amber-300' : 'text-slate-100';
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-1 text-2xl font-semibold ${toneClass}`}>{value}</p>
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}
