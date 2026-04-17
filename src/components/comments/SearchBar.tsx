import { useState, useEffect, useRef } from "react";
import { MagnifyingGlass, X as XIcon } from "@phosphor-icons/react/dist/ssr";

export default function SearchBar({
  value,
  onChange,
}: {
  value: string;
  onChange: (query: string) => void;
}) {
  const [local, setLocal] = useState(value);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    setLocal(value);
  }, [value]);

  function handleChange(val: string) {
    setLocal(val);
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => onChange(val), 300);
  }

  return (
    <div className="relative">
      <MagnifyingGlass
        className="absolute left-3.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/25 pointer-events-none"
        weight="bold"
      />
      <input
        type="text"
        data-search-input
        value={local}
        onChange={(e) => handleChange(e.target.value)}
        placeholder="Search comments... (press /)"
        className="w-full rounded-xl border border-white/[0.06] bg-white/[0.02] pl-10 pr-9 py-2.5 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-white/15 focus:bg-white/[0.03] transition-colors"
      />
      {local && (
        <button
          onClick={() => { setLocal(""); onChange(""); }}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-white/25 hover:text-white/60 transition-colors"
        >
          <XIcon className="w-3.5 h-3.5" weight="bold" />
        </button>
      )}
    </div>
  );
}
