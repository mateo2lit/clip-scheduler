import type { ViewMode } from "./types";
import { List, SquaresFour, UsersThree } from "@phosphor-icons/react/dist/ssr";

export default function ViewToggle({
  viewMode,
  setViewMode,
}: {
  viewMode: ViewMode;
  setViewMode: (m: ViewMode) => void;
}) {
  const views: { mode: ViewMode; label: string; icon: JSX.Element }[] = [
    {
      mode: "list",
      label: "List",
      icon: <List className="w-3.5 h-3.5" weight="bold" />,
    },
    {
      mode: "by-post",
      label: "By Post",
      icon: <SquaresFour className="w-3.5 h-3.5" weight="bold" />,
    },
    {
      mode: "by-user",
      label: "By User",
      icon: <UsersThree className="w-3.5 h-3.5" weight="bold" />,
    },
  ];

  return (
    <div className="inline-flex rounded-lg border border-white/10 bg-white/[0.02] p-0.5">
      {views.map((v) => (
        <button
          key={v.mode}
          onClick={() => setViewMode(v.mode)}
          className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-all ${
            viewMode === v.mode
              ? "bg-white/10 text-white shadow-sm"
              : "text-white/35 hover:text-white/60"
          }`}
        >
          {v.icon}
          <span className="hidden sm:inline">{v.label}</span>
        </button>
      ))}
    </div>
  );
}
