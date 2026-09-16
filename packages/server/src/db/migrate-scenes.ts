import { sql } from "./index.ts";

function exec<T extends Record<string, unknown> = Record<string, unknown>>(query: unknown) {
  return query as Promise<T[]>;
}

export async function migrateScenes() {
  await exec(sql`
    CREATE TABLE IF NOT EXISTS scenes (
      id text PRIMARY KEY,
      table_id text NOT NULL REFERENCES tables(id) ON DELETE CASCADE,
      name text NOT NULL,
      sort_order integer NOT NULL DEFAULT 0,
      image_url text,
      width integer NOT NULL DEFAULT 2000,
      height integer NOT NULL DEFAULT 1400,
      grid_size integer NOT NULL DEFAULT 70,
      snap boolean NOT NULL DEFAULT true,
      offset_x integer NOT NULL DEFAULT 0,
      offset_y integer NOT NULL DEFAULT 0,
      fills jsonb NOT NULL DEFAULT '{}'::jsonb,
      edges jsonb NOT NULL DEFAULT '{}'::jsonb,
      created_at timestamp NOT NULL DEFAULT now()
    )
  `);
  await exec(sql`CREATE INDEX IF NOT EXISTS scenes_table_id_idx ON scenes (table_id)`);
  await exec(sql`ALTER TABLE tables ADD COLUMN IF NOT EXISTS active_scene_id text`);
  await exec(sql`ALTER TABLE tokens ADD COLUMN IF NOT EXISTS scene_id text`);

  const maps = await exec<{ name: string | null }>(
    sql`SELECT to_regclass('public.maps') AS name`,
  );
  if (maps[0]?.name) {
    await exec(sql`
      INSERT INTO scenes (
        id, table_id, name, sort_order, image_url, width, height, grid_size, snap, offset_x, offset_y, fills, edges
      )
      SELECT
        gen_random_uuid()::text,
        table_id,
        'Scene 1',
        0,
        image_url,
        width,
        height,
        grid_size,
        snap,
        offset_x,
        offset_y,
        COALESCE(fills, '{}'::jsonb),
        COALESCE(edges, '{}'::jsonb)
      FROM maps
      WHERE NOT EXISTS (SELECT 1 FROM scenes s WHERE s.table_id = maps.table_id)
    `);
    await exec(sql`DROP TABLE maps`);
  }

  await exec(sql`
    INSERT INTO scenes (id, table_id, name, sort_order)
    SELECT gen_random_uuid()::text, t.id, 'Scene 1', 0
    FROM tables t
    WHERE NOT EXISTS (SELECT 1 FROM scenes s WHERE s.table_id = t.id)
  `);

  await exec(sql`
    UPDATE tables t
    SET active_scene_id = s.id
    FROM scenes s
    WHERE s.table_id = t.id AND t.active_scene_id IS NULL
  `);

  await exec(sql`
    UPDATE tokens tok
    SET scene_id = t.active_scene_id
    FROM tables t
    WHERE t.id = tok.table_id AND tok.scene_id IS NULL
  `);

  await exec(sql`DELETE FROM tokens WHERE scene_id IS NULL`);

  await exec(sql`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'tokens_scene_id_scenes_id_fk'
      ) THEN
        ALTER TABLE tokens
          ADD CONSTRAINT tokens_scene_id_scenes_id_fk
          FOREIGN KEY (scene_id) REFERENCES scenes(id) ON DELETE CASCADE;
      END IF;
    END $$
  `);
  await exec(sql`CREATE INDEX IF NOT EXISTS tokens_scene_id_idx ON tokens (scene_id)`);
  await exec(sql`ALTER TABLE tokens ALTER COLUMN scene_id SET NOT NULL`);
}
