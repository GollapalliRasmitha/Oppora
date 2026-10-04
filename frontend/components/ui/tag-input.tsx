"use client";

import { X } from "lucide-react";
import { useId, useState, type KeyboardEvent } from "react";
import { cn } from "@/lib/utils";
import { inputClass } from "./input";

/** Editable list of short text tags (skills, interests, locations). Enter or comma adds; × removes. */
export function TagInput({
  label,
  value,
  onChange,
  placeholder,
  description,
}: {
  label: string;
  value: string[];
  onChange: (v: string[]) => void;
  placeholder?: string;
  description?: string;
}) {
  const id = useId();
  const [draft, setDraft] = useState("");

  const add = () => {
    const t = draft.trim().replace(/,$/, "");
    if (t && !value.some((v) => v.toLowerCase() === t.toLowerCase())) onChange([...value, t]);
    setDraft("");
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      add();
    } else if (e.key === "Backspace" && !draft && value.length) {
      onChange(value.slice(0, -1));
    }
  };

  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-semibold text-ink">
        {label}
      </label>
      {description && <p className="-mt-1 mb-1.5 text-meta text-ink-3">{description}</p>}
      <ul aria-label={`${label} added`} className={cn("mb-2 flex flex-wrap gap-1.5", !value.length && "hidden")}>
        {value.map((t) => (
          <li key={t} className="inline-flex items-center gap-1 rounded-full border border-violet/30 bg-purple/15 py-0.5 pl-3 pr-1 text-sm font-medium text-ink">
            {t}
            <button
              type="button"
              aria-label={`Remove ${t}`}
              onClick={() => onChange(value.filter((v) => v !== t))}
              className="relative inline-flex size-6 items-center justify-center rounded-full text-ink-3 focus-ring after:absolute after:-inset-2.5 after:content-[''] hover:bg-tint/10 hover:text-ink"
            >
              <X aria-hidden className="size-3.5" />
            </button>
          </li>
        ))}
      </ul>
      <input
        id={id}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={onKeyDown}
        onBlur={add}
        placeholder={placeholder}
        className={inputClass}
      />
    </div>
  );
}
