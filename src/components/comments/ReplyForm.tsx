import { useState, useRef, useEffect } from "react";
import type { EnrichedComment, SavedReply } from "./types";

const platformCharLimits: Record<string, number> = {
  youtube: 10000,
  facebook: 8000,
  instagram: 2200,
  bluesky: 300,
  x: 280,
};

export default function ReplyForm({
  comment,
  savedReplies,
  onAddSavedReply,
  onDeleteSavedReply,
  authToken,
  onSuccess,
  onCancel,
  replySuccess,
  sessionEmail,
}: {
  comment: EnrichedComment;
  savedReplies: SavedReply[];
  onAddSavedReply: (label: string, text: string) => void;
  onDeleteSavedReply: (id: string) => void;
  authToken: string | null;
  onSuccess: () => void;
  onCancel: () => void;
  replySuccess: boolean;
  sessionEmail: string | null;
}) {
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSaved, setShowSaved] = useState(false);
  const [showSaveForm, setShowSaveForm] = useState(false);
  const [saveLabel, setSaveLabel] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const charLimit = platformCharLimits[comment.platform] || 10000;

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!showSaved) return;
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowSaved(false);
        setShowSaveForm(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [showSaved]);

  function autoGrow() {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 160) + "px";
  }

  function insertSavedReply(reply: SavedReply) {
    const replaced = reply.text.replace(/\{\{author\}\}/g, comment.authorName);
    setText(replaced);
    setShowSaved(false);
    setTimeout(() => {
      textareaRef.current?.focus();
      autoGrow();
    }, 0);
  }

  function handleSaveReply() {
    if (!saveLabel.trim() || !text.trim()) return;
    onAddSavedReply(saveLabel.trim(), text.trim());
    setSaveLabel("");
    setShowSaveForm(false);
  }

  async function send() {
    if (!text.trim() || !authToken) return;
    setSending(true);
    setError(null);
    try {
      const res = await fetch("/api/comments/reply", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${authToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          platform: comment.platform,
          commentId: comment.replyId ?? comment.id,
          text: text.trim(),
          platformAccountId: comment.accountId,
        }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || "Reply failed");
      setText("");
      onSuccess();
    } catch (e: any) {
      setError(e?.message || "Reply failed");
    } finally {
      setSending(false);
    }
  }

  if (replySuccess) {
    return (
      <div className="flex items-center gap-1.5 text-xs text-emerald-400 py-2">
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
        </svg>
        Reply sent
      </div>
    );
  }

  return (
    <div className="space-y-2" onClick={(e) => e.stopPropagation()}>
      <p className="text-[11px] text-white/25">
        Replying as <span className="text-white/45 font-medium">{comment.accountLabel}</span>
      </p>

      <div className="relative">
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => { setText(e.target.value); autoGrow(); }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          placeholder="Write a reply..."
          disabled={sending}
          rows={2}
          className="w-full rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-white/20 focus:bg-white/[0.04] disabled:opacity-50 resize-none transition-colors"
        />

        {/* Character count */}
        <div className="absolute bottom-2 right-3 flex items-center gap-2">
          <span className={`text-[10px] tabular-nums ${text.length > charLimit ? "text-red-400" : "text-white/20"}`}>
            {text.length}/{charLimit}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-2">
        {/* Saved replies toggle */}
        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => setShowSaved(!showSaved)}
            className="h-8 w-8 rounded-lg border border-white/[0.06] bg-white/[0.02] flex items-center justify-center text-white/30 hover:text-white/60 hover:bg-white/[0.05] transition-all"
            title="Saved replies"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M17.593 3.322c1.1.128 1.907 1.077 1.907 2.185V21L12 17.25 4.5 21V5.507c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0 1 11.186 0Z" />
            </svg>
          </button>

          {showSaved && (
            <div className="absolute bottom-full left-0 mb-2 w-72 rounded-xl border border-white/10 bg-[#0c0c0c] shadow-2xl z-50 overflow-hidden">
              <div className="px-3 py-2 border-b border-white/[0.06] flex items-center justify-between">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-white/30">Saved Replies</p>
                {text.trim() && (
                  <button
                    onClick={() => setShowSaveForm(!showSaveForm)}
                    className="text-[10px] font-medium text-blue-400 hover:text-blue-300 transition-colors"
                  >
                    {showSaveForm ? "Cancel" : "+ Save current"}
                  </button>
                )}
              </div>

              {/* Save current reply form */}
              {showSaveForm && (
                <div className="px-3 py-2 border-b border-white/[0.06] space-y-2">
                  <input
                    type="text"
                    value={saveLabel}
                    onChange={(e) => setSaveLabel(e.target.value)}
                    placeholder="Reply name (e.g. 'Thank you')"
                    className="w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs text-white placeholder:text-white/25 focus:outline-none focus:border-white/20"
                    onKeyDown={(e) => { if (e.key === "Enter") handleSaveReply(); }}
                    autoFocus
                  />
                  <p className="text-[10px] text-white/20 line-clamp-1">Text: {text.slice(0, 60)}{text.length > 60 ? "..." : ""}</p>
                  <p className="text-[10px] text-white/15">Tip: Use {"{{author}}"} for the commenter's name</p>
                  <button
                    onClick={handleSaveReply}
                    disabled={!saveLabel.trim()}
                    className="w-full rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-30 px-3 py-1.5 text-xs font-medium text-white transition-colors"
                  >
                    Save Reply
                  </button>
                </div>
              )}

              {savedReplies.length === 0 && !showSaveForm ? (
                <div className="px-3 py-4 text-center">
                  <p className="text-xs text-white/30">No saved replies yet</p>
                  <p className="text-[10px] text-white/20 mt-1">Type a reply and click &ldquo;+ Save current&rdquo;</p>
                </div>
              ) : (
                <div className="max-h-48 overflow-y-auto">
                  {savedReplies.map((r) => (
                    <div
                      key={r.id}
                      className="flex items-center gap-1 border-b border-white/[0.04] last:border-0 hover:bg-white/[0.04] transition-colors"
                    >
                      <button
                        onClick={() => insertSavedReply(r)}
                        className="flex-1 text-left px-3 py-2.5"
                      >
                        <p className="text-xs font-medium text-white/70">{r.label}</p>
                        <p className="text-[11px] text-white/30 line-clamp-1 mt-0.5">{r.text}</p>
                      </button>
                      <button
                        onClick={() => onDeleteSavedReply(r.id)}
                        className="shrink-0 px-2 py-1 text-white/15 hover:text-red-400 transition-colors"
                        title="Delete saved reply"
                      >
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex-1" />

        <button
          onClick={onCancel}
          className="rounded-lg px-3 py-1.5 text-xs font-medium text-white/40 hover:text-white/70 transition-colors"
        >
          Cancel
        </button>

        <button
          onClick={send}
          disabled={sending || !text.trim() || text.length > charLimit}
          className="rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-30 disabled:hover:bg-blue-600 px-4 py-1.5 text-xs font-semibold text-white transition-colors flex items-center gap-1.5"
        >
          {sending ? (
            <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          ) : (
            <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 12 3.269 3.125A59.769 59.769 0 0 1 21.485 12 59.768 59.768 0 0 1 3.27 20.875L5.999 12Zm0 0h7.5" />
            </svg>
          )}
          Send
        </button>
      </div>

      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
}
