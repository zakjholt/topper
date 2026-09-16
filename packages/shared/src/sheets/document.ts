import type { FieldDef, SheetSchema } from "./types.ts";

const FORBIDDEN = new Set(["__proto__", "prototype", "constructor"]);

export function splitPath(path: string): string[] {
  return path.split(".").filter((part) => part.length > 0 && !FORBIDDEN.has(part));
}

export function getByPath(data: unknown, path: string): unknown {
  const parts = splitPath(path);
  let current: unknown = data;
  for (const part of parts) {
    if (current == null || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

export function setByPath(data: Record<string, unknown>, path: string, value: unknown): Record<string, unknown> {
  const parts = splitPath(path);
  if (parts.length === 0) return data;
  const root = cloneJson(data) as Record<string, unknown>;
  let cursor: Record<string, unknown> = root;
  for (let i = 0; i < parts.length - 1; i += 1) {
    const key = parts[i]!;
    const next = cursor[key];
    if (next == null || typeof next !== "object") {
      const upcoming = parts[i + 1]!;
      cursor[key] = /^\d+$/.test(upcoming) ? [] : {};
    } else {
      cursor[key] = Array.isArray(next) ? [...next] : { ...(next as Record<string, unknown>) };
    }
    cursor = cursor[key] as Record<string, unknown>;
  }
  cursor[parts[parts.length - 1]!] = value;
  return root;
}

export function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function defaultForField(field: FieldDef): unknown {
  if (field.defaultValue !== undefined) return cloneJson(field.defaultValue);
  switch (field.type) {
    case "text":
    case "textarea":
    case "select":
      return "";
    case "number":
    case "stat":
      return 0;
    case "checkbox":
      return false;
    case "resource":
      return { current: 10, max: 10 };
    case "list":
      return [];
  }
}

export function createEmptyDocument(schema: SheetSchema): Record<string, unknown> {
  let doc: Record<string, unknown> = {};
  for (const section of schema.sections) {
    for (const field of section.fields) {
      doc = setByPath(doc, field.path, defaultForField(field));
    }
  }
  return doc;
}
