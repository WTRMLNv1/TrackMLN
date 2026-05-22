import { useEffect, useRef, useState } from "react";

export type AppSelectOption = {
  value: string;
  label: string;
  sublabel?: string;
};

type Props = {
  options: AppSelectOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
};

export function AppSelect({ options, value, onChange, placeholder = "Choose a tracked app" }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const selected = options.find((o) => o.value === value);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleSelect = (val: string) => {
    onChange(val);
    setOpen(false);
  };

  return (
    <div className={`app-select${open ? " app-select--open" : ""}`} ref={ref}>
      <button
        className="app-select__trigger"
        onClick={() => setOpen((v) => !v)}
        type="button"
      >
        <span className={`app-select__value${!selected ? " app-select__value--placeholder" : ""}`}>
          {selected ? selected.label : placeholder}
        </span>
        <svg
          className="app-select__chevron"
          fill="none"
          height="16"
          viewBox="0 0 16 16"
          width="16"
        >
          <path
            d="M4 6l4 4 4-4"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.5"
          />
        </svg>
      </button>

      {open && (
        <div className="app-select__dropdown">
          <div className="app-select__list">
            {options.map((opt) => (
              <button
                className={`app-select__option${opt.value === value ? " app-select__option--selected" : ""}`}
                key={opt.value}
                onClick={() => handleSelect(opt.value)}
                type="button"
              >
                <span className="app-select__option-label">{opt.label}</span>
                {opt.sublabel && (
                  <span className="app-select__option-sublabel">{opt.sublabel}</span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
