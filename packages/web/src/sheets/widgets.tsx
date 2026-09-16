import type { CSSProperties, ReactNode } from "react";
import {
  defaultForField,
  getByPath,
  setByPath,
  tryEvaluateFormula,
  type FieldDef,
  type ResourceValue,
} from "@topper/shared";
import { uploadFile } from "../api.ts";

type WidgetProps = {
  field: FieldDef;
  data: Record<string, unknown>;
  pathPrefix?: string;
  disabled?: boolean;
  onPatch: (path: string, value: unknown) => void;
};

type Widget = (props: WidgetProps) => ReactNode;

export const widgets: Record<string, Widget> = {
  resourceBar: ResourceBar,
  portrait: Portrait,
};

export function FieldControl(props: WidgetProps) {
  const widgetName = props.field.widget;
  const Widget = widgetName ? widgets[widgetName] : undefined;
  if (Widget) return <Widget {...props} />;
  switch (props.field.type) {
    case "resource":
      return <ResourceBar {...props} />;
    case "list":
      return <ListField {...props} />;
    case "stat":
      return <StatField {...props} />;
    default:
      return <PrimitiveField {...props} />;
  }
}

function fullPath(prefix: string | undefined, path: string) {
  return prefix ? `${prefix}.${path}` : path;
}

function PrimitiveField({ field, data, pathPrefix, disabled, onPatch }: WidgetProps) {
  const path = fullPath(pathPrefix, field.path);
  const value = getByPath(data, path);
  const style: CSSProperties = {};
  if (field.type === "textarea") style.minHeight = 96;

  if (field.type === "checkbox") {
    return (
      <label className="field">
        <span>{field.label}</span>
        <input
          type="checkbox"
          checked={Boolean(value)}
          disabled={disabled}
          onChange={(e) => onPatch(path, e.target.checked)}
        />
      </label>
    );
  }

  if (field.type === "select") {
    return (
      <label className="field">
        <span>{field.label}</span>
        <select
          value={String(value ?? "")}
          disabled={disabled}
          onChange={(e) => onPatch(path, e.target.value)}
        >
          <option value="">—</option>
          {(field.options ?? []).map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      </label>
    );
  }

  const tag = field.type === "textarea" ? "textarea" : "input";
  const inputType = field.type === "number" || field.type === "stat" ? "number" : "text";
  return (
    <label className="field">
      <span>{field.label}</span>
      {tag === "textarea" ? (
        <textarea
          value={String(value ?? "")}
          disabled={disabled}
          onChange={(e) => onPatch(path, e.target.value)}
          style={style}
        />
      ) : (
        <input
          type={inputType}
          value={value == null ? "" : String(value)}
          disabled={disabled}
          min={field.min}
          max={field.max}
          onChange={(e) =>
            onPatch(path, inputType === "number" ? Number(e.target.value) : e.target.value)
          }
        />
      )}
    </label>
  );
}

function StatField(props: WidgetProps) {
  const path = fullPath(props.pathPrefix, props.field.path);
  const value = getByPath(props.data, path);
  const derived = props.field.formula ? tryEvaluateFormula(props.field.formula, props.data) : null;
  return (
    <label className="field">
      <span>{props.field.label}</span>
      <input
        type="number"
        value={value == null ? "" : String(value)}
        disabled={props.disabled}
        onChange={(e) => props.onPatch(path, Number(e.target.value))}
      />
      {derived != null ? <span className="stat-mod">mod {derived >= 0 ? `+${derived}` : derived}</span> : null}
    </label>
  );
}

function asResource(value: unknown): ResourceValue {
  if (value && typeof value === "object" && "current" in value && "max" in value) {
    return {
      current: Number((value as ResourceValue).current) || 0,
      max: Number((value as ResourceValue).max) || 0,
    };
  }
  return { current: 0, max: 0 };
}

function ResourceBar({ field, data, pathPrefix, disabled, onPatch }: WidgetProps) {
  const path = fullPath(pathPrefix, field.path);
  const resource = asResource(getByPath(data, path));
  const pct = resource.max > 0 ? Math.max(0, Math.min(100, (resource.current / resource.max) * 100)) : 0;
  return (
    <div className="field resource-bar">
      <span>{field.label}</span>
      <div className="resource-track">
        <div className="resource-fill" style={{ width: `${pct}%` }} />
      </div>
      <div className="resource-inputs">
        <input
          type="number"
          value={resource.current}
          disabled={disabled}
          onChange={(e) => onPatch(path, { ...resource, current: Number(e.target.value) })}
        />
        <span>/</span>
        <input
          type="number"
          value={resource.max}
          disabled={disabled}
          onChange={(e) => onPatch(path, { ...resource, max: Number(e.target.value) })}
        />
      </div>
    </div>
  );
}

function Portrait({ field, data, pathPrefix, disabled, onPatch }: WidgetProps) {
  const path = fullPath(pathPrefix, field.path);
  const url = String(getByPath(data, path) ?? "");
  return (
    <div className="field">
      <span>{field.label}</span>
      <div className="portrait-widget">
        {url ? <img src={url} alt="" /> : <div className="placeholder" />}
        <input
          type="file"
          accept="image/*"
          disabled={disabled}
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            const uploaded = await uploadFile(file);
            onPatch(path, uploaded);
          }}
        />
      </div>
    </div>
  );
}

function ListField({ field, data, pathPrefix, disabled, onPatch }: WidgetProps) {
  const path = fullPath(pathPrefix, field.path);
  const items = (getByPath(data, path) as Record<string, unknown>[] | undefined) ?? [];
  const itemFields = field.itemFields ?? [];

  function emptyItem() {
    let item: Record<string, unknown> = {};
    for (const sub of itemFields) {
      item = setByPath(item, sub.path, defaultForField(sub));
    }
    return item;
  }

  const hasResourceCols =
    itemFields.some((f) => f.path === "current") && itemFields.some((f) => f.path === "max");
  const rowClass = hasResourceCols
    ? "list-row resource"
    : itemFields.some((f) => f.path === "key")
      ? "list-row custom"
      : "list-row";

  return (
    <div className="field">
      <span>{field.label}</span>
      {items.map((item, index) => (
        <div className={rowClass} key={`${path}-${index}`}>
          {itemFields.map((sub) => (
            <input
              key={sub.id}
              type={sub.type === "number" || sub.type === "stat" ? "number" : "text"}
              value={String(getByPath(item, sub.path) ?? "")}
              placeholder={sub.label}
              disabled={disabled}
              onChange={(e) => {
                const next = items.map((row, i) =>
                  i === index
                    ? setByPath(row, sub.path, sub.type === "number" || sub.type === "stat" ? Number(e.target.value) : e.target.value)
                    : row,
                );
                onPatch(path, next);
              }}
            />
          ))}
          <button
            className="btn small danger"
            type="button"
            disabled={disabled}
            onClick={() => onPatch(path, items.filter((_, i) => i !== index))}
          >
            ×
          </button>
        </div>
      ))}
      <button
        className="btn small"
        type="button"
        disabled={disabled}
        onClick={() => onPatch(path, [...items, emptyItem()])}
      >
        Add
      </button>
    </div>
  );
}
