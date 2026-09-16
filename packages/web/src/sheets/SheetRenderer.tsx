import { getSheetSchema, type CharacterState } from "@topper/shared";
import { FieldControl } from "./widgets.tsx";

export function SheetRenderer({
  character,
  canEdit,
  onPatch,
  onClose,
}: {
  character: CharacterState;
  canEdit: boolean;
  onPatch: (path: string, value: unknown) => void;
  onClose: () => void;
}) {
  const schema = getSheetSchema(character.schemaId);
  if (!schema) {
    return (
      <aside className="sheet-drawer">
        <p>Unknown sheet schema: {character.schemaId}</p>
        <button className="btn small" type="button" onClick={onClose}>
          Close
        </button>
      </aside>
    );
  }

  const name = String(character.data.name ?? "Unnamed");

  return (
    <aside className="sheet-drawer">
      <div className="sheet-head">
        <div>
          <h2>{name || "Unnamed"}</h2>
          <p className="muted">{schema.name} sheet</p>
        </div>
        <button className="btn small" type="button" onClick={onClose}>
          Close
        </button>
      </div>
      {schema.sections.map((section) => (
        <section className="sheet-section" key={section.id}>
          <h3>{section.label}</h3>
          <div className={`field-grid cols-${section.columns ?? 1}`}>
            {section.fields.map((field) => (
              <FieldControl
                key={field.id}
                field={field}
                data={character.data}
                disabled={!canEdit}
                onPatch={onPatch}
              />
            ))}
          </div>
        </section>
      ))}
    </aside>
  );
}
