import { useEffect, useRef, useState, type ChangeEvent, type InputHTMLAttributes } from "react";

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type"> & {
  value: number;
  onCommit: (value: number) => void;
};

function isTypedEdit(evt: ChangeEvent<HTMLInputElement>) {
  const inputType = (evt.nativeEvent as InputEvent).inputType ?? "";
  return inputType.startsWith("insert") || inputType.startsWith("delete");
}

/** Number input that applies typed values on Enter/blur, so partial keystrokes never reach the map. */
export function NumberField({ value, onCommit, onBlur, onKeyDown, ...rest }: Props) {
  const [draft, setDraft] = useState(String(value));
  const dirty = useRef(false);

  useEffect(() => {
    if (!dirty.current) setDraft(String(value));
  }, [value]);

  function commit(raw: string) {
    dirty.current = false;
    const next = Number(raw);
    if (raw.trim() === "" || !Number.isFinite(next)) {
      setDraft(String(value));
      return;
    }
    onCommit(next);
  }

  return (
    <input
      {...rest}
      type="number"
      value={draft}
      onChange={(evt) => {
        setDraft(evt.target.value);
        if (isTypedEdit(evt)) dirty.current = true;
        else commit(evt.target.value);
      }}
      onBlur={(evt) => {
        if (dirty.current) commit(draft);
        onBlur?.(evt);
      }}
      onKeyDown={(evt) => {
        if (evt.key === "Enter") evt.currentTarget.blur();
        if (evt.key === "Escape") {
          dirty.current = false;
          setDraft(String(value));
        }
        onKeyDown?.(evt);
      }}
    />
  );
}
