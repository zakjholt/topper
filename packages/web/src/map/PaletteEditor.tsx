import { useEffect, useRef } from "react";
import type { PalettePreset } from "./palette.ts";
import { MAX_PALETTE_COLORS, MIN_PALETTE_COLORS, PALETTE_PRESETS, presetName } from "./palette.ts";

function IconPlus() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <path d="M10 4.5v11M4.5 10h11" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

export function PaletteEditor({
  colors,
  presetId,
  onSelectPreset,
  onSetColor,
  onAddColor,
  onRemoveColor,
  onClose,
}: {
  colors: string[];
  presetId: string;
  onSelectPreset: (id: string) => void;
  onSetColor: (index: number, color: string) => void;
  onAddColor: (color: string) => void;
  onRemoveColor: (index: number) => void;
  onClose: () => void;
}) {
  const canRemove = colors.length > MIN_PALETTE_COLORS;
  const canAdd = colors.length < MAX_PALETTE_COLORS;
  const addValue = colors[colors.length - 1] ?? "#c4b49a";

  return (
    <div className="toolbar-palette-editor" role="dialog" aria-label="Paint colors">
      <div className="toolbar-palette-head">
        <p>
          Colors
          <span>{presetName(presetId)}</span>
        </p>
        <button type="button" className="toolbar-palette-done" onClick={onClose}>
          Done
        </button>
      </div>
      <div className="toolbar-palette-presets" role="listbox" aria-label="Palette presets">
        {PALETTE_PRESETS.map((preset) => (
          <PresetButton
            key={preset.id}
            preset={preset}
            active={preset.id === presetId}
            onSelect={() => onSelectPreset(preset.id)}
          />
        ))}
      </div>
      <p className="toolbar-palette-caption">This set</p>
      <div className="toolbar-palette-chips">
        {colors.map((color, index) => (
          <div key={`${color}-${index}`} className="palette-chip">
            <label className="palette-chip-face" title={`Change ${color}`} style={{ background: color }}>
              <span className="sr-only">Change color {index + 1}</span>
              <input
                type="color"
                value={color}
                onChange={(evt) => onSetColor(index, evt.target.value)}
              />
            </label>
            {canRemove ? (
              <button
                type="button"
                className="palette-chip-remove"
                aria-label={`Remove ${color}`}
                onClick={() => onRemoveColor(index)}
              >
                ×
              </button>
            ) : null}
          </div>
        ))}
        {canAdd ? (
          <AddColorButton value={addValue} onAdd={onAddColor} />
        ) : null}
      </div>
      <p className="toolbar-palette-hint">Click a color to change it · × removes · + adds</p>
    </div>
  );
}

function AddColorButton({ value, onAdd }: { value: string; onAdd: (color: string) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const onAddRef = useRef(onAdd);
  onAddRef.current = onAdd;

  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    const onChange = () => onAddRef.current(input.value);
    input.addEventListener("change", onChange);
    return () => input.removeEventListener("change", onChange);
  }, []);

  return (
    <label className="palette-chip palette-chip-add" title="Add a color">
      <span className="sr-only">Add a color</span>
      <IconPlus />
      <input
        ref={inputRef}
        type="color"
        defaultValue={value}
        onClick={() => {
          const input = inputRef.current;
          if (input) input.value = value;
        }}
      />
    </label>
  );
}

function PresetButton({
  preset,
  active,
  onSelect,
}: {
  preset: PalettePreset;
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      className={`toolbar-palette-preset ${active ? "is-active" : ""}`}
      role="option"
      aria-selected={active}
      onClick={onSelect}
    >
      <span>{preset.name}</span>
      <span className="toolbar-palette-strip" aria-hidden="true">
        {preset.colors.map((color) => (
          <i key={color} style={{ background: color }} />
        ))}
      </span>
    </button>
  );
}
