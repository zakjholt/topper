import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { useTable } from "../table/TableProvider.tsx";

function isTypingTarget(target: EventTarget | null) {
  const el = target as HTMLElement | null;
  if (!el) return false;
  return (
    el.tagName === "INPUT" ||
    el.tagName === "TEXTAREA" ||
    el.tagName === "SELECT" ||
    el.isContentEditable
  );
}

function IconPlus() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <path d="M10 4.2v11.6M4.2 10h11.6" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

function IconDots() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <circle cx="5" cy="10" r="1.35" fill="currentColor" />
      <circle cx="10" cy="10" r="1.35" fill="currentColor" />
      <circle cx="15" cy="10" r="1.35" fill="currentColor" />
    </svg>
  );
}

function IconRename() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <path
        d="M4.4 13.2 12.8 4.8c.6-.6 1.6-.6 2.2 0l.2.2c.6.6.6 1.6 0 2.2L6.8 15.6H4.4v-2.4Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path d="M11.6 6 14 8.4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function IconCopy() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <rect x="7.2" y="7.2" width="8.2" height="8.2" rx="1.4" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M12.8 7.2V5.6c0-.8-.6-1.4-1.4-1.4H5.6C4.8 4.2 4.2 4.8 4.2 5.6v5.8c0 .8.6 1.4 1.4 1.4h1.6"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      />
    </svg>
  );
}

