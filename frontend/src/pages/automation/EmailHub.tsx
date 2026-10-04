import React, { useEffect, useMemo, useState } from "react";
import {
  Mail,
  Package,
  FileText,
  Bot,
  Bell,
  MessageSquare,
  ArrowUpRight,
  ShieldAlert,
  ShieldCheck,
  AlertTriangle,
  Paperclip,
  Send,
  X,
  Plus,
  Loader2,
  RefreshCw,
  Search,
  CheckCheck,
  Sparkles,
} from "lucide-react";
import {
  EmailHubAttachment,
  EmailHubItem,
  EmailHubPriority,
  EmailHubStatus,
  EmailHubType,
  getEmailHubItems,
  getEmailHubStats,
  markEmailHubRead,
  resolveEmailHubItem,
  seedEmailHubDemo,
  sendEmailHub,
  updateEmailHubItem,
} from "../../api/emailHubApi";

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function getErrorMessage(error: unknown): string {
  if (
    typeof error === "object" &&
    error !== null &&
    "response" in error &&
    typeof (error as { response?: unknown }).response === "object" &&
    (error as { response?: { data?: unknown } }).response?.data
  ) {
    const data = (error as { response?: { data?: unknown } }).response?.data as
      | { message?: string | string[]; error?: string }
      | string;

    if (typeof data === "string" && data.trim()) return data;
    if (data && typeof data === "object") {
      if (Array.isArray(data.message) && data.message.length > 0) {
        return data.message.join(", ");
      }
      if (typeof data.message === "string" && data.message.trim()) {
        return data.message;
      }
      if (typeof data.error === "string" && data.error.trim()) {
        return data.error;
      }
    }
  }

  if (error instanceof Error && error.message.trim()) return error.message;
  return "Something went wrong.";
}

function typeTone(type: EmailHubType) {
  switch (type) {
    case "COLLECTION_REQUEST":
      return "bg-cyan-500/15 text-cyan-200 border-cyan-400/20";
    case "POD":
      return "bg-emerald-500/15 text-emerald-200 border-emerald-400/20";
    case "QUOTE":
      return "bg-violet-500/15 text-violet-200 border-violet-400/20";
    case "FEEDBACK":
      return "bg-amber-500/15 text-amber-200 border-amber-400/20";
    case "NOTIFICATION":
      return "bg-sky-500/15 text-sky-200 border-sky-400/20";
    case "AI_MONITOR":
      return "bg-fuchsia-500/15 text-fuchsia-200 border-fuchsia-400/20";
    default:
      return "bg-white/10 text-white/75 border-white/10";
  }
}

function priorityTone(priority: EmailHubPriority) {
  switch (priority) {
    case "CRITICAL":
      return "bg-red-500/15 text-red-200 border-red-400/20";
    case "HIGH":
      return "bg-amber-500/15 text-amber-200 border-amber-400/20";
    case "MEDIUM":
      return "bg-blue-500/15 text-blue-200 border-blue-400/20";
    default:
      return "bg-white/10 text-white/75 border-white/10";
  }
}

function formatType(value: EmailHubType) {
  return value.replaceAll("_", " ");
}

