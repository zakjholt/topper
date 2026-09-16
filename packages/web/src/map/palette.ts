import { useCallback, useEffect, useState } from "react";

export const PALETTE_KEY = "topper.paint.palette";
export const MAX_PALETTE_COLORS = 16;
export const MIN_PALETTE_COLORS = 1;
export const CUSTOM_PRESET_ID = "custom";

const HEX = /^#[0-9a-f]{6}$/;

export type PalettePreset = {
  id: string;
  name: string;
  colors: string[];
};

export const PALETTE_PRESETS: PalettePreset[] = [
  {
    id: "dungeon",
    name: "Dungeon",
    colors: [
      "#e8dcc4",
      "#c4b49a",
      "#6b6358",
      "#5c4033",
      "#8b5a2b",
      "#3a5a7a",
      "#4f8a62",
      "#3d4f3a",
      "#a33a32",
      "#2a2116",
    ],
  },
  {
    id: "wilds",
    name: "Wilds",
    colors: [
      "#e7d7a8",
      "#c4a574",
      "#7a5a32",
      "#4f7a3a",
      "#2f5a32",
      "#1e3a28",
      "#6b8f71",
      "#3a6a7a",
      "#8a3a32",
      "#d4c4a0",
    ],
  },
  {
    id: "harbor",
    name: "Harbor",
    colors: [
      "#f0e4c8",
      "#e0c090",
      "#c4a070",
      "#5a8aaa",
      "#2a5a7a",
      "#1a3a4a",
      "#7ab0a0",
      "#d4786a",
      "#8a6a50",
      "#f4f0e0",
    ],
  },
  {
    id: "ember",
    name: "Ember",
    colors: [
      "#f0d090",
      "#e09040",
      "#c45028",
      "#8a2018",
      "#4a1010",
      "#1a1210",
      "#6a4030",
      "#a07040",
      "#d4c4a0",
      "#2a1810",
    ],
  },
  {
    id: "night",
    name: "Night",
    colors: [
      "#d8d0e8",
      "#8a7ab0",
      "#4a3a78",
      "#2a1a48",
      "#1a1228",
      "#3a5a9a",
      "#6a40a0",
      "#c4a060",
      "#e8e0d0",
      "#5a2040",
    ],
  },
  {
    id: "frost",
    name: "Frost",
    colors: ["#f4f0e8", "#d0d8e0", "#a0b8c8", "#6a88a0", "#3a5068", "#1e3048", "#4a7060", "#c0a888", "#8aa0b0", "#e8f0f4"],
  },
  {
    id: "ash",
    name: "Ash",
    colors: ["#f0ece4", "#d4d0c8", "#b0aaa0", "#8a847c", "#6a645c", "#4a443c", "#2e2a26", "#1a1816"],
  },
];

export const DEFAULT_PRESET = PALETTE_PRESETS[0]!;
export const DEFAULT_PALETTE = DEFAULT_PRESET.colors;

export type PaletteState = {
  colors: string[];
  presetId: string;
};

export function normalizeHex(value: string): string | null {
  const hex = value.trim().toLowerCase();
  if (HEX.test(hex)) return hex;
  if (/^#[0-9a-f]{3}$/.test(hex)) {
    return `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`;
  }
  return null;
}

export function matchPresetId(colors: string[]): string {
  const key = colors.join(",");
  return PALETTE_PRESETS.find((preset) => preset.colors.join(",") === key)?.id ?? CUSTOM_PRESET_ID;
}

export function presetName(presetId: string): string {
  if (presetId === CUSTOM_PRESET_ID) return "Custom";
  return PALETTE_PRESETS.find((preset) => preset.id === presetId)?.name ?? "Custom";
}

function sanitizeColors(input: unknown): string[] | null {
  if (!Array.isArray(input)) return null;
  const colors: string[] = [];
  for (const item of input) {
    if (typeof item !== "string") continue;
    const hex = normalizeHex(item);
    if (!hex || colors.includes(hex)) continue;
    colors.push(hex);
    if (colors.length >= MAX_PALETTE_COLORS) break;
  }
  return colors.length >= MIN_PALETTE_COLORS ? colors : null;
}

export function readPalette(): PaletteState {
  try {
    const raw = window.localStorage.getItem(PALETTE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as { colors?: unknown };
      const colors = sanitizeColors(parsed?.colors);
      if (colors) return { colors, presetId: matchPresetId(colors) };
    }
  } catch {
    /* ignore */
  }
  return { colors: [...DEFAULT_PALETTE], presetId: DEFAULT_PRESET.id };
}

function writePalette(colors: string[]) {
  try {
    window.localStorage.setItem(PALETTE_KEY, JSON.stringify({ colors }));
  } catch {
    /* ignore */
  }
}

export function defaultPaintColor(): string {
  const colors = readPalette().colors;
  if (colors.includes("#c4b49a")) return "#c4b49a";
  return colors[0] ?? DEFAULT_PALETTE[0] ?? "#c4b49a";
}

export function nextPaletteColor(colors: string[], current: string | null, direction: 1 | -1): string {
  const first = colors[0] ?? DEFAULT_PALETTE[0] ?? "#c4b49a";
  const last = colors[colors.length - 1] ?? first;
  const index = colors.indexOf((current ?? "").toLowerCase());
  if (index < 0) return direction === 1 ? first : last;
  return colors[(index + direction + colors.length) % colors.length] ?? first;
}

export function usePaintPalette() {
  const [state, setState] = useState<PaletteState>(readPalette);

  useEffect(() => {
    writePalette(state.colors);
  }, [state.colors]);

  const applyPreset = useCallback((id: string) => {
    const preset = PALETTE_PRESETS.find((item) => item.id === id);
    if (!preset) return;
    setState({ colors: [...preset.colors], presetId: preset.id });
  }, []);

  const setColorAt = useCallback((index: number, value: string) => {
    const hex = normalizeHex(value);
    if (!hex) return;
    setState((current) => {
      if (current.colors[index] === hex) return current;
      if (current.colors.some((color, i) => i !== index && color === hex)) return current;
      const colors = current.colors.map((color, i) => (i === index ? hex : color));
      return { colors, presetId: matchPresetId(colors) };
    });
  }, []);

  const addColor = useCallback((value: string) => {
    const hex = normalizeHex(value);
    if (!hex) return;
    setState((current) => {
      if (current.colors.includes(hex) || current.colors.length >= MAX_PALETTE_COLORS) return current;
      const colors = [...current.colors, hex];
      return { colors, presetId: matchPresetId(colors) };
    });
  }, []);

  const removeColorAt = useCallback((index: number) => {
    setState((current) => {
      if (current.colors.length <= MIN_PALETTE_COLORS) return current;
      if (index < 0 || index >= current.colors.length) return current;
      const colors = current.colors.filter((_, i) => i !== index);
      return { colors, presetId: matchPresetId(colors) };
    });
  }, []);

  return { ...state, applyPreset, setColorAt, addColor, removeColorAt };
}
