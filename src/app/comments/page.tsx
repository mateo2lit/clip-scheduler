"use client";

import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import Link from "next/link";
import { supabase } from "@/app/login/supabaseClient";
import { CaretLeft, Warning, DownloadSimple, ChatCircleDots } from "@phosphor-icons/react/dist/ssr";
import type {
  Comment,
  EnrichedComment,
  PlatformFilter,
  SortMode,
  ReadFilter,
  ViewMode,
  SentimentFilter,
  CommentType,
  SavedReply,
  CommentFlags,
  ArchiveFilter,
  DateRange,
} from "@/components/comments/types";
import { enrichComment } from "@/components/comments/sentiment";
import CommentCard from "@/components/comments/CommentCard";
import Sidebar from "@/components/comments/Sidebar";
import StatsBar from "@/components/comments/StatsBar";
import SearchBar from "@/components/comments/SearchBar";
import ViewToggle from "@/components/comments/ViewToggle";
import KeyboardShortcutsHelp from "@/components/comments/KeyboardShortcutsHelp";

function exportCSV(comments: EnrichedComment[], readIds: Record<string, true>) {
  const escape = (s: string) => `"${(s ?? "").replace(/"/g, '""').replace(/\n/g, " ")}"`;
  const header = "Author,Platform,Post,Comment,Sentiment,Type,Date,Likes,Status";
  const rows = comments.map((c) =>
    [
      escape(c.authorName),
      c.platform,
      escape(c.postTitle),
      escape(c.text),
      c.sentiment,
      c.commentType,
      c.publishedAt,
      c.likeCount,
      readIds[c.id] ? "read" : "unread",
    ].join(",")
  );
  const csv = [header, ...rows].join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `comments_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function CommentsPage() {
  const [comments, setComments] = useState<Comment[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [sessionEmail, setSessionEmail] = useState<string | null>(null);
  const [authToken, setAuthToken] = useState<string | null>(null);

  const [filter, setFilter] = useState<PlatformFilter>("all");
  const [sortMode, setSortMode] = useState<SortMode>("recent");
  const [readFilter, setReadFilter] = useState<ReadFilter>("all");
  const [sentimentFilter, setSentimentFilter] = useState<SentimentFilter>("all");
  const [commentTypeFilter, setCommentTypeFilter] = useState<CommentType | "all">("all");
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [searchQuery, setSearchQuery] = useState("");
  const [focusedIndex, setFocusedIndex] = useState<number>(-1);
  const [archiveFilter, setArchiveFilter] = useState<ArchiveFilter>("active");
  const [dateRange, setDateRange] = useState<DateRange>("7d");

  const [readCommentIds, setReadCommentIds] = useState<Record<string, true>>({});
  const [commentFlags, setCommentFlags] = useState<Record<string, CommentFlags>>({});
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkMode, setBulkMode] = useState(false);
  const [savedReplies, setSavedReplies] = useState<SavedReply[]>([]);

  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastFetchedAt, setLastFetchedAt] = useState<Date | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [secondsUntilRefresh, setSecondsUntilRefresh] = useState(60);
  const [showShortcutsHelp, setShowShortcutsHelp] = useState(false);
  const [likedCommentIds, setLikedCommentIds] = useState<Record<string, true>>({});

  const autoRefreshRef = useRef(autoRefresh);
  autoRefreshRef.current = autoRefresh;
  const authTokenRef = useRef(authToken);
  authTokenRef.current = authToken;
  const commentListRef = useRef<HTMLDivElement>(null);

  const isRead = (id: string) => Boolean(readCommentIds[id]);
  const isStarred = (id: string) => Boolean(commentFlags[id]?.starred);
  const isArchived = (id: string) => Boolean(commentFlags[id]?.archived);

  const toggleRead = useCallback((id: string) => {
    setReadCommentIds((prev) => {
      if (prev[id]) {
        const next = { ...prev };
        delete next[id];
        return next;
      }
      return { ...prev, [id]: true };
    });
  }, []);

  const toggleStar = useCallback((id: string) => {
    setCommentFlags((prev) => ({
      ...prev,
      [id]: { ...prev[id], starred: !prev[id]?.starred },
    }));
  }, []);

  const toggleArchive = useCallback((id: string) => {
    setCommentFlags((prev) => ({
      ...prev,
      [id]: { ...prev[id], archived: !prev[id]?.archived },
    }));
  }, []);

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const fetchComments = useCallback(async (token: string, range?: DateRange) => {
    try {
      const r = range || "7d";
      const res = await fetch(`/api/comments?range=${r}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (json.ok) {
        setComments(json.comments ?? []);
        setErrors(json.errors ?? []);
        setLastFetchedAt(new Date());
      }
    } catch {}
  }, []);

  // Initial load
  useEffect(() => {
    async function load() {
      const { data: auth } = await supabase.auth.getSession();
      if (!auth.session) {
        window.location.href = "/login";
        return;
      }

      setSessionEmail(auth.session.user.email ?? null);
      const token = auth.session.access_token;
      setAuthToken(token);

      let teamOk = false;
      try {
        const res = await fetch("/api/team/me", {
          headers: { Authorization: `Bearer ${token}` },
        });
        const json = await res.json();
        if (json.ok) teamOk = true;
      } catch {}

      if (!teamOk) {
        setLoading(false);
        return;
      }

      await fetchComments(token, dateRange);
      setLoading(false);
    }

    load();
  }, [fetchComments]);

  // Auto-refresh polling (60s interval, pauses on blur)
  useEffect(() => {
    if (loading) return;

    let countdown = 60;
    setSecondsUntilRefresh(60);

    const timer = setInterval(() => {
      if (!autoRefreshRef.current) return;
      countdown--;
      setSecondsUntilRefresh(countdown);

      if (countdown <= 0) {
        countdown = 60;
        setSecondsUntilRefresh(60);
        const token = authTokenRef.current;
        if (token) {
          setIsRefreshing(true);
          fetchComments(token).finally(() => setIsRefreshing(false));
        }
      }
    }, 1000);

    const onFocus = () => { countdown = 5; setSecondsUntilRefresh(5); };
    const onBlur = () => { countdown = 999; };
    window.addEventListener("focus", onFocus);
    window.addEventListener("blur", onBlur);

    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("blur", onBlur);
    };
  }, [loading, fetchComments]);

  // Load read state from localStorage
  useEffect(() => {
    if (!sessionEmail) return;
    try {
      const raw = window.localStorage.getItem(`clipdash:read-comments:${sessionEmail}`);
      if (!raw) { setReadCommentIds({}); return; }
      const ids = JSON.parse(raw);
      if (!Array.isArray(ids)) { setReadCommentIds({}); return; }
      const next: Record<string, true> = {};
      for (const id of ids) {
        if (typeof id === "string" && id.length > 0) next[id] = true;
      }
      setReadCommentIds(next);
    } catch {
      setReadCommentIds({});
    }
  }, [sessionEmail]);

  // Persist read state
  useEffect(() => {
    if (!sessionEmail) return;
    try {
      window.localStorage.setItem(
        `clipdash:read-comments:${sessionEmail}`,
        JSON.stringify(Object.keys(readCommentIds))
      );
    } catch {}
  }, [sessionEmail, readCommentIds]);

  // Load comment flags from localStorage
  useEffect(() => {
    if (!sessionEmail) return;
    try {
      const raw = window.localStorage.getItem(`clipdash:comment-flags:${sessionEmail}`);
      if (raw) setCommentFlags(JSON.parse(raw));
    } catch {}
  }, [sessionEmail]);

  // Persist comment flags
  useEffect(() => {
    if (!sessionEmail) return;
    try {
      window.localStorage.setItem(
        `clipdash:comment-flags:${sessionEmail}`,
        JSON.stringify(commentFlags)
      );
    } catch {}
  }, [sessionEmail, commentFlags]);

  // Load saved replies from localStorage
  useEffect(() => {
    if (!sessionEmail) return;
    try {
      const raw = window.localStorage.getItem(`clipdash:saved-replies:${sessionEmail}`);
      if (raw) setSavedReplies(JSON.parse(raw));
    } catch {}
  }, [sessionEmail]);

  // Persist saved replies
  useEffect(() => {
    if (!sessionEmail) return;
    try {
      window.localStorage.setItem(
        `clipdash:saved-replies:${sessionEmail}`,
        JSON.stringify(savedReplies)
      );
    } catch {}
  }, [sessionEmail, savedReplies]);

  // Load liked state from localStorage
  useEffect(() => {
    if (!sessionEmail) return;
    try {
      const raw = window.localStorage.getItem(`clipdash:liked-comments:${sessionEmail}`);
      if (raw) setLikedCommentIds(JSON.parse(raw));
    } catch {}
  }, [sessionEmail]);

  // Persist liked state
  useEffect(() => {
    if (!sessionEmail) return;
    try {
      window.localStorage.setItem(
        `clipdash:liked-comments:${sessionEmail}`,
        JSON.stringify(likedCommentIds)
      );
    } catch {}
  }, [sessionEmail, likedCommentIds]);

  const addSavedReply = useCallback((label: string, text: string) => {
    setSavedReplies((prev) => [
      ...prev,
      { id: crypto.randomUUID(), label, text, createdAt: new Date().toISOString() },
    ]);
  }, []);

  const deleteSavedReply = useCallback((id: string) => {
    setSavedReplies((prev) => prev.filter((r) => r.id !== id));
  }, []);

  async function handleRefresh() {
    if (!authToken || isRefreshing) return;
    setIsRefreshing(true);
    await fetchComments(authToken, dateRange);
    setIsRefreshing(false);
    setSecondsUntilRefresh(60);
  }

  async function handleDateRangeChange(range: DateRange) {
    setDateRange(range);
    if (!authToken) return;
    setIsRefreshing(true);
    await fetchComments(authToken, range);
    setIsRefreshing(false);
  }

  async function handleLikeComment(comment: EnrichedComment) {
    if (!authToken || likedCommentIds[comment.id]) return;
    setLikedCommentIds((prev) => ({ ...prev, [comment.id]: true }));
    try {
      await fetch("/api/comments/like", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${authToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          platform: comment.platform,
          commentId: comment.id,
          platformAccountId: comment.accountId,
        }),
      });
    } catch {
      setLikedCommentIds((prev) => {
        const next = { ...prev };
        delete next[comment.id];
        return next;
      });
    }
  }

  // Enrich all comments with sentiment + type + priority
  const enriched: EnrichedComment[] = useMemo(
    () => comments.map(enrichComment),
    [comments]
  );

  // Filter pipeline
  const filtered = useMemo(() => {
    let result = enriched;

    // Archive filter
    if (archiveFilter === "active") result = result.filter((c) => !isArchived(c.id));
    else if (archiveFilter === "archived") result = result.filter((c) => isArchived(c.id));
    else if (archiveFilter === "starred") result = result.filter((c) => isStarred(c.id));

    // Platform
    if (filter !== "all") result = result.filter((c) => c.platform === filter);

    // Sentiment
    if (sentimentFilter !== "all") result = result.filter((c) => c.sentiment === sentimentFilter);

    // Comment type
    if (commentTypeFilter !== "all") result = result.filter((c) => c.commentType === commentTypeFilter);

    // Read status
    if (readFilter === "read") result = result.filter((c) => isRead(c.id));
    else if (readFilter === "unread") result = result.filter((c) => !isRead(c.id));

    // Search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (c) =>
          c.text.toLowerCase().includes(q) ||
          c.authorName.toLowerCase().includes(q) ||
          c.postTitle.toLowerCase().includes(q)
      );
    }

    // Sort
    result = [...result].sort((a, b) => {
      if (sortMode === "recent") return new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime();
      if (sortMode === "oldest") return new Date(a.publishedAt).getTime() - new Date(b.publishedAt).getTime();
      const diff = b.priorityScore - a.priorityScore;
      return diff !== 0 ? diff : new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime();
    });

    return result;
  }, [enriched, filter, sentimentFilter, commentTypeFilter, readFilter, searchQuery, sortMode, readCommentIds, archiveFilter, commentFlags]);

  // Read counts scoped to platform filter
  const readCounts = useMemo(() => {
    const scoped = filter === "all" ? enriched : enriched.filter((c) => c.platform === filter);
    const active = scoped.filter((c) => !isArchived(c.id));
    return {
      all: active.length,
      read: active.filter((c) => isRead(c.id)).length,
      unread: active.filter((c) => !isRead(c.id)).length,
    };
  }, [enriched, filter, readCommentIds, commentFlags]);

  // Archive/star counts
  const flagCounts = useMemo(() => {
    return {
      starred: enriched.filter((c) => isStarred(c.id)).length,
      archived: enriched.filter((c) => isArchived(c.id)).length,
    };
  }, [enriched, commentFlags]);

  // Bulk actions
  function bulkMarkRead() {
    setReadCommentIds((prev) => {
      const next = { ...prev };
      for (const id of selectedIds) next[id] = true;
      return next;
    });
    setSelectedIds(new Set());
    setBulkMode(false);
  }

  function bulkMarkUnread() {
    setReadCommentIds((prev) => {
      const next = { ...prev };
      for (const id of selectedIds) delete next[id];
      return next;
    });
    setSelectedIds(new Set());
    setBulkMode(false);
  }

  function bulkStar() {
    setCommentFlags((prev) => {
      const next = { ...prev };
      for (const id of selectedIds) next[id] = { ...next[id], starred: true };
      return next;
    });
    setSelectedIds(new Set());
    setBulkMode(false);
  }

  function bulkArchive() {
    setCommentFlags((prev) => {
      const next = { ...prev };
      for (const id of selectedIds) next[id] = { ...next[id], archived: true };
      return next;
    });
    setSelectedIds(new Set());
    setBulkMode(false);
  }

  // Group helpers for view modes
  const groupedByPost = useMemo(() => {
    if (viewMode !== "by-post") return null;
    const map = new Map<string, EnrichedComment[]>();
    for (const c of filtered) {
      const key = c.postId || "unknown";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(c);
    }
    return map;
  }, [filtered, viewMode]);

  const groupedByUser = useMemo(() => {
    if (viewMode !== "by-user") return null;
    const map = new Map<string, EnrichedComment[]>();
    for (const c of filtered) {
      const key = c.authorName;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(c);
    }
    return map;
  }, [filtered, viewMode]);

  // Keyboard shortcuts
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      const isInput = target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT" || target.isContentEditable;

      if (e.key === "?" && !isInput) {
        e.preventDefault();
        setShowShortcutsHelp((v) => !v);
        return;
      }

      if (e.key === "Escape") {
        setShowShortcutsHelp(false);
        return;
      }

      if (isInput) return;

      if (e.key === "j" || e.key === "k") {
        e.preventDefault();
        setFocusedIndex((prev) => {
          const max = filtered.length - 1;
          if (max < 0) return -1;
          if (e.key === "j") return Math.min(prev + 1, max);
          return Math.max(prev - 1, 0);
        });
        return;
      }

      if (e.key === "/" ) {
        e.preventDefault();
        const searchInput = document.querySelector<HTMLInputElement>('[data-search-input]');
        searchInput?.focus();
        return;
      }

      const comment = focusedIndex >= 0 && focusedIndex < filtered.length ? filtered[focusedIndex] : null;
      if (!comment) return;

      if (e.key === "m") { e.preventDefault(); toggleRead(comment.id); }
      if (e.key === "s") { e.preventDefault(); toggleStar(comment.id); }
      if (e.key === "e") { e.preventDefault(); toggleArchive(comment.id); }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [filtered, focusedIndex, toggleRead, toggleStar, toggleArchive]);

  // Scroll focused comment into view
  useEffect(() => {
    if (focusedIndex < 0) return;
    const container = commentListRef.current;
    if (!container) return;
    const cards = container.querySelectorAll('[data-comment-card]');
    cards[focusedIndex]?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [focusedIndex]);

  const reconnectErrors = errors.filter((e) => e.toLowerCase().includes("reconnect"));
  const otherErrors = errors.filter((e) => !e.toLowerCase().includes("reconnect"));

  const focusedId = focusedIndex >= 0 && focusedIndex < filtered.length ? filtered[focusedIndex].id : null;

  return (
    <main className="min-h-screen bg-[#050505] text-white relative overflow-hidden">
      {showShortcutsHelp && <KeyboardShortcutsHelp onClose={() => setShowShortcutsHelp(false)} />}

      {/* Nav */}
      <nav className="relative z-10 border-b border-white/5">
        <div className="mx-auto max-w-6xl px-6 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center">
            <img src="/logo.svg" alt="Clip Dash" className="h-10 w-auto" />
          </Link>
          <div className="flex items-center gap-3">
            <Link href="/settings" className="text-sm text-white/40 hover:text-white/70 transition-colors">
              Settings
            </Link>
            <div className="h-7 w-7 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center text-[11px] font-semibold">
              {sessionEmail ? sessionEmail[0].toUpperCase() : "?"}
            </div>
          </div>
        </div>
      </nav>

      <div className="relative z-10 mx-auto max-w-6xl px-6 pt-10 pb-16">
        {/* Header */}
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <Link
              href="/dashboard"
              className="h-8 w-8 rounded-full border border-white/10 bg-white/5 flex items-center justify-center text-white/40 hover:text-white/70 hover:bg-white/10 transition-all"
            >
              <CaretLeft className="w-4 h-4" weight="bold" />
            </Link>
            <div>
              <h1 className="text-lg font-semibold tracking-tight">Comments</h1>
              <p className="text-sm text-white/40">
                {loading ? "Loading..." : `${filtered.length} comment${filtered.length === 1 ? "" : "s"}`}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <ViewToggle viewMode={viewMode} setViewMode={setViewMode} />

            {/* Keyboard shortcuts hint */}
            <button
              onClick={() => setShowShortcutsHelp(true)}
              className="h-8 w-8 rounded-lg border border-white/[0.06] bg-white/[0.02] flex items-center justify-center text-white/25 hover:text-white/50 hover:bg-white/[0.05] transition-all"
              title="Keyboard shortcuts (?)"
            >
              <kbd className="text-[10px] font-mono font-bold">?</kbd>
            </button>
          </div>
        </div>

        {/* Stats */}
        {!loading && enriched.length > 0 && (
          <StatsBar
            comments={enriched}
            unreadCount={readCounts.unread}
            lastFetchedAt={lastFetchedAt}
            isRefreshing={isRefreshing}
            onRefresh={handleRefresh}
            autoRefresh={autoRefresh}
            onToggleAutoRefresh={() => setAutoRefresh((v) => !v)}
            secondsUntilRefresh={secondsUntilRefresh}
          />
        )}

        {/* Reconnect banners */}
        {reconnectErrors.map((err, i) => (
          <div
            key={i}
            className="mt-4 rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3 flex items-center justify-between"
          >
            <div className="flex items-center gap-2">
              <Warning className="w-4 h-4 text-amber-400 shrink-0" weight="duotone" />
              <span className="text-sm text-amber-300">{err}</span>
            </div>
            <Link
              href="/settings"
              className="shrink-0 rounded-full border border-amber-500/20 bg-amber-500/10 px-3 py-1 text-xs font-medium text-amber-300 hover:bg-amber-500/20 transition-colors"
            >
              Go to Settings
            </Link>
          </div>
        ))}

        {/* Other error banners */}
        {otherErrors.map((err, i) => (
          <div
            key={i}
            className="mt-4 rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm text-red-300"
          >
            {err}
          </div>
        ))}


        <div className="mt-6 grid grid-cols-1 lg:grid-cols-[220px_minmax(0,1fr)] gap-4">
          {/* Sidebar filters */}
          <Sidebar
            comments={enriched}
            filter={filter}
            setFilter={setFilter}
            readFilter={readFilter}
            setReadFilter={setReadFilter}
            readCounts={readCounts}
            sentimentFilter={sentimentFilter}
            setSentimentFilter={setSentimentFilter}
            commentTypeFilter={commentTypeFilter}
            setCommentTypeFilter={setCommentTypeFilter}
            archiveFilter={archiveFilter}
            setArchiveFilter={setArchiveFilter}
            flagCounts={flagCounts}
          />

          {/* Main content */}
          <section className="space-y-4">
            {/* Toolbar */}
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3 sm:p-4">
              <div className="flex items-center gap-3 flex-wrap">
                <div className="flex-1 min-w-[180px]">
                  <SearchBar value={searchQuery} onChange={setSearchQuery} />
                </div>

                {/* Date range */}
                <select
                  value={dateRange}
                  onChange={(e) => handleDateRangeChange(e.target.value as DateRange)}
                  className="rounded-lg px-3 py-1.5 text-sm font-medium border border-white/10 bg-[#0b0b0b] text-white/90 focus:outline-none focus:border-white/20"
                  aria-label="Date range"
                >
                  <option value="3d">3 days</option>
                  <option value="7d">7 days</option>
                  <option value="14d">14 days</option>
                  <option value="30d">30 days</option>
                </select>

                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-semibold tracking-widest text-white/30 uppercase">Sort</span>
                  <select
                    value={sortMode}
                    onChange={(e) => setSortMode(e.target.value as SortMode)}
                    className="rounded-lg px-3 py-1.5 text-sm font-medium border border-white/10 bg-[#0b0b0b] text-white/90 focus:outline-none focus:border-white/20"
                    aria-label="Sort comments"
                  >
                    <option value="recent">Newest first</option>
                    <option value="priority">Priority</option>
                    <option value="oldest">Oldest first</option>
                  </select>
                </div>

                <button
                  onClick={() => { setBulkMode(!bulkMode); setSelectedIds(new Set()); }}
                  className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-all ${
                    bulkMode
                      ? "border-blue-500/30 bg-blue-500/10 text-blue-300"
                      : "border-white/[0.06] bg-white/[0.02] text-white/40 hover:text-white/70 hover:bg-white/[0.05]"
                  }`}
                >
                  {bulkMode ? "Cancel" : "Select"}
                </button>

                {/* Export CSV */}
                {!loading && filtered.length > 0 && (
                  <button
                    onClick={() => exportCSV(filtered, readCommentIds)}
                    className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-1.5 text-xs font-medium text-white/40 hover:text-white/70 hover:bg-white/[0.05] transition-all flex items-center gap-1.5"
                    title="Export filtered comments as CSV"
                  >
                    <DownloadSimple className="w-3 h-3" weight="bold" />
                    CSV
                  </button>
                )}
              </div>

              {/* Bulk action bar */}
              {bulkMode && selectedIds.size > 0 && (
                <div className="mt-3 pt-3 border-t border-white/[0.06] flex items-center gap-2 flex-wrap">
                  <span className="text-xs text-white/40">{selectedIds.size} selected</span>
                  <button onClick={bulkMarkRead} className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-300 hover:bg-emerald-500/15 transition-colors">
                    Mark read
                  </button>
                  <button onClick={bulkMarkUnread} className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-1 text-xs font-medium text-white/50 hover:text-white/80 hover:bg-white/[0.06] transition-colors">
                    Mark unread
                  </button>
                  <button onClick={bulkStar} className="rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-1 text-xs font-medium text-amber-300 hover:bg-amber-500/15 transition-colors">
                    Star
                  </button>
                  <button onClick={bulkArchive} className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-1 text-xs font-medium text-white/50 hover:text-white/80 hover:bg-white/[0.06] transition-colors">
                    Archive
                  </button>
                </div>
              )}
            </div>

            {/* Comments list */}
            {loading ? (
              <div className="rounded-2xl border border-white/10 bg-white/[0.02]">
                {[...Array(4)].map((_, i) => (
                  <div key={i} className="px-6 py-5 border-t border-white/5 first:border-t-0">
                    <div className="flex items-center gap-3">
                      <div className="h-9 w-9 rounded-full bg-white/[0.06] animate-pulse" />
                      <div className="flex-1 space-y-2">
                        <div className="h-3 w-24 rounded bg-white/[0.06] animate-pulse" />
                        <div className="h-3 w-64 rounded bg-white/[0.06] animate-pulse" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : filtered.length === 0 ? (
              <div className="rounded-2xl border border-white/10 bg-white/[0.02] px-6 py-16 text-center">
                <div className="inline-flex rounded-xl p-3 bg-cyan-500/10 text-cyan-400 mx-auto">
                  <ChatCircleDots className="w-6 h-6" weight="duotone" />
                </div>
                <p className="font-semibold text-white/90 mt-4">No comments found</p>
                <p className="text-sm text-white/40 mt-1">
                  {searchQuery
                    ? "Try a different search term."
                    : archiveFilter === "archived"
                    ? "No archived comments yet."
                    : archiveFilter === "starred"
                    ? "No starred comments yet. Press S to star a comment."
                    : "Comments on your recent posts will appear here."}
                </p>
              </div>
            ) : viewMode === "list" ? (
              <div ref={commentListRef} className="rounded-2xl border border-white/10 bg-white/[0.03] divide-y divide-white/[0.04] shadow-[0_20px_70px_rgba(2,6,23,0.35)]">
                {filtered.map((comment, idx) => (
                  <CommentCard
                    key={comment.id}
                    comment={comment}
                    isRead={isRead(comment.id)}
                    isFocused={focusedId === comment.id}
                    isSelected={selectedIds.has(comment.id)}
                    isStarred={isStarred(comment.id)}
                    isArchived={isArchived(comment.id)}
                    isLiked={Boolean(likedCommentIds[comment.id])}
                    bulkMode={bulkMode}
                    onToggleRead={() => toggleRead(comment.id)}
                    onToggleSelect={() => toggleSelect(comment.id)}
                    onToggleStar={() => toggleStar(comment.id)}
                    onToggleArchive={() => toggleArchive(comment.id)}
                    onLike={() => handleLikeComment(comment)}
                    onSelect={() => setFocusedIndex(focusedId === comment.id ? -1 : idx)}
                    onReply={() => {}}
                    savedReplies={savedReplies}
                    onAddSavedReply={addSavedReply}
                    onDeleteSavedReply={deleteSavedReply}
                    authToken={authToken}
                    sessionEmail={sessionEmail}
                  />
                ))}
              </div>
            ) : viewMode === "by-post" && groupedByPost ? (
              <div className="space-y-4">
                {Array.from(groupedByPost.entries()).map(([postId, group]) => (
                  <div key={postId} className="rounded-2xl border border-white/10 bg-white/[0.03] overflow-hidden shadow-[0_20px_70px_rgba(2,6,23,0.35)]">
                    <div className="px-6 py-4 border-b border-white/[0.06] flex items-center gap-3">
                      {group[0].postThumbnailUrl && (
                        <img src={group[0].postThumbnailUrl} alt="" className="h-10 w-16 rounded-lg object-cover border border-white/10" />
                      )}
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-white/80 truncate">{group[0].postTitle || "Untitled"}</p>
                        <p className="text-[11px] text-white/30">{group.length} comment{group.length === 1 ? "" : "s"}</p>
                      </div>
                    </div>
                    <div className="divide-y divide-white/[0.04]">
                      {group.map((comment) => (
                        <CommentCard
                          key={comment.id}
                          comment={comment}
                          isRead={isRead(comment.id)}
                          isFocused={focusedId === comment.id}
                          isSelected={selectedIds.has(comment.id)}
                          isStarred={isStarred(comment.id)}
                          isArchived={isArchived(comment.id)}
                          isLiked={Boolean(likedCommentIds[comment.id])}
                          bulkMode={bulkMode}
                          compact
                          onToggleRead={() => toggleRead(comment.id)}
                          onToggleSelect={() => toggleSelect(comment.id)}
                          onToggleStar={() => toggleStar(comment.id)}
                          onToggleArchive={() => toggleArchive(comment.id)}
                          onLike={() => handleLikeComment(comment)}
                          onSelect={() => setFocusedIndex(-1)}
                          onReply={() => {}}
                          savedReplies={savedReplies}
                          onAddSavedReply={addSavedReply}
                          onDeleteSavedReply={deleteSavedReply}
                          authToken={authToken}
                          sessionEmail={sessionEmail}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : viewMode === "by-user" && groupedByUser ? (
              <div className="space-y-4">
                {Array.from(groupedByUser.entries()).map(([author, group]) => (
                  <div key={author} className="rounded-2xl border border-white/10 bg-white/[0.03] overflow-hidden shadow-[0_20px_70px_rgba(2,6,23,0.35)]">
                    <div className="px-6 py-4 border-b border-white/[0.06] flex items-center gap-3">
                      {group[0].authorImageUrl ? (
                        <img src={group[0].authorImageUrl} alt="" className="h-9 w-9 rounded-full ring-1 ring-white/10" />
                      ) : (
                        <div className="h-9 w-9 rounded-full bg-gradient-to-br from-white/[0.08] to-white/[0.03] flex items-center justify-center text-xs font-semibold text-white/40 ring-1 ring-white/10">
                          {author[0]?.toUpperCase() ?? "?"}
                        </div>
                      )}
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-white/80">{author}</p>
                        <p className="text-[11px] text-white/30">{group.length} comment{group.length === 1 ? "" : "s"}</p>
                      </div>
                    </div>
                    <div className="divide-y divide-white/[0.04]">
                      {group.map((comment) => (
                        <CommentCard
                          key={comment.id}
                          comment={comment}
                          isRead={isRead(comment.id)}
                          isFocused={focusedId === comment.id}
                          isSelected={selectedIds.has(comment.id)}
                          isStarred={isStarred(comment.id)}
                          isArchived={isArchived(comment.id)}
                          isLiked={Boolean(likedCommentIds[comment.id])}
                          bulkMode={bulkMode}
                          compact
                          onToggleRead={() => toggleRead(comment.id)}
                          onToggleSelect={() => toggleSelect(comment.id)}
                          onToggleStar={() => toggleStar(comment.id)}
                          onToggleArchive={() => toggleArchive(comment.id)}
                          onLike={() => handleLikeComment(comment)}
                          onSelect={() => setFocusedIndex(-1)}
                          onReply={() => {}}
                          savedReplies={savedReplies}
                          onAddSavedReply={addSavedReply}
                          onDeleteSavedReply={deleteSavedReply}
                          authToken={authToken}
                          sessionEmail={sessionEmail}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
          </section>
        </div>
      </div>
    </main>
  );
}