export default function EmailHub() {
  const [items, setItems] = useState<EmailHubItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState<{
    total: number;
    unread: number;
    needsOpsAction: number;
    critical: number;
  }>({
    total: 0,
    unread: 0,
    needsOpsAction: 0,
    critical: 0,
  });
  const [search, setSearch] = useState("");
  const [type, setType] = useState<EmailHubType | "">("");
  const [status, setStatus] = useState<EmailHubStatus | "">("");
  const [priority, setPriority] = useState<EmailHubPriority | "">("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [opsNote, setOpsNote] = useState("");
  const [pageError, setPageError] = useState("");
  const [savingNote, setSavingNote] = useState(false);
  const [seeding, setSeeding] = useState(false);

  // Compose
  const [composeOpen, setComposeOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [composeError, setComposeError] = useState("");
  const [composeForm, setComposeForm] = useState({ to: "", subject: "", body: "" });
  const [composeFiles, setComposeFiles] = useState<File[]>([]);

  const selectedItem = useMemo(
    () => items.find((item) => item.id === selectedId) ?? items[0] ?? null,
    [items, selectedId]
  );

  async function loadAll() {
    setLoading(true);
    setPageError("");

    try {
      const [rows, statsData] = await Promise.all([
        getEmailHubItems({ search, type, status, priority }),
        getEmailHubStats(),
      ]);

      setItems(rows);
      setStats({
        total: statsData.total,
        unread: statsData.unread,
        needsOpsAction: statsData.needsOpsAction,
        critical: statsData.critical,
      });

      if (rows.length > 0) {
        setSelectedId((current) => current ?? rows[0].id);
      } else {
        setSelectedId(null);
      }
    } catch (error) {
      setItems([]);
      setPageError(getErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAll();
  }, []);

  useEffect(() => {
    if (selectedItem) {
      setOpsNote(selectedItem.opsNote ?? "");
    } else {
      setOpsNote("");
    }
  }, [selectedItem]);

  async function handleRefresh() {
    await loadAll();
  }

  async function handleMarkRead(id: string) {
    try {
      await markEmailHubRead(id);
      await loadAll();
    } catch (error) {
      setPageError(getErrorMessage(error));
    }
  }

  async function handleResolve(id: string) {
    try {
      await resolveEmailHubItem(id);
      await loadAll();
    } catch (error) {
      setPageError(getErrorMessage(error));
    }
  }

  async function handleSend() {
    setComposeError("");
    if (!composeForm.to.trim() || !composeForm.subject.trim()) {
      setComposeError("Recipient and subject are required.");
      return;
    }
    setSending(true);
    try {
      const result = await sendEmailHub(
        { to: composeForm.to.trim(), subject: composeForm.subject.trim(), body: composeForm.body },
        composeFiles
      );
      setComposeOpen(false);
      setComposeForm({ to: "", subject: "", body: "" });
      setComposeFiles([]);
      await loadAll();
      if (result?.id) setSelectedId(result.id);
    } catch (error) {
      setComposeError(getErrorMessage(error));
    } finally {
      setSending(false);
    }
  }

  async function handleSaveNote() {
    if (!selectedItem) return;

    setSavingNote(true);
    setPageError("");

    try {
      await updateEmailHubItem(selectedItem.id, { opsNote });
      await loadAll();
    } catch (error) {
      setPageError(getErrorMessage(error));
    } finally {
      setSavingNote(false);
    }
  }

  async function handleSeedDemo() {
    setSeeding(true);
    setPageError("");

    try {
      await seedEmailHubDemo();
      await loadAll();
    } catch (error) {
      setPageError(getErrorMessage(error));
    } finally {
      setSeeding(false);
    }
  }

  return (
    <div className="min-h-full bg-[radial-gradient(circle_at_top,rgba(59,130,246,0.14),transparent_30%),linear-gradient(180deg,#07111f_0%,#0b1530_55%,#0e1b3f_100%)] p-6 sm:p-8 text-white">
      <div className="mx-auto max-w-7xl space-y-5">
        <div className="rounded-[30px] border border-white/10 bg-white/6 p-6 shadow-[0_20px_80px_rgba(0,0,0,0.35)] backdrop-blur-2xl">
          <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-white/85 ring-1 ring-white/15">
            <Mail className="h-4 w-4" />
            Ops email command center
          </div>

          <div className="mt-4 flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <h1 className="text-3xl font-black tracking-tight sm:text-4xl">
                Email Hub
              </h1>
              <p className="mt-2 max-w-4xl text-sm text-white/72">
                Receive and process collection requests, POD emails, quote requests,
                client feedback, AI-monitored inbox events, and operational email alerts.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => {
                  setComposeError("");
                  setComposeOpen(true);
                }}
                className="inline-flex items-center gap-2 rounded-2xl bg-blue-500/90 px-4 py-3 text-sm font-bold text-white ring-1 ring-white/15 transition hover:bg-blue-500"
              >
                <Send className="h-4 w-4" />
                Compose
              </button>

              <button
                type="button"
                onClick={handleSeedDemo}
                disabled={seeding}
                className={cn(
                  "inline-flex items-center gap-2 rounded-2xl px-4 py-3 text-sm font-bold ring-1 ring-white/15 transition",
                  seeding
                    ? "cursor-not-allowed bg-white/10 text-white/55"
                    : "bg-fuchsia-500/80 text-white hover:bg-fuchsia-500"
                )}
              >
                <Sparkles className="h-4 w-4" />
                {seeding ? "Seeding..." : "Seed Demo Inbox"}
              </button>

              <button
                type="button"
                onClick={handleRefresh}
                disabled={loading}
                className={cn(
                  "inline-flex items-center gap-2 rounded-2xl px-4 py-3 text-sm font-bold ring-1 ring-white/15 transition",
                  loading
                    ? "cursor-not-allowed bg-white/10 text-white/55"
                    : "bg-white/10 text-white hover:bg-white/15"
                )}
              >
                <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
                {loading ? "Refreshing..." : "Refresh"}
              </button>
            </div>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-4">
            <StatCard title="Total Email Items" value={String(stats.total)} icon={Mail} />
            <StatCard title="Unread" value={String(stats.unread)} icon={Bell} />
            <StatCard title="Needs Ops Action" value={String(stats.needsOpsAction)} icon={ShieldAlert} />
            <StatCard title="Critical" value={String(stats.critical)} icon={Bot} />
          </div>
        </div>

        <div className="rounded-[24px] border border-white/10 bg-white/6 p-4 backdrop-blur-2xl">
          <div className="grid gap-3 xl:grid-cols-[1.2fr_repeat(3,180px)]">
            <div className="relative">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-white/50" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search subject, sender, body, POD, or waybill..."
                className="w-full rounded-2xl border border-white/10 bg-white/8 py-3 pl-11 pr-4 text-sm text-white placeholder:text-white/45 outline-none transition focus:border-blue-400/40"
              />
            </div>

            <select
              value={type}
              onChange={(e) => setType(e.target.value as EmailHubType | "")}
              className="rounded-2xl border border-white/10 bg-white/8 px-4 py-3 text-sm text-white outline-none"
            >
              <option value="">All types</option>
              <option value="COLLECTION_REQUEST">Collection Request</option>
              <option value="POD">POD</option>
              <option value="QUOTE">Quote</option>
              <option value="FEEDBACK">Feedback</option>
              <option value="NOTIFICATION">Notification</option>
              <option value="AI_MONITOR">AI Monitor</option>
              <option value="GENERAL">General</option>
            </select>

            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as EmailHubStatus | "")}
              className="rounded-2xl border border-white/10 bg-white/8 px-4 py-3 text-sm text-white outline-none"
            >
              <option value="">All status</option>
              <option value="NEW">New</option>
              <option value="TRIAGED">Triaged</option>
              <option value="IN_PROGRESS">In Progress</option>
              <option value="WAITING">Waiting</option>
              <option value="RESOLVED">Resolved</option>
              <option value="ARCHIVED">Archived</option>
            </select>

            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value as EmailHubPriority | "")}
              className="rounded-2xl border border-white/10 bg-white/8 px-4 py-3 text-sm text-white outline-none"
            >
              <option value="">All priority</option>
              <option value="LOW">Low</option>
              <option value="MEDIUM">Medium</option>
              <option value="HIGH">High</option>
              <option value="CRITICAL">Critical</option>
            </select>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={loadAll}
              className="rounded-2xl border border-blue-400/20 bg-blue-500/80 px-4 py-2 text-sm font-bold text-white transition hover:bg-blue-500"
            >
              Apply Filters
            </button>
            <button
              type="button"
              onClick={() => {
                setSearch("");
                setType("");
                setStatus("");
                setPriority("");
              }}
              className="rounded-2xl border border-white/10 bg-white/10 px-4 py-2 text-sm font-bold text-white transition hover:bg-white/15"
            >
              Reset
            </button>
          </div>

          {pageError ? (
            <div className="mt-4 rounded-2xl border border-red-400/20 bg-red-500/10 p-4 text-sm text-red-100">
              {pageError}
            </div>
          ) : null}
        </div>

        <div className="grid gap-5 xl:grid-cols-[1.05fr_0.95fr]">
          <div className="space-y-4">
            {loading ? (
              <div className="rounded-[24px] border border-white/10 bg-white/6 p-10 text-center text-sm text-white/75">
                Loading Email Hub...
              </div>
            ) : items.length === 0 ? (
              <div className="rounded-[24px] border border-dashed border-white/10 bg-white/6 p-10 text-center">
                <div className="text-lg font-extrabold text-white">No email items found</div>
                <div className="mt-2 text-sm text-white/65">
                  Seed demo inbox or adjust your filters.
                </div>
              </div>
            ) : (
              items.map((item) => {
                const selected = selectedItem?.id === item.id;

                return (
                  // 🚀 FIXED: Swapped <button> to <div> to avoid nested button error
                  <div
                    key={item.id}
                    onClick={() => setSelectedId(item.id)}
                    className={cn(
                      "w-full cursor-pointer rounded-[24px] border p-5 text-left backdrop-blur-2xl transition",
                      selected
                        ? "border-blue-400/30 bg-blue-500/10 shadow-[0_0_22px_rgba(59,130,246,0.18)]"
                        : "border-white/10 bg-white/6 hover:bg-white/8"
                    )}
                  >
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap gap-2">
                          <span className={cn("rounded-full border px-2.5 py-1 text-[10px] font-extrabold", typeTone(item.type))}>
                            {formatType(item.type)}
                          </span>
                          <span className={cn("rounded-full border px-2.5 py-1 text-[10px] font-extrabold", priorityTone(item.priority))}>
                            {item.priority}
                          </span>
                          {!item.isRead ? (
                            <span className="rounded-full border border-cyan-400/20 bg-cyan-500/15 px-2.5 py-1 text-[10px] font-extrabold text-cyan-200">
                              UNREAD
                            </span>
                          ) : null}
                        </div>

                        <div className="mt-3 text-lg font-extrabold text-white">
                          {item.subject}
                        </div>

                        <div className="mt-1 text-sm text-white/65">
                          {item.senderName ? `${item.senderName} · ` : ""}
                          {item.senderEmail}
                        </div>

                        <div className="mt-3 line-clamp-2 text-sm leading-6 text-white/72">
                          {item.body}
                        </div>

                        <div className="mt-3 flex flex-wrap gap-3 text-xs text-white/45">
                          <span>Status: {item.status}</span>
                          {item.waybillNumber ? <span>Waybill: {item.waybillNumber}</span> : null}
                          {item.podNumber ? <span>POD: {item.podNumber}</span> : null}
                          {item.collection ? <span>Collection: #{item.collection.id}</span> : null}
                          {item.client ? <span>Client: {item.client.name}</span> : null}
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleMarkRead(item.id);
                          }}
                          className="rounded-2xl border border-white/10 bg-white/10 px-3 py-2 text-xs font-bold text-white transition hover:bg-white/15"
                        >
                          Mark Read
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleResolve(item.id);
                          }}
                          className="rounded-2xl border border-emerald-400/20 bg-emerald-500/15 px-3 py-2 text-xs font-bold text-emerald-200 transition hover:bg-emerald-500/20"
                        >
                          Resolve
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          <div className="rounded-[28px] border border-white/10 bg-white/6 p-5 backdrop-blur-2xl">
            {!selectedItem ? (
              <div className="text-sm text-white/65">Select an email item to inspect details.</div>
            ) : (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <span className={cn("rounded-full border px-2.5 py-1 text-[10px] font-extrabold", typeTone(selectedItem.type))}>
                    {formatType(selectedItem.type)}
                  </span>
                  <span className={cn("rounded-full border px-2.5 py-1 text-[10px] font-extrabold", priorityTone(selectedItem.priority))}>
                    {selectedItem.priority}
                  </span>
                  <span className="rounded-full border border-white/10 bg-white/10 px-2.5 py-1 text-[10px] font-extrabold text-white/80">
                    {selectedItem.status}
                  </span>
                </div>

                <h2 className="mt-4 text-2xl font-black tracking-tight text-white">
                  {selectedItem.subject}
                </h2>

                <div className="mt-2 text-sm text-white/65">
                  {selectedItem.senderName ? `${selectedItem.senderName} · ` : ""}
                  {selectedItem.senderEmail}
                </div>

                <div className="mt-5 rounded-[22px] border border-white/10 bg-black/20 p-4">
                  <div className="text-xs font-extrabold uppercase tracking-[0.16em] text-slate-400">
                    Email body
                  </div>
                  <div className="mt-3 whitespace-pre-wrap text-sm leading-6 text-white/80">
                    {selectedItem.body}
                  </div>
                </div>

                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <InfoCard title="Waybill" value={selectedItem.waybillNumber ?? "—"} />
                  <InfoCard title="POD" value={selectedItem.podNumber ?? "—"} />
                  <InfoCard title="Company" value={selectedItem.company?.name ?? "—"} />
                  <InfoCard title="Client" value={selectedItem.client?.name ?? "—"} />
                </div>

                <div className="mt-4 rounded-[22px] border border-fuchsia-400/15 bg-fuchsia-500/10 p-4">
                  <div className="flex items-center gap-2 text-sm font-extrabold text-fuchsia-200">
                    <Bot className="h-4 w-4" />
                    AI monitoring
                  </div>
                  <div className="mt-3 space-y-2 text-sm text-fuchsia-100/90">
                    <div><span className="font-bold">Summary:</span> {selectedItem.aiSummary ?? "—"}</div>
                    <div><span className="font-bold">Category:</span> {selectedItem.aiCategory ?? "—"}</div>
                    <div><span className="font-bold">Suggested action:</span> {selectedItem.aiSuggestedAction ?? "—"}</div>
                    <div><span className="font-bold">Confidence:</span> {selectedItem.aiConfidence ?? "—"}</div>
                  </div>
                </div>

                {selectedItem.attachments && selectedItem.attachments.length > 0 ? (
                  <AttachmentsPanel attachments={selectedItem.attachments} />
                ) : null}

                <div className="mt-4 rounded-[22px] border border-white/10 bg-black/20 p-4">
                  <div className="text-sm font-extrabold text-white">Ops note</div>
                  <textarea
                    value={opsNote}
                    onChange={(e) => setOpsNote(e.target.value)}
                    rows={5}
                    className="mt-3 w-full rounded-2xl border border-white/10 bg-white/8 px-4 py-3 text-sm text-white outline-none placeholder:text-white/40"
                    placeholder="Add operational notes, triage instructions, or next-step commentary..."
                  />

                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={handleSaveNote}
                      disabled={savingNote}
                      className={cn(
                        "inline-flex items-center gap-2 rounded-2xl px-4 py-3 text-sm font-bold ring-1 ring-white/15 transition",
                        savingNote
                          ? "cursor-not-allowed bg-white/10 text-white/55"
                          : "bg-blue-500/80 text-white hover:bg-blue-500"
                      )}
                    >
                      <CheckCheck className="h-4 w-4" />
                      {savingNote ? "Saving..." : "Save Note"}
                    </button>

                    <button
                      type="button"
                      onClick={() => handleMarkRead(selectedItem.id)}
                      className="rounded-2xl border border-white/10 bg-white/10 px-4 py-3 text-sm font-bold text-white transition hover:bg-white/15"
                    >
                      Mark Read
                    </button>

                    <button
                      type="button"
                      onClick={() => handleResolve(selectedItem.id)}
                      className="rounded-2xl border border-emerald-400/20 bg-emerald-500/15 px-4 py-3 text-sm font-bold text-emerald-200 transition hover:bg-emerald-500/20"
                    >
                      Resolve Item
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {composeOpen ? (
        <div
          className="fixed inset-0 z-[120] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
          onClick={() => !sending && setComposeOpen(false)}
        >
          <div
            className="w-full max-w-2xl rounded-[24px] border border-white/10 bg-[#0b1530] p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()} role="dialog">
            <div className="flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-xl font-black text-white">
                <Send className="h-5 w-5" /> Compose email
              </h2>
              <button
                type="button"
                onClick={() => !sending && setComposeOpen(false)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-4 space-y-3">
              <input
                value={composeForm.to}
                onChange={(e) => setComposeForm((f) => ({ ...f, to: e.target.value }))}
                placeholder="To (email address)"
                className="w-full rounded-2xl border border-white/10 bg-white/8 px-4 py-3 text-sm text-white outline-none transition placeholder:text-white/40 focus:border-blue-400/40"
              />
              <input
                value={composeForm.subject}
                onChange={(e) => setComposeForm((f) => ({ ...f, subject: e.target.value }))}
                placeholder="Subject"
                className="w-full rounded-2xl border border-white/10 bg-white/8 px-4 py-3 text-sm text-white outline-none transition placeholder:text-white/40 focus:border-blue-400/40"
              />
              <textarea
                value={composeForm.body}
                onChange={(e) => setComposeForm((f) => ({ ...f, body: e.target.value }))}
                rows={7}
                placeholder="Write your message..."
                className="w-full rounded-2xl border border-white/10 bg-white/8 px-4 py-3 text-sm text-white outline-none transition placeholder:text-white/40 focus:border-blue-400/40"
              />

              <div>
                <label className="inline-flex cursor-pointer items-center gap-2 rounded-2xl border border-white/10 bg-white/10 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-white/15">
                  <Paperclip className="h-4 w-4" /> Attach files
                  <input
                    type="file"
                    multiple
                    className="hidden"
                    onChange={(e) => {
                      const fl = Array.from(e.target.files ?? []);
                      setComposeFiles((prev) => [...prev, ...fl]);
                      e.currentTarget.value = "";
                    }}
                  />
                </label>
                <p className="mt-2 inline-flex items-center gap-1.5 text-xs text-white/45">
                  <ShieldCheck className="h-3.5 w-3.5 text-emerald-300" />
                  Every attachment is automatically scanned for threats before sending.
                </p>

                {composeFiles.length > 0 ? (
                  <ul className="mt-3 space-y-2">
                    {composeFiles.map((file, idx) => (
                      <li
                        key={`${file.name}-${idx}`}
                        className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/85"
                      >
                        <span className="flex min-w-0 items-center gap-2">
                          <FileText className="h-4 w-4 shrink-0 text-white/60" />
                          <span className="truncate">{file.name}</span>
                          <span className="shrink-0 text-xs text-white/40">
                            {formatBytes(file.size)}
                          </span>
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            setComposeFiles((prev) => prev.filter((_, i) => i !== idx))
                          }
                          className="ml-3 inline-flex h-7 w-7 items-center justify-center rounded-full bg-white/10 text-white/70 transition hover:bg-white/20"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>

              {composeError ? (
                <div className="rounded-2xl border border-red-400/20 bg-red-500/10 p-3 text-sm text-red-100">
                  {composeError}
                </div>
              ) : null}
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                disabled={sending}
                onClick={() => setComposeOpen(false)}
                className="rounded-2xl border border-white/10 bg-white/10 px-4 py-3 text-sm font-bold text-white transition hover:bg-white/15 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={sending}
                onClick={handleSend}
                className="inline-flex items-center gap-2 rounded-2xl bg-blue-500/90 px-5 py-3 text-sm font-bold text-white transition hover:bg-blue-500 disabled:opacity-50"
              >
                {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                {sending ? "Scanning & sending..." : "Send email"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

function threatTone(level: EmailHubAttachment["threatLevel"]) {
  switch (level) {
    case "CRITICAL":
    case "HIGH":
      return "bg-red-500/15 text-red-200 border-red-400/25";
    case "MEDIUM":
      return "bg-amber-500/15 text-amber-200 border-amber-400/25";
    case "LOW":
      return "bg-yellow-500/10 text-yellow-200 border-yellow-400/20";
    default:
      return "bg-emerald-500/15 text-emerald-200 border-emerald-400/25";
  }
}

function AttachmentsPanel(props: { attachments: EmailHubAttachment[] }) {
  return (
    <div className="mt-4 rounded-[22px] border border-white/10 bg-black/20 p-4">
      <div className="flex items-center gap-2 text-sm font-extrabold text-white">
        <Paperclip className="h-4 w-4" />
        Attachments ({props.attachments.length})
      </div>
      <div className="mt-3 space-y-2">
        {props.attachments.map((att) => {
          const flagged = att.threatLevel !== "NONE" || att.scanStatus === "THREAT";
          return (
            <div
              key={att.id}
              className={cn(
                "rounded-xl border p-3",
                att.scanStatus === "THREAT"
                  ? "border-red-400/30 bg-red-500/10"
                  : "border-white/10 bg-white/5"
              )}
            >
              <div className="flex items-center justify-between gap-3">
                <span className="flex min-w-0 items-center gap-2 text-sm text-white/90">
                  <FileText className="h-4 w-4 shrink-0 text-white/60" />
                  <span className="truncate font-semibold">{att.filename}</span>
                  <span className="shrink-0 text-xs text-white/40">{formatBytes(att.size)}</span>
                </span>
                <span
                  className={cn(
                    "inline-flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-1 text-[10px] font-extrabold",
                    threatTone(att.threatLevel)
                  )}
                >
                  {flagged ? (
                    <AlertTriangle className="h-3 w-3" />
                  ) : (
                    <ShieldCheck className="h-3 w-3" />
                  )}
                  {att.scanStatus === "THREAT"
                    ? `THREAT · ${att.threatLevel}`
                    : flagged
                      ? `REVIEW · ${att.threatLevel}`
                      : "CLEAN"}
                </span>
              </div>
              {att.threatReason ? (
                <div className="mt-2 text-xs text-white/60">{att.threatReason}</div>
              ) : null}
              {att.fileUrl && att.scanStatus !== "THREAT" ? (
                <a
                  href={att.fileUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-blue-300 hover:text-blue-200"
                >
                  Download <ArrowUpRight className="h-3 w-3" />
                </a>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function StatCard(props: {
  title: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  const Icon = props.icon;

  return (
    <div className="rounded-[24px] border border-white/10 bg-white/[0.05] p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs font-bold uppercase tracking-[0.18em] text-white/60">
            {props.title}
          </div>
          <div className="mt-3 text-2xl font-black text-white">{props.value}</div>
        </div>

        <div className="grid h-11 w-11 place-items-center rounded-2xl bg-white/10 ring-1 ring-white/10">
          <Icon className="h-5 w-5 text-white" />
        </div>
      </div>
    </div>
  );
}

function InfoCard(props: { title: string; value: string }) {
  return (
    <div className="rounded-[20px] border border-white/10 bg-white/8 p-4">
      <div className="text-xs font-extrabold uppercase tracking-[0.16em] text-slate-400">
        {props.title}
      </div>
      <div className="mt-2 text-sm font-bold text-white">{props.value}</div>
    </div>
  );
}
