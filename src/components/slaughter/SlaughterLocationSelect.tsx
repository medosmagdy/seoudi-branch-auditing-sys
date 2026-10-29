import { useId, useMemo, useRef, useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  slaughterLocationError,
  slaughterLocationOptions,
  type SlaughterLocationKind,
} from "@/lib/slaughter-locations";
import { slaughterNameKey } from "@/lib/slaughter-model";
export function SlaughterLocationSelect({
  kind,
  label,
  names,
  value,
  onChange,
  onCreate,
  disabled = false,
}: {
  kind: SlaughterLocationKind;
  label: string;
  names: string[];
  value: string;
  onChange: (value: string) => void;
  onCreate: (kind: SlaughterLocationKind, name: string) => Promise<string>;
  disabled?: boolean;
}) {
  const id = useId(),
    [open, setOpen] = useState(false),
    [name, setName] = useState(""),
    [pending, setPending] = useState(false),
    [error, setError] = useState("");
  const lock = useRef(false);
  const options = useMemo(() => slaughterLocationOptions([...names, value]), [names, value]);
  const selected =
    options.find((option) => slaughterNameKey(option) === slaughterNameKey(value)) ?? "";
  const save = async () => {
    if (lock.current) return;
    const clean = name.trim().replace(/\s+/g, " ");
    if (!clean || clean.length > 120) {
      setError("أدخل اسمًا من 1 إلى 120 حرفًا");
      return;
    }
    const existing = options.find((option) => slaughterNameKey(option) === slaughterNameKey(clean));
    if (existing) {
      onChange(existing);
      setOpen(false);
      setName("");
      setError("");
      return;
    }
    lock.current = true;
    setPending(true);
    setError("");
    try {
      const saved = await onCreate(kind, clean);
      onChange(saved);
      setOpen(false);
      setName("");
    } catch (e) {
      setError(slaughterLocationError(e));
    } finally {
      lock.current = false;
      setPending(false);
    }
  };
  return (
    <div className="space-y-2">
      <label htmlFor={id} className="block px-1 text-xs font-medium">
        {label}
      </label>
      <div className="flex items-center gap-2">
        <select
          id={id}
          aria-label={label}
          className="h-10 min-w-0 flex-1 rounded-md border bg-background px-3 text-sm"
          value={selected}
          disabled={disabled || pending}
          onChange={(e) => onChange(e.target.value)}
        >
          <option value="">اختر {label}</option>
          {options.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
        <Button
          type="button"
          variant="outline"
          className="h-10 shrink-0 gap-1.5 px-3 text-xs"
          aria-expanded={open}
          aria-controls={`${id}-add`}
          disabled={disabled || pending}
          onClick={() => {
            setOpen(!open);
            setError("");
          }}
        >
          <Plus className="size-3.5" />
          إضافة جديد
        </Button>
      </div>
      {open && (
        <div id={`${id}-add`} className="space-y-2 rounded-lg border bg-muted/20 p-3">
          <label htmlFor={`${id}-name`} className="block text-xs">
            اسم {label} الجديد
          </label>
          <Input
            id={`${id}-name`}
            autoFocus
            maxLength={120}
            value={name}
            disabled={pending}
            placeholder={`اكتب اسم ${label}`}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void save();
              } else if (e.key === "Escape" && !pending) {
                setOpen(false);
                setError("");
              }
            }}
          />
          {error && (
            <p className="text-xs text-destructive" role="alert">
              {error}
            </p>
          )}
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              disabled={pending || disabled}
              onClick={() => void save()}
            >
              {pending ? "جاري الحفظ…" : "حفظ واختيار"}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={pending}
              onClick={() => {
                setOpen(false);
                setName("");
                setError("");
              }}
            >
              إلغاء
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
