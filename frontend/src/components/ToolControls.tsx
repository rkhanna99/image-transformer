import { LoaderCircle, Palette } from "lucide-react";

export const RATIO_OPTIONS = [
  "Default",
  "1:1",
  "4:5",
  "3:4",
  "4:3",
  "5:4",
  "3:2",
  "2:3",
  "8:10",
  "10:8",
  "11:14",
  "14:11",
  "16:9",
  "9:16",
  "Custom",
];
const QUICK_RATIOS = ["Default", "1:1", "4:5", "3:2", "16:9"];

export function GenerateActions({
  busy,
  disabled,
  one,
  all,
}: {
  busy: boolean;
  disabled: boolean;
  one: () => void;
  all: () => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-2">
      <button
        data-testid="generate-selected"
        disabled={busy || disabled}
        className="btn-primary justify-center"
        onClick={one}
      >
        <WandIcon busy={busy} /> Generate selected
      </button>
      <button
        data-testid="generate-all"
        disabled={busy || disabled}
        className="btn-secondary justify-center"
        onClick={all}
      >
        Generate all
      </button>
    </div>
  );
}

export function RatioSelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const custom = !RATIO_OPTIONS.slice(0, -1).includes(value);
  return (
    <>
      <select
        className="field"
        value={custom ? "Custom" : value}
        onChange={(event) =>
          onChange(event.target.value === "Custom" ? "21:9" : event.target.value)
        }
      >
        {RATIO_OPTIONS.map((ratio) => (
          <option key={ratio}>{ratio}</option>
        ))}
      </select>
      {custom && (
        <input
          className="field mt-2"
          placeholder="W:H (e.g. 21:9)"
          value={value === "Custom" ? "" : value}
          onChange={(event) => onChange(event.target.value)}
        />
      )}
      <div className="mt-2 flex flex-wrap gap-1.5" aria-label="Quick aspect ratios">
        {QUICK_RATIOS.map((ratio) => (
          <button
            type="button"
            key={ratio}
            onClick={() => onChange(ratio)}
            className={`rounded-lg border px-2 py-1 text-xs ${value === ratio ? "border-[var(--accent-brand)] bg-[var(--bg-subtle)] font-semibold" : "border-[var(--border-subtle)] text-[var(--fg-secondary)]"}`}
          >
            {ratio}
          </button>
        ))}
      </div>
    </>
  );
}

export function WandIcon({ busy }: { busy: boolean }) {
  return busy ? <LoaderCircle size={16} className="animate-spin" /> : <Palette size={16} />;
}
