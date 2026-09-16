import type { SheetSchema } from "../types.ts";

export const genericSchema: SheetSchema = {
  id: "generic",
  name: "Generic",
  version: 1,
  sections: [
    {
      id: "identity",
      label: "Identity",
      columns: 1,
      fields: [
        { id: "name", label: "Name", type: "text", path: "name" },
        {
          id: "portrait",
          label: "Portrait",
          type: "text",
          path: "portrait",
          widget: "portrait",
        },
        { id: "description", label: "Description", type: "textarea", path: "description" },
      ],
    },
    {
      id: "resources",
      label: "Resources",
      columns: 1,
      fields: [
        {
          id: "hp",
          label: "Hit Points",
          type: "resource",
          path: "hp",
          widget: "resourceBar",
          defaultValue: { current: 10, max: 10 },
        },
        {
          id: "resources",
          label: "Other resources",
          type: "list",
          path: "resources",
          itemFields: [
            { id: "name", label: "Name", type: "text", path: "name" },
            { id: "current", label: "Current", type: "number", path: "current", defaultValue: 0 },
            { id: "max", label: "Max", type: "number", path: "max", defaultValue: 0 },
          ],
        },
      ],
    },
    {
      id: "stats",
      label: "Stats",
      columns: 1,
      fields: [
        {
          id: "stats",
          label: "Stats",
          type: "list",
          path: "stats",
          defaultValue: [
            { name: "STR", value: 10 },
            { name: "DEX", value: 10 },
            { name: "CON", value: 10 },
            { name: "INT", value: 10 },
            { name: "WIS", value: 10 },
            { name: "CHA", value: 10 },
          ],
          itemFields: [
            { id: "name", label: "Name", type: "text", path: "name" },
            { id: "value", label: "Value", type: "number", path: "value", defaultValue: 10 },
          ],
        },
      ],
    },
    {
      id: "notes",
      label: "Notes",
      fields: [
        { id: "notes", label: "Notes", type: "textarea", path: "notes" },
      ],
    },
    {
      id: "custom",
      label: "Custom fields",
      fields: [
        {
          id: "custom",
          label: "Fields",
          type: "list",
          path: "custom",
          itemFields: [
            { id: "key", label: "Key", type: "text", path: "key" },
            { id: "value", label: "Value", type: "text", path: "value" },
          ],
        },
      ],
    },
  ],
};
