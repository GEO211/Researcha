import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Search, X } from 'lucide-react';
import { cn } from '@/lib/utils';

function normalizeSearch(value) {
  return String(value || '').trim().toLowerCase();
}

export function toSearchableOptions(items = []) {
  return items.map((item) => ({
    value: item.value,
    label: item.label,
    hint: item.hint,
    searchText: item.searchText || item.label,
  }));
}

export function SearchableSelect({
  value,
  onChange,
  options = [],
  placeholder = 'Select option',
  searchPlaceholder = 'Search…',
  emptyMessage = 'No matches found',
  required = false,
  disabled = false,
  className,
  name,
}) {
  const listId = useId();
  const rootRef = useRef(null);
  const searchRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const selected = useMemo(
    () => options.find((option) => String(option.value) === String(value)),
    [options, value],
  );

  const filtered = useMemo(() => {
    const needle = normalizeSearch(query);
    if (!needle) return options;
    return options.filter((option) => {
      const haystack = normalizeSearch(
        option.searchText || `${option.label} ${option.hint || ''}`,
      );
      return haystack.includes(needle);
    });
  }, [options, query]);

  useEffect(() => {
    if (!open) return undefined;

    function handlePointerDown(event) {
      if (rootRef.current?.contains(event.target)) return;
      setOpen(false);
      setQuery('');
    }

    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        setOpen(false);
        setQuery('');
      }
    }

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    const frame = requestAnimationFrame(() => searchRef.current?.focus());

    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
      cancelAnimationFrame(frame);
    };
  }, [open]);

  function selectOption(optionValue) {
    onChange?.(String(optionValue));
    setOpen(false);
    setQuery('');
  }

  function clearSelection(event) {
    event.stopPropagation();
    onChange?.('');
    setQuery('');
  }

  return (
    <div ref={rootRef} className={cn('relative', className)}>
      {name ? (
        <input
          type="hidden"
          name={name}
          value={value || ''}
          required={required}
          readOnly
        />
      ) : null}

      <div
        className={cn(
          'flex w-full items-center gap-1 rounded-xl border bg-white shadow-sm transition',
          'focus-within:ring-2 focus-within:ring-cyan-100',
          disabled && 'cursor-not-allowed bg-slate-50',
          open ? 'border-cyan-500 ring-2 ring-cyan-100' : 'border-slate-300 hover:border-slate-400',
        )}
      >
        <button
          type="button"
          disabled={disabled}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={listId}
          onClick={() => {
            if (disabled) return;
            setOpen((current) => !current);
            if (open) setQuery('');
          }}
          className={cn(
            'min-w-0 flex-1 truncate px-3 py-2.5 text-left text-sm outline-none',
            disabled && 'cursor-not-allowed text-slate-400',
            !selected && required ? 'text-slate-400' : 'font-medium text-slate-900',
          )}
        >
          {selected ? selected.label : placeholder}
        </button>
        {selected && !disabled ? (
          <button
            type="button"
            onClick={clearSelection}
            className="rounded-md p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
            aria-label="Clear selection"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        ) : null}
        <button
          type="button"
          disabled={disabled}
          onClick={() => {
            if (disabled) return;
            setOpen((current) => !current);
            if (open) setQuery('');
          }}
          className="px-2.5 py-2.5 text-slate-400 outline-none disabled:cursor-not-allowed"
          aria-label={open ? 'Close options' : 'Open options'}
        >
          <ChevronDown className={cn('h-4 w-4 transition', open && 'rotate-180 text-cyan-600')} />
        </button>
      </div>

      {open ? (
        <div
          className={cn(
            'absolute z-50 mt-2 w-full overflow-hidden rounded-2xl border border-slate-200/90 bg-white',
            'shadow-xl shadow-slate-900/10 ring-1 ring-slate-900/5',
          )}
        >
          <div className="border-b border-slate-100 bg-slate-50/80 p-2.5">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                ref={searchRef}
                type="text"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={searchPlaceholder}
                className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100"
              />
            </div>
            <p className="mt-2 px-1 text-[11px] text-slate-500">
              {filtered.length} of {options.length} shown
            </p>
          </div>

          <ul
            id={listId}
            role="listbox"
            className="max-h-64 overflow-y-auto p-1.5"
          >
            {filtered.length === 0 ? (
              <li className="px-3 py-8 text-center text-sm text-slate-500">{emptyMessage}</li>
            ) : (
              filtered.map((option) => {
                const isSelected = String(option.value) === String(value);
                return (
                  <li key={option.value} role="option" aria-selected={isSelected}>
                    <button
                      type="button"
                      onClick={() => selectOption(option.value)}
                      className={cn(
                        'flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition',
                        isSelected
                          ? 'bg-cyan-50 text-cyan-950 ring-1 ring-cyan-200'
                          : 'text-slate-800 hover:bg-slate-50',
                      )}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{option.label}</span>
                        {option.hint ? (
                          <span className="mt-0.5 block truncate text-xs text-slate-500">{option.hint}</span>
                        ) : null}
                      </span>
                      {isSelected ? (
                        <Check className="mt-0.5 h-4 w-4 shrink-0 text-cyan-700" aria-hidden />
                      ) : null}
                    </button>
                  </li>
                );
              })
            )}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
