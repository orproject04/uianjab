// src/app/api/struktur-organisasi/[id]/route.ts
import {NextRequest, NextResponse} from "next/server";
import pool from "@/lib/db";

const UUID_RE =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const isUuid = (s: string) => UUID_RE.test(s);

export async function PATCH(
    req: NextRequest,
    ctx: { params: Promise<{ id: string }> }
) {
    const client = await pool.connect();
    try {
        const {id} = await ctx.params;
        if (!isUuid(id)) {
            return NextResponse.json({error: "id harus UUID"}, {status: 400});
        }

        const body = await req.json().catch(() => ({} as any));

        const name =
            typeof body.name === "string" ? body.name.trim() : (undefined as string | undefined);
        const slug =
            typeof body.slug === "string" ? body.slug.trim() : (undefined as string | undefined);
        const unit_kerja =
            typeof body.unit_kerja === "string" ? body.unit_kerja.trim() : (undefined as string | undefined);

        const hasOrder = Object.prototype.hasOwnProperty.call(body, "order_index");
        const order_index = hasOrder ? Number(body.order_index) : (undefined as number | undefined);
        if (hasOrder && (!Number.isFinite(order_index) || order_index! < 0)) {
            return NextResponse.json({error: "order_index tidak valid"}, {status: 400});
        }

        const wantParent = Object.prototype.hasOwnProperty.call(body, "parent_id");
        const parent_id: string | null | undefined = wantParent
            ? body.parent_id === null
                ? null
                : String(body.parent_id)
            : undefined;
        if (wantParent && parent_id !== null && !isUuid(parent_id!)) {
            return NextResponse.json({error: "parent_id harus UUID atau null"}, {status: 400});
        }

        await client.query("BEGIN");

        // 1) Ambil node saat ini
        const curRes = await client.query(
            "SELECT id, parent_id, level, slug FROM struktur_organisasi WHERE id = $1::uuid",
            [id]
        );
        if (curRes.rowCount === 0) {
            await client.query("ROLLBACK");
            return NextResponse.json({error: "Node tidak ditemukan"}, {status: 404});
        }
        const cur = curRes.rows[0] as { id: string; parent_id: string | null; level: number; slug: string };

        const newParentId = wantParent ? parent_id! : cur.parent_id;
        const effParent = newParentId;
        const effSlug = slug ?? cur.slug;

        // 2) Validasi parent (exist / bukan descendant / bukan diri sendiri)
        if (wantParent) {
            if (newParentId === id) {
                await client.query("ROLLBACK");
                return NextResponse.json({error: "parent_id tidak boleh diri sendiri"}, {status: 400});
            }
            if (newParentId) {
                const p = await client.query("SELECT id, level FROM struktur_organisasi WHERE id = $1::uuid", [
                    newParentId,
                ]);
                if (p.rowCount === 0) {
                    await client.query("ROLLBACK");
                    return NextResponse.json({error: "parent_id tidak ditemukan"}, {status: 400});
                }
                const sub = await client.query(
                    `
                        WITH RECURSIVE subtree AS (SELECT id
                                                   FROM struktur_organisasi
                                                   WHERE id = $1::uuid
                        UNION ALL
                        SELECT c.id
                        FROM struktur_organisasi c
                                 JOIN subtree s ON c.parent_id = s.id )
                        SELECT id::text AS id
                        FROM subtree
                    `,
                    [id]
                );
                const descendants = new Set<string>(sub.rows.map((r: any) => r.id));
                if (descendants.has(newParentId)) {
                    await client.query("ROLLBACK");
                    return NextResponse.json(
                        {error: "parent_id tidak boleh salah satu descendant"},
                        {status: 400}
                    );
                }
            }
        }

        // 3) PRE-CHECK duplikat (parent efektif + slug efektif)
        if (wantParent || slug !== undefined) {
            const dup = await client.query<{ exists: boolean }>(
                `
                    SELECT EXISTS(SELECT 1
                                  FROM struktur_organisasi
                                  WHERE parent_id IS NOT DISTINCT FROM $1::uuid
                        AND slug = $2
                        AND id <> $3::uuid) AS exists
                `,
                [effParent, effSlug, id]
            );
            if (dup.rows[0]?.exists) {
                await client.query("ROLLBACK");
                return NextResponse.json(
                    {error: "Slug sudah dipakai di parent yang sama"},
                    {status: 409}
                );
            }
        }

        // 4) Update parent (kalau diminta) + perbarui level subtree bila berubah
        if (wantParent) {
            let newLevel: number;
            if (newParentId) {
                const p = await client.query("SELECT level FROM struktur_organisasi WHERE id = $1::uuid", [
                    newParentId,
                ]);
                newLevel = Number(p.rows[0].level) + 1;
            } else {
                newLevel = 0; // jadi root
            }

            const deltaLevel = newLevel - cur.level;

            await client.query(
                "UPDATE struktur_organisasi SET parent_id = $1::uuid, level = $2, updated_at = NOW() WHERE id = $3::uuid",
                [newParentId, newLevel, id]
            );

            if (deltaLevel !== 0) {
                await client.query(
                    `
                        WITH RECURSIVE subtree AS (SELECT id
                                                   FROM struktur_organisasi
                                                   WHERE id = $1::uuid
                        UNION ALL
                        SELECT c.id
                        FROM struktur_organisasi c
                                 JOIN subtree s ON c.parent_id = s.id )
                        UPDATE struktur_organisasi t
                        SET level = t.level + $2,
                            updated_at = NOW()
                        WHERE t.id IN (SELECT id FROM subtree WHERE id <> $3::uuid)
                    `,
                    [id, deltaLevel, id]
                );
            }
        }

        // 5) Update field lain
        const fields: string[] = [];
        const values: any[] = [];
        const setIf = (col: string, val: unknown) => {
            if (val !== undefined) {
                fields.push(`${col} = $${fields.length + 1}`);
                values.push(val);
            }
        };
        setIf("nama_jabatan", name);
        setIf("slug", slug);
        setIf("unit_kerja", unit_kerja);
        if (hasOrder) setIf("order_index", order_index);

        if (fields.length) {
            const q = `
                UPDATE struktur_organisasi
                SET ${fields.join(", ")},
                    updated_at = NOW()
                WHERE id = $${fields.length + 1}::uuid
            `;
            values.push(id);
            await client.query(q, values);
        }

        // 6) Rebuild slug jabatan (2 segmen terakhir) untuk seluruh subtree
        await rebuildJabatanSlugsForSubtreeLast2(client, id);

        await client.query("COMMIT");
        return NextResponse.json({ok: true});
    } catch (e: any) {
        await client.query("ROLLBACK").catch(() => {
        });
        console.error("[struktur-organisasi][PATCH]", e);
        if (e?.code === "23505") {
            return NextResponse.json(
                {error: "Slug sudah dipakai di parent yang sama"},
                {status: 409}
            );
        }
        if (e?.code === "22P02") {
            return NextResponse.json({error: "Parameter harus UUID yang valid"}, {status: 400});
        }
        return NextResponse.json({error: "Internal error"}, {status: 500});
    } finally {
        client.release();
    }
}

