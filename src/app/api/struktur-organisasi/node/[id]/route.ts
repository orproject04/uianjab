import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";

/**
 * PATCH /api/struktur-organisasi/node/[id]
 * Body (opsional):
 * {
 *   name?: string,
 *   slug?: string,
 *   order_index?: number,
 *   parent_id?: string|null
 * }
 *
 * - Cegah set parent ke diri sendiri / descendant (hindari loop)
 * - Update parent_id & level + gusur level subtree bila pindah parent
 * - Rebuild jabatan.slug untuk **seluruh subtree** node ini:
 *   HANYA 2 segmen terakhir (dipisah '-') dengan normalisasi aman
 */
export async function PATCH(
    req: NextRequest,
    { params }: { params: { id: string } }
) {
    const client = await pool.connect();
    try {
        const id = params.id;
        const body = await req.json().catch(() => ({} as any));

        const name =
            typeof body.name === "string" ? body.name.trim() : (undefined as string | undefined);
        const slug =
            typeof body.slug === "string" ? body.slug.trim() : (undefined as string | undefined);
        const hasOrder = Object.prototype.hasOwnProperty.call(body, "order_index");
        const order_index = hasOrder ? Number(body.order_index) : (undefined as number | undefined);
        const wantParent = Object.prototype.hasOwnProperty.call(body, "parent_id");
        const parent_id: string | null | undefined = wantParent
            ? body.parent_id === null
                ? null
                : String(body.parent_id)
            : undefined;

        await client.query("BEGIN");

        // Node saat ini
        const curRes = await client.query(
            "SELECT id, parent_id, level FROM struktur_organisasi WHERE id::text = $1",
            [id]
        );
        if (curRes.rowCount === 0) {
            await client.query("ROLLBACK");
            return NextResponse.json({ ok: false, error: "Node tidak ditemukan" }, { status: 404 });
        }
        const cur = curRes.rows[0] as { id: string; parent_id: string | null; level: number };

        let newParentId: string | null = cur.parent_id;
        let newLevel = cur.level;
        let deltaLevel = 0;

        // Ganti parent?
        if (wantParent) {
            newParentId = parent_id;

            // Tidak boleh ke diri sendiri
            if (newParentId === id) {
                await client.query("ROLLBACK");
                return NextResponse.json(
                    { ok: false, error: "parent_id tidak boleh diri sendiri" },
                    { status: 400 }
                );
            }

            if (newParentId) {
                // Pastikan bukan descendant
                const sub = await client.query(
                    `
                        WITH RECURSIVE subtree AS (
                            SELECT id FROM struktur_organisasi WHERE id::text = $1
                        UNION ALL
                        SELECT c.id
                        FROM struktur_organisasi c
                                 JOIN subtree s ON c.parent_id = s.id
                            )
                        SELECT id::text AS id FROM subtree
                    `,
                    [id]
                );
                const descendants = new Set<string>(sub.rows.map((r: any) => r.id));
                if (descendants.has(newParentId)) {
                    await client.query("ROLLBACK");
                    return NextResponse.json(
                        { ok: false, error: "parent_id tidak boleh salah satu descendant" },
                        { status: 400 }
                    );
                }

                // Level parent baru
                const p = await client.query(
                    "SELECT id, level FROM struktur_organisasi WHERE id::text = $1",
                    [newParentId]
                );
                if (p.rowCount === 0) {
                    await client.query("ROLLBACK");
                    return NextResponse.json(
                        { ok: false, error: "parent_id tidak ditemukan" },
                        { status: 400 }
                    );
                }
                newLevel = Number(p.rows[0].level) + 1;
            } else {
                // jadi root
                newLevel = 0;
            }

            deltaLevel = newLevel - cur.level;

            // Update parent & level node ini
            await client.query(
                "UPDATE struktur_organisasi SET parent_id = $1::uuid, level = $2, updated_at = NOW() WHERE id::text = $3",
                [newParentId, newLevel, id]
            );

            // Gusur level subtree (kecuali node yang sudah diupdate)
            if (deltaLevel !== 0) {
                await client.query(
                    `
                        WITH RECURSIVE subtree AS (
                            SELECT id FROM struktur_organisasi WHERE id::text = $1
                        UNION ALL
                        SELECT c.id
                        FROM struktur_organisasi c
                                 JOIN subtree s ON c.parent_id = s.id
                            )
                        UPDATE struktur_organisasi t
                        SET level = t.level + $2, updated_at = NOW()
                        WHERE t.id IN (
                            SELECT id FROM subtree WHERE id <> $3::uuid
                            )
                    `,
                    [id, deltaLevel, id]
                );
            }
        }

        // Update field sederhana
        if (name !== undefined) {
            await client.query(
                "UPDATE struktur_organisasi SET nama_jabatan = $1, updated_at = NOW() WHERE id::text = $2",
                [name, id]
            );
        }
        if (slug !== undefined) {
            await client.query(
                "UPDATE struktur_organisasi SET slug = $1, updated_at = NOW() WHERE id::text = $2",
                [slug, id]
            );
        }
        if (hasOrder && Number.isFinite(order_index)) {
            await client.query(
                "UPDATE struktur_organisasi SET order_index = $1, updated_at = NOW() WHERE id::text = $2",
                [order_index, id]
            );
        }

        // Rebuild slug jabatan untuk seluruh subtree (HANYA 2 segmen terakhir, separator '-')
        await rebuildJabatanSlugsForSubtreeLast2(client, id);

        await client.query("COMMIT");
        return NextResponse.json({ ok: true });
    } catch (e) {
        await pool.query("ROLLBACK").catch(() => {});
        console.error("[struktur-organisasi][PATCH]", e);
        return NextResponse.json({ ok: false, error: "Internal error" }, { status: 500 });
    } finally {
        client.release();
    }
}

