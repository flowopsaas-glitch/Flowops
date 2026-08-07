import { useState, useEffect, useRef, useCallback } from "react";
import { MapPin, Clock, Building2, User } from "lucide-react";
import { searchAddresses, AddressEntry } from "../api/addressBookApi";

interface AddressAutocompleteProps {
  value: string;
  onChange: (value: string) => void;
  /** Called when a saved address is selected — provides all fields */
  onSelect?: (entry: AddressEntry) => void;
  /** Filter: SENDER | RECEIVER | BOTH */
  type?: string;
  placeholder?: string;
  className?: string;
}

/**
 * World-class address autocomplete — shows suggestions from the tenant's
 * address book as they type. Most-used addresses appear first.
 * When selected, auto-fills name, phone, email, city — not just the address.
 */
export default function AddressAutocomplete({
  value,
  onChange,
  onSelect,
  type,
  placeholder = "Start typing an address...",
  className = "",
}: AddressAutocompleteProps) {
  const [suggestions, setSuggestions] = useState<AddressEntry[]>([]);
  const [open, setOpen] = useState(false);
  const [focused, setFocused] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Debounced search
  const search = useCallback(
    (query: string) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(async () => {
        try {
          const results = await searchAddresses(query, type);
          setSuggestions(results);
          setOpen(results.length > 0);
        } catch {
          setSuggestions([]);
        }
      }, 200);
    },
    [type],
  );

  useEffect(() => {
    if (focused && value.length >= 1) {
      search(value);
    } else if (!focused) {
      // Delay closing so click can register
      setTimeout(() => setOpen(false), 150);
    }
  }, [value, focused, search]);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleSelect = (entry: AddressEntry) => {
    onChange(entry.address + (entry.city ? `, ${entry.city}` : ""));
    onSelect?.(entry);
    setOpen(false);
  };

  return (
    <div ref={wrapperRef} className="relative">
      <div className="relative">
        <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-white/30" />
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => { setFocused(true); if (value.length >= 1) search(value); }}
          onBlur={() => setFocused(false)}
          placeholder={placeholder}
          className={`w-full rounded-xl border border-white/10 bg-white/5 pl-9 pr-3 py-2 text-sm text-white placeholder-white/30 outline-none focus:border-sky-400/40 focus:ring-1 focus:ring-sky-400/20 ${className}`}
        />
      </div>

      {/* Dropdown */}
      {open && suggestions.length > 0 && (
        <div className="absolute z-50 mt-1 w-full max-h-64 overflow-y-auto rounded-xl border border-white/10 bg-[#0d1b2a] shadow-2xl backdrop-blur-xl">
          {suggestions.map((entry) => (
            <button
              key={entry.id}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => handleSelect(entry)}
              className="w-full text-left px-3 py-2.5 hover:bg-white/5 transition border-b border-white/5 last:border-0"
            >
              <div className="flex items-start gap-2">
                <div className="mt-0.5 h-6 w-6 rounded-lg bg-sky-500/10 border border-sky-500/20 flex items-center justify-center flex-shrink-0">
                  {entry.company ? (
                    <Building2 className="h-3 w-3 text-sky-400" />
                  ) : (
                    <User className="h-3 w-3 text-sky-400" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-white truncate">
                      {entry.label || entry.name}
                    </span>
                    {entry.usageCount > 0 && (
                      <span className="flex items-center gap-0.5 text-[9px] text-white/30">
                        <Clock className="h-2.5 w-2.5" />
                        {entry.usageCount}x
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-white/50 truncate">
                    {entry.address}{entry.city ? `, ${entry.city}` : ""}
                  </p>
                  {entry.phone && (
                    <p className="text-[10px] text-white/30">{entry.phone}</p>
                  )}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