export async function DELETE(
    _req: NextRequest,
    ctx: { params: Promise<{ id: string }> }
) {
    try {
        const {id} = await ctx.params;
        if (!isUuid(id)) {
            return NextResponse.json({error: "id harus UUID"}, {status: 400});
        }

        // pastikan ada
        const exists = await pool.query<{ exists: boolean }>(
            `SELECT EXISTS(SELECT 1 FROM struktur_organisasi WHERE id = $1::uuid) AS exists`,
            [id]
        );
        if (!exists.rows[0]?.exists) {
            return NextResponse.json({error: "Node tidak ditemukan"}, {status: 404});
        }

        // hapus node + seluruh subtree
        const {rowCount} = await pool.query(
            `
                WITH RECURSIVE subtree AS (SELECT id
                                           FROM struktur_organisasi
                                           WHERE id = $1::uuid
                UNION ALL
                SELECT c.id
                FROM struktur_organisasi c
                         JOIN subtree s ON c.parent_id = s.id )
                DELETE
                FROM struktur_organisasi
                WHERE id IN (SELECT id FROM subtree)
            `,
            [id]
        );

        return NextResponse.json({ok: true, deleted: rowCount ?? 0});
    } catch (e: any) {
        if (e?.code === "22P02") {
            return NextResponse.json({error: "id harus UUID"}, {status: 400});
        }
        console.error(e);
        return NextResponse.json({error: "Internal error"}, {status: 500});
    }
}

/** Helper: rebuild slug jabatan berdasarkan 2 segmen terakhir jalur struktur */
async function rebuildJabatanSlugsForSubtreeLast2(client: any, rootId: string) {
    await client.query(
        `
            WITH RECURSIVE subtree AS (SELECT id, parent_id, slug, level
                                       FROM struktur_organisasi
                                       WHERE id = $1::uuid
            UNION ALL
            SELECT so.id, so.parent_id, so.slug, so.level
            FROM struktur_organisasi so
                     JOIN subtree s ON so.parent_id = s.id ),
    upwalk AS (
      SELECT s.id AS node_id, s.id AS anc_id, s.slug AS anc_slug, s.level AS anc_level, s.parent_id
      FROM subtree s
      UNION ALL
      SELECT u.node_id, p.id, p.slug, p.level, p.parent_id
      FROM upwalk u
      JOIN struktur_organisasi p ON p.id = u.parent_id
      WHERE u.parent_id IS NOT NULL
    ),
    parts AS (
      SELECT
        node_id,
        NULLIF(
          regexp_replace(replace(lower(trim(anc_slug)), ' ', '-'), '[^a-z0-9-]+', '', 'g'),
          ''
        ) AS part,
        anc_level
      FROM upwalk
    ),
    grouped AS (
      SELECT node_id, ARRAY_REMOVE(ARRAY_AGG(part ORDER BY anc_level), NULL) AS parts_arr
      FROM parts
      GROUP BY node_id
    ),
    last2 AS (
      SELECT node_id,
        CASE
          WHEN array_length(parts_arr, 1) >= 2
            THEN parts_arr[(array_length(parts_arr,1)-1):array_length(parts_arr,1)]
          ELSE parts_arr
        END AS last_two
      FROM grouped
    ),
    paths AS (
      SELECT node_id,
        regexp_replace(COALESCE(array_to_string(last_two, '-'), ''), '-{2,}', '-', 'g') AS short_slug
      FROM last2
    )
            UPDATE jabatan
            SET slug       = paths.short_slug,
                updated_at = NOW() FROM paths
            WHERE jabatan.struktur_id = paths.node_id
        `,
        [rootId]
    );
}
