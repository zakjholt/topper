import { useParams } from "react-router-dom";
import { MapView } from "../map/MapView.tsx";
import { SheetRenderer } from "../sheets/SheetRenderer.tsx";
import { useSession } from "../auth.ts";
import { Sidebar } from "../table/Sidebar.tsx";
import { TableProvider, useTable } from "../table/TableProvider.tsx";

function TableChrome() {
  const { snapshot, send, openCharacterId, setOpenCharacterId } = useTable();
  const { data } = useSession();
  const character = snapshot?.characters.find((ch) => ch.id === openCharacterId);
  const canEdit = Boolean(
    character && data?.user && (snapshot?.table.role === "gm" || character.ownerId === data.user.id),
  );

  return (
    <div className="table-page">
      <MapView />
      <Sidebar />
      {character ? (
        <SheetRenderer
          character={character}
          canEdit={canEdit}
          onClose={() => setOpenCharacterId(null)}
          onPatch={(path, value) =>
            send({ type: "patch_character", characterId: character.id, path, value })
          }
        />
      ) : null}
    </div>
  );
}

export function TablePage() {
  const { tableId } = useParams();
  if (!tableId) return null;
  return (
    <TableProvider tableId={tableId}>
      <TableChrome />
    </TableProvider>
  );
}
