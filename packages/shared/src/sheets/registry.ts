import { genericSchema } from "./schemas/generic.ts";
import type { SheetSchema } from "./types.ts";

export const sheetSchemas: Record<string, SheetSchema> = {
  generic: genericSchema,
};

export function getSheetSchema(id: string): SheetSchema | undefined {
  return sheetSchemas[id];
}

export function listSheetSchemas(): SheetSchema[] {
  return Object.values(sheetSchemas);
}