function IconTrash() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <path d="M4.4 6.2h11.2" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M8 6.2V4.8c0-.6.4-1 1-1h2c.6 0 1 .4 1 1v1.4" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M5.8 6.2 6.6 15c.1.7.6 1.2 1.3 1.2h4.2c.7 0 1.2-.5 1.3-1.2l.8-8.8"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function SceneBar() {
  const { snapshot, send } = useTable();
  const isGm = snapshot?.table.role === "gm";
  const scenes = snapshot?.scenes ?? [];
  const activeSceneId = snapshot?.activeSceneId ?? null;
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [menuId, setMenuId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const renameOnArrive = useRef(false);
  const expectedCount = useRef<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!renameOnArrive.current || expectedCount.current === null) return;
    if (scenes.length !== expectedCount.current || !activeSceneId) return;
    const newest = [...scenes].sort((a, b) => a.sortOrder - b.sortOrder).at(-1);
    if (!newest || newest.id !== activeSceneId) return;
    renameOnArrive.current = false;
    expectedCount.current = null;
    setEditingId(newest.id);
    setDraft(newest.name);
    setMenuId(null);
  }, [activeSceneId, scenes]);

  useEffect(() => {
    if (!editingId) return;
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [editingId]);

  useEffect(() => {
    if (!menuId) return;
    function onPointer(e: PointerEvent) {
      const target = e.target as Element | null;
      if (target?.closest(".scene-menu, .scene-tab-more")) return;
      setMenuId(null);
      setConfirmDelete(false);
    }
    window.addEventListener("pointerdown", onPointer);
    return () => window.removeEventListener("pointerdown", onPointer);
  }, [menuId]);

  useEffect(() => {
    if (!isGm || scenes.length === 0) return;
    function onKey(e: KeyboardEvent) {
      if (isTypingTarget(e.target) || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key !== "[" && e.key !== "]") return;
      e.preventDefault();
      const index = scenes.findIndex((scene) => scene.id === activeSceneId);
      if (index < 0) return;
      const next = e.key === "]" ? (index + 1) % scenes.length : (index - 1 + scenes.length) % scenes.length;
      const scene = scenes[next];
      if (!scene || scene.id === activeSceneId) return;
      setMenuId(null);
      send({ type: "switch_scene", sceneId: scene.id });
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [activeSceneId, isGm, scenes, send]);

  if (!snapshot || scenes.length === 0) return null;

  function startEdit(id: string, name: string) {
    if (!isGm) return;
    setEditingId(id);
    setDraft(name);
    setMenuId(null);
    setConfirmDelete(false);
  }

  function commitEdit() {
    if (!editingId) return;
    const scene = scenes.find((item) => item.id === editingId);
    const name = draft.trim();
    setEditingId(null);
    if (!scene || !name || name === scene.name) return;
    send({ type: "rename_scene", sceneId: editingId, name });
  }

  function onRenameKey(e: ReactKeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      commitEdit();
    }
    if (e.key === "Escape") {
      e.preventDefault();
      setEditingId(null);
    }
  }

  function onRenameSubmit(e: FormEvent) {
    e.preventDefault();
    commitEdit();
  }

  function addScene(duplicate = false) {
    if (!isGm) return;
    renameOnArrive.current = !duplicate;
    expectedCount.current = scenes.length + 1;
    setMenuId(null);
    setConfirmDelete(false);
    send({ type: "create_scene", duplicate: duplicate || undefined });
  }

  function removeScene(id: string) {
    if (!isGm || scenes.length <= 1) return;
    send({ type: "delete_scene", sceneId: id });
    setMenuId(null);
    setConfirmDelete(false);
  }

  return (
    <div className="scene-bar" onPointerDown={(e) => e.stopPropagation()}>
      <div className="scene-bar-inner" role="tablist" aria-label="Scenes">
        {scenes.map((scene) => {
          const active = scene.id === activeSceneId;
          const editing = editingId === scene.id;
          const menuOpen = menuId === scene.id;
          return (
            <div key={scene.id} className={`scene-tab-wrap ${active ? "is-active" : ""} ${menuOpen ? "is-open" : ""}`}>
              {editing ? (
                <form className="scene-rename" onSubmit={onRenameSubmit}>
                  <input
                    ref={inputRef}
                    className="scene-rename-field"
                    value={draft}
                    maxLength={48}
                    aria-label="Scene name"
                    onChange={(e) => setDraft(e.target.value)}
                    onBlur={commitEdit}
                    onKeyDown={onRenameKey}
                  />
                </form>
              ) : (
                <div className={`scene-tab ${active ? "is-active" : ""}`}>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={active}
                    className="scene-tab-name"
                    disabled={!isGm}
                    onClick={() => {
                      if (!isGm || active) return;
                      setMenuId(null);
                      send({ type: "switch_scene", sceneId: scene.id });
                    }}
                    onDoubleClick={() => startEdit(scene.id, scene.name)}
                    onContextMenu={(e) => {
                      if (!isGm) return;
                      e.preventDefault();
                      setMenuId(scene.id);
                      setConfirmDelete(false);
                    }}
                  >
                    {scene.name}
                  </button>
                  {isGm && (active || menuOpen) ? (
                    <button
                      type="button"
                      className={`scene-tab-more ${menuOpen ? "is-active" : ""}`}
                      aria-label={`${scene.name} options`}
                      aria-expanded={menuOpen}
                      onClick={() => {
                        setMenuId((current) => (current === scene.id ? null : scene.id));
                        setConfirmDelete(false);
                      }}
                    >
                      <IconDots />
                    </button>
                  ) : null}
                </div>
              )}
              {menuOpen ? (
                <div className="scene-menu" role="menu">
                  <button type="button" role="menuitem" onClick={() => startEdit(scene.id, scene.name)}>
                    <IconRename /> Rename
                  </button>
                  <button type="button" role="menuitem" onClick={() => addScene(true)}>
                    <IconCopy /> Duplicate
                  </button>
                  {scenes.length > 1 ? (
                    <>
                      <div className="scene-menu-sep" />
                      {confirmDelete ? (
                        <button
                          type="button"
                          role="menuitem"
                          className="danger"
                          onClick={() => removeScene(scene.id)}
                        >
                          <IconTrash /> Delete this scene?
                        </button>
                      ) : (
                        <button
                          type="button"
                          role="menuitem"
                          className="danger"
                          onClick={() => setConfirmDelete(true)}
                        >
                          <IconTrash /> Delete
                        </button>
                      )}
                    </>
                  ) : (
                    <p className="scene-menu-hint">Keep at least one scene</p>
                  )}
                </div>
              ) : null}
            </div>
          );
        })}
        {isGm ? (
          <button type="button" className="scene-add" aria-label="New scene" onClick={() => addScene()}>
            <IconPlus />
            <span className="scene-tip">New scene</span>
          </button>
        ) : null}
      </div>
    </div>
  );
}
