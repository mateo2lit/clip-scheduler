import { X as XIcon } from "@phosphor-icons/react/dist/ssr";

export default function KeyboardShortcutsHelp({ onClose }: { onClose: () => void }) {
  const shortcuts = [
    { key: "J / K", desc: "Navigate between comments" },
    { key: "M", desc: "Toggle read / unread" },
    { key: "S", desc: "Star / unstar comment" },
    { key: "E", desc: "Archive / unarchive comment" },
    { key: "/", desc: "Focus search bar" },
    { key: "?", desc: "Toggle this help" },
    { key: "Esc", desc: "Close panels" },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative rounded-2xl border border-white/10 bg-[#0a0a0a] shadow-2xl w-full max-w-sm mx-4 overflow-hidden">
        <div className="px-6 py-4 border-b border-white/[0.06] flex items-center justify-between">
          <h3 className="text-sm font-semibold text-white/90">Keyboard Shortcuts</h3>
          <button
            onClick={onClose}
            className="text-white/30 hover:text-white/60 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="px-6 py-4 space-y-3">
          {shortcuts.map(({ key, desc }) => (
            <div key={key} className="flex items-center justify-between">
              <span className="text-sm text-white/60">{desc}</span>
              <kbd className="inline-flex items-center rounded-md border border-white/10 bg-white/[0.04] px-2 py-0.5 text-xs font-mono font-medium text-white/50">
                {key}
              </kbd>
            </div>
          ))}
        </div>
        <div className="px-6 py-3 border-t border-white/[0.06]">
          <p className="text-[11px] text-white/20 text-center">Press ? or Esc to close</p>
        </div>
      </div>
    </div>
  );
}
