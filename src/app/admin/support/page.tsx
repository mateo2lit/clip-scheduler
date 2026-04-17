"use client";

import { useEffect, useState } from "react";

type TicketStatus = "open" | "in_progress" | "resolved";
type TicketType = "bug" | "question" | "billing" | "feature";

type Ticket = {
  id: string;
  team_id: string;
  user_id: string;
  email: string;
  subject: string;
  description: string;
  type: TicketType;
  status: TicketStatus;
  reply_message: string | null;
  created_at: string;
  updated_at: string;
};

const TYPE_LABELS: Record<TicketType, string> = {
  bug: "Bug Report",
  question: "Question",
  billing: "Billing",
  feature: "Feature Request",
};

const STATUS_LABELS: Record<TicketStatus, string> = {
  open: "Open",
  in_progress: "In Progress",
  resolved: "Resolved",
};

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: "short", day: "numeric", year: "numeric",
      hour: "numeric", minute: "2-digit",
    });
  } catch { return iso; }
}

export default function AdminSupportPage() {
  const [secret, setSecret] = useState("");
  const [secretInput, setSecretInput] = useState("");
  const [authenticated, setAuthenticated] = useState(false);
  const [authError, setAuthError] = useState("");

  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState<"" | TicketStatus>("");

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [replyDraft, setReplyDraft] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [saveMsg, setSaveMsg] = useState<Record<string, string>>({});

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setAuthError("");
    // Verify secret works by fetching tickets
    const res = await fetch("/api/admin/support/tickets", {
      headers: { Authorization: `Bearer ${secretInput}` },
    });
    if (!res.ok) {
      setAuthError("Invalid secret. Check SUPPORT_ADMIN_SECRET.");
      return;
    }
    setSecret(secretInput);
    setAuthenticated(true);
    const data = await res.json();
    setTickets(data.tickets ?? []);
  }

  async function fetchTickets(filter: "" | TicketStatus = statusFilter) {
    setLoading(true);
    const url = filter
      ? `/api/admin/support/tickets?status=${filter}`
      : "/api/admin/support/tickets";
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${secret}` },
    });
    const data = await res.json();
    setTickets(data.tickets ?? []);
    setLoading(false);
  }

  async function patchTicket(
    id: string,
    status: TicketStatus,
    notify: boolean
  ) {
    setSaving((s) => ({ ...s, [id]: true }));
    setSaveMsg((s) => ({ ...s, [id]: "" }));
    const reply = replyDraft[id] ?? "";
    const res = await fetch(`/api/admin/support/tickets/${id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${secret}`,
      },
      body: JSON.stringify({
        status,
        reply_message: reply || undefined,
        notify,
      }),
    });
    const data = await res.json();
    if (data.ok) {
      setSaveMsg((s) => ({ ...s, [id]: notify ? "Resolved & user notified." : "Saved." }));
      await fetchTickets();
      if (notify) setExpandedId(null);
    } else {
      setSaveMsg((s) => ({ ...s, [id]: `Error: ${data.error}` }));
    }
    setSaving((s) => ({ ...s, [id]: false }));
  }

  function handleFilterChange(f: "" | TicketStatus) {
    setStatusFilter(f);
    fetchTickets(f);
  }

  const statusColors: Record<TicketStatus, string> = {
    open: "border-amber-500/20 bg-amber-500/10 text-amber-300",
    in_progress: "border-blue-500/20 bg-blue-500/10 text-blue-300",
    resolved: "border-emerald-500/20 bg-emerald-500/10 text-emerald-300",
  };

  const typeColors: Record<TicketType, string> = {
    bug: "border-red-500/20 bg-red-500/10 text-red-300",
    question: "border-purple-500/20 bg-purple-500/10 text-purple-300",
    billing: "border-yellow-500/20 bg-yellow-500/10 text-yellow-300",
    feature: "border-cyan-500/20 bg-cyan-500/10 text-cyan-300",
  };

  if (!authenticated) {
    return (
      <div className="min-h-screen bg-[#050505] flex items-center justify-center">
        <div className="w-full max-w-sm">
          <h1 className="text-white/90 text-xl font-semibold mb-6 text-center">
            Clip Dash Admin
          </h1>
          <form onSubmit={handleLogin} className="rounded-2xl border border-white/[0.07] bg-white/[0.03] p-6 flex flex-col gap-4">
            <div>
              <label className="block text-xs text-white/40 mb-1.5">Admin Secret</label>
              <input
                type="password"
                value={secretInput}
                onChange={(e) => setSecretInput(e.target.value)}
                placeholder="SUPPORT_ADMIN_SECRET"
                className="w-full rounded-xl border border-white/[0.08] bg-white/[0.04] px-3.5 py-2.5 text-sm text-white/90 placeholder:text-white/20 outline-none focus:border-white/20"
                autoFocus
              />
            </div>
            {authError && (
              <p className="text-xs text-red-400">{authError}</p>
            )}
            <button
              type="submit"
              disabled={!secretInput}
              className="rounded-xl bg-white/[0.08] hover:bg-white/[0.12] border border-white/[0.08] px-4 py-2.5 text-sm font-medium text-white/90 disabled:opacity-40 transition-colors"
            >
              Enter
            </button>
          </form>
        </div>
      </div>
    );
  }

  const counts = {
    "": tickets.length,
    open: tickets.filter((t) => t.status === "open").length,
    in_progress: tickets.filter((t) => t.status === "in_progress").length,
    resolved: tickets.filter((t) => t.status === "resolved").length,
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#050505] px-4 py-8 md:px-8">
      {/* Header */}
      <div className="relative z-10 max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-white/90 text-xl font-semibold">Support Tickets</h1>
            <p className="text-white/30 text-xs mt-0.5">{tickets.length} total ticket{tickets.length !== 1 ? "s" : ""}</p>
          </div>
          <button
            onClick={() => fetchTickets()}
            className="rounded-xl border border-white/[0.07] bg-white/[0.03] px-3.5 py-2 text-xs text-white/50 hover:text-white/80 hover:border-white/[0.12] transition-colors"
          >
            Refresh
          </button>
        </div>

        {/* Filter pills */}
        <div className="flex gap-2 mb-6 flex-wrap">
          {(["", "open", "in_progress", "resolved"] as const).map((f) => (
            <button
              key={f}
              onClick={() => handleFilterChange(f)}
              className={`rounded-full px-3.5 py-1.5 text-xs font-medium border transition-colors ${
                statusFilter === f
                  ? "border-white/20 bg-white/[0.08] text-white/90"
                  : "border-white/[0.07] bg-transparent text-white/40 hover:text-white/60 hover:border-white/[0.12]"
              }`}
            >
              {f === "" ? "All" : STATUS_LABELS[f]}
              {" "}
              <span className="opacity-60">
                ({f === "" ? tickets.length : tickets.filter(t => t.status === f).length})
              </span>
            </button>
          ))}
        </div>

        {/* Ticket list */}
        {loading ? (
          <div className="text-center py-16 text-white/20 text-sm">Loading…</div>
        ) : tickets.length === 0 ? (
          <div className="text-center py-16 text-white/20 text-sm">No tickets.</div>
        ) : (
          <div className="flex flex-col gap-3">
            {tickets
              .filter((t) => !statusFilter || t.status === statusFilter)
              .map((ticket) => {
                const isOpen = expandedId === ticket.id;
                const reply = replyDraft[ticket.id] ?? ticket.reply_message ?? "";
                const msg = saveMsg[ticket.id];
                const busy = saving[ticket.id];

                return (
                  <div
                    key={ticket.id}
                    className="rounded-2xl border border-white/[0.07] bg-white/[0.02] overflow-hidden transition-colors hover:border-white/[0.10]"
                  >
                    {/* Card header — always visible */}
                    <button
                      className="w-full text-left p-4 flex items-start gap-3"
                      onClick={() => setExpandedId(isOpen ? null : ticket.id)}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap gap-1.5 mb-2">
                          <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${statusColors[ticket.status]}`}>
                            {STATUS_LABELS[ticket.status]}
                          </span>
                          <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${typeColors[ticket.type]}`}>
                            {TYPE_LABELS[ticket.type]}
                          </span>
                        </div>
                        <p className="text-sm font-medium text-white/90 truncate">{ticket.subject}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-xs text-white/30">{ticket.email}</span>
                          <span className="text-white/10">·</span>
                          <span className="text-xs text-white/20">{formatDate(ticket.created_at)}</span>
                        </div>
                      </div>
                      <svg
                        className={`shrink-0 mt-0.5 w-4 h-4 text-white/20 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
                        fill="none" viewBox="0 0 24 24" stroke="currentColor"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>

                    {/* Expanded panel */}
                    {isOpen && (
                      <div className="border-t border-white/[0.05] p-4 flex flex-col gap-4">
                        {/* Description */}
                        <div>
                          <p className="text-xs text-white/30 mb-1.5 uppercase tracking-wide">Description</p>
                          <p className="text-sm text-white/60 whitespace-pre-wrap leading-relaxed">{ticket.description}</p>
                        </div>

                        {/* Reply field */}
                        <div>
                          <label className="block text-xs text-white/30 mb-1.5 uppercase tracking-wide">
                            Reply to user
                          </label>
                          <textarea
                            rows={4}
                            value={reply}
                            onChange={(e) =>
                              setReplyDraft((d) => ({ ...d, [ticket.id]: e.target.value }))
                            }
                            placeholder="Write a reply… (optional — sent to user when resolving)"
                            className="w-full rounded-xl border border-white/[0.08] bg-white/[0.04] px-3.5 py-2.5 text-sm text-white/80 placeholder:text-white/20 outline-none focus:border-white/20 resize-none"
                          />
                        </div>

                        {/* Action buttons */}
                        <div className="flex flex-wrap gap-2 items-center">
                          {ticket.status !== "in_progress" && ticket.status !== "resolved" && (
                            <button
                              disabled={busy}
                              onClick={() => patchTicket(ticket.id, "in_progress", false)}
                              className="rounded-xl border border-blue-500/20 bg-blue-500/10 px-3.5 py-2 text-xs font-medium text-blue-300 hover:bg-blue-500/20 disabled:opacity-40 transition-colors"
                            >
                              Mark In Progress
                            </button>
                          )}
                          {ticket.status !== "resolved" && (
                            <>
                              <button
                                disabled={busy}
                                onClick={() => patchTicket(ticket.id, "resolved", false)}
                                className="rounded-xl border border-white/[0.08] bg-white/[0.04] px-3.5 py-2 text-xs font-medium text-white/60 hover:bg-white/[0.07] disabled:opacity-40 transition-colors"
                              >
                                Resolve (no email)
                              </button>
                              <button
                                disabled={busy}
                                onClick={() => patchTicket(ticket.id, "resolved", true)}
                                className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-3.5 py-2 text-xs font-medium text-emerald-300 hover:bg-emerald-500/20 disabled:opacity-40 transition-colors"
                              >
                                {reply ? "Reply & Resolve" : "Resolve & Notify"}
                              </button>
                            </>
                          )}
                          {ticket.status === "resolved" && (
                            <button
                              disabled={busy}
                              onClick={() => patchTicket(ticket.id, "open", false)}
                              className="rounded-xl border border-white/[0.08] bg-white/[0.04] px-3.5 py-2 text-xs font-medium text-white/50 hover:bg-white/[0.07] disabled:opacity-40 transition-colors"
                            >
                              Reopen
                            </button>
                          )}
                          {ticket.status === "resolved" && reply && (
                            <button
                              disabled={busy}
                              onClick={() => patchTicket(ticket.id, "resolved", true)}
                              className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-3.5 py-2 text-xs font-medium text-emerald-300 hover:bg-emerald-500/20 disabled:opacity-40 transition-colors"
                            >
                              Send Reply
                            </button>
                          )}
                          {msg && (
                            <span className={`text-xs ml-1 ${msg.startsWith("Error") ? "text-red-400" : "text-emerald-400"}`}>
                              {msg}
                            </span>
                          )}
                        </div>

                        {/* Existing reply if any */}
                        {ticket.reply_message && !replyDraft[ticket.id] && (
                          <div className="rounded-xl border border-emerald-500/10 bg-emerald-500/5 p-3">
                            <p className="text-xs text-emerald-400/60 mb-1">Previous reply sent</p>
                            <p className="text-sm text-emerald-300/80 whitespace-pre-wrap">{ticket.reply_message}</p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
          </div>
        )}
      </div>
    </div>
  );
}