/**
 * Rebuild jabatan.slug untuk seluruh subtree node:
 * - Ambil rantai slug dari root → node
 * - Normalisasi tiap part:
 *     lower-case, trim, spasi→'-', non [a-z0-9-] dibuang, rapikan '--'
 * - Ambil **2 part terakhir** saja
 * - Gabung dengan '-' → simpan ke jabatan.slug
 *
 * Catatan:
 * - Mengasumsikan jabatan.struktur_id merefer ke struktur_organisasi.id
 */
async function rebuildJabatanSlugsForSubtreeLast2(client: any, rootIdText: string) {
    await client.query(
        `
            WITH RECURSIVE
                subtree AS (
                    SELECT id, parent_id, slug, level
                    FROM struktur_organisasi
                    WHERE id::text = $1
            UNION ALL
            SELECT so.id, so.parent_id, so.slug, so.level
            FROM struktur_organisasi so
                     JOIN subtree s ON so.parent_id = s.id
                ),
    upwalk AS (
      -- mulai dari node di subtree, lalu naik ke atas sampai root global
      SELECT s.id AS node_id,
             s.id AS anc_id,
             s.slug AS anc_slug,
             s.level AS anc_level,
             s.parent_id
      FROM subtree s
      UNION ALL
      SELECT u.node_id,
             p.id,
             p.slug,
             p.level,
             p.parent_id
      FROM upwalk u
      JOIN struktur_organisasi p ON p.id = u.parent_id
      WHERE u.parent_id IS NOT NULL
    ),
    parts AS (
      -- normalisasi & buang empty
      SELECT
        node_id,
        NULLIF(
          regexp_replace(
            replace(lower(trim(anc_slug)), ' ', '-'),
            '[^a-z0-9-]+',
            '',
            'g'
          ),
          ''
        ) AS part,
        anc_level
      FROM upwalk
    ),
    grouped AS (
      SELECT
        node_id,
        ARRAY_REMOVE(ARRAY_AGG(part ORDER BY anc_level), NULL) AS parts_arr
      FROM parts
      GROUP BY node_id
    ),
    last2 AS (
      SELECT
        node_id,
        CASE
          WHEN array_length(parts_arr, 1) >= 2
            THEN parts_arr[(array_length(parts_arr,1)-1):array_length(parts_arr,1)]
          ELSE parts_arr
        END AS last_two
      FROM grouped
    ),
    paths AS (
      SELECT
        node_id,
        regexp_replace(
          COALESCE(array_to_string(last_two, '-'), ''),
          '-{2,}',
          '-',
          'g'
        ) AS short_slug
      FROM last2
    )
            UPDATE jabatan
            SET slug = paths.short_slug,
                updated_at = NOW()
                FROM paths
            WHERE jabatan.struktur_id = paths.node_id
        `,
        [rootIdText]
    );
}
