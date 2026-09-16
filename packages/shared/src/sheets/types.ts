export type FieldType =
  | "text"
  | "textarea"
  | "number"
  | "checkbox"
  | "select"
  | "stat"
  | "resource"
  | "list";

export type FieldDef = {
  id: string;
  label: string;
  type: FieldType;
  path: string;
  widget?: string;
  formula?: string;
  min?: number;
  max?: number;
  options?: string[];
  defaultValue?: unknown;
  itemFields?: FieldDef[];
};

export type SectionDef = {
  id: string;
  label: string;
  columns?: 1 | 2 | 3;
  fields: FieldDef[];
};

export type SheetSchema = {
  id: string;
  name: string;
  version: number;
  sections: SectionDef[];
};

export type ResourceValue = {
  current: number;
  max: number;
};
