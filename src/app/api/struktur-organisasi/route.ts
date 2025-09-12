// src/app/api/struktur-organisasi/route.ts
import {NextRequest, NextResponse} from "next/server";
import pool from "@/lib/db";
import {getUserFromReq, hasRole} from "@/lib/auth";

type Row = {
    id: string;
    parent_id: string | null;
    name: string;
    slug: string;
    level: number;
    order_index: number;
    created_at: string;
};

export async function GET(req: NextRequest) {
    try {
        const user = getUserFromReq(req);
        if (!user) {
            return NextResponse.json({error: "Unauthorized"}, {status: 401});
        }
        const {searchParams} = new URL(req.url);
        const root_id = searchParams.get("root_id");

        if (root_id) {
            const {rows} = await pool.query<Row>(
                `
                    WITH RECURSIVE subtree AS (SELECT id, parent_id, name, slug, level, order_index
                                               FROM struktur_organisasi
                                               WHERE id::text = $1
                    UNION ALL
                    SELECT c.id, c.parent_id, c.name, c.slug, c.level, c.order_index
                    FROM struktur_organisasi c
                             JOIN subtree s ON c.parent_id = s.id )
                    SELECT *
                    FROM subtree
                    ORDER BY parent_id NULLS FIRST, order_index ASC
                `,
                [root_id]
            );
            return Response.json(rows);
        }

        const {rows} = await pool.query<Row>(
            `
                SELECT id, parent_id, name, slug, level, order_index
                FROM struktur_organisasi
                ORDER BY parent_id NULLS FIRST, order_index ASC;
            `
        );
        return Response.json(rows);
    } catch (e) {
        console.error(e);
        return Response.json({ok: false, error: "Internal error"}, {status: 500});
    }
}

/**
 * POST /api/struktur-organisasi
 * Body: { parent_id?: string|null, name: string, slug: string, order_index?: number|null }
 * - level = 0 jika parent_id null
 * - level = parent.level + 1 jika ada parent
 * - jika order_index null → set ke (max(order_index)+1) per parent
 */
export async function POST(req: NextRequest) {
    try {
        const user = getUserFromReq(req);
        if (!user || !hasRole(user, ["admin"])) {
            return NextResponse.json({error: "Forbidden"}, {status: 403});
        }
        const body = await req.json().catch(() => ({}));
        let {parent_id, name, slug, order_index} = body || {};
        if (typeof name !== "string" || !name.trim()) {
            return Response.json({ok: false, error: "name wajib diisi"}, {status: 400});
        }
        if (typeof slug !== "string" || !slug.trim()) {
            return Response.json({ok: false, error: "slug wajib diisi"}, {status: 400});
        }
        name = name.trim();
        slug = slug.trim();
        if (parent_id === undefined) parent_id = null;
        if (order_index !== null && order_index !== undefined) {
            if (typeof order_index !== "number" || !Number.isFinite(order_index) || order_index < 0) {
                return Response.json({ok: false, error: "order_index tidak valid"}, {status: 400});
            }
        } else {
            order_index = null; // biar auto
        }

        const {rows} = await pool.query<Row>(
            `
                WITH parent AS (SELECT id, level
                                FROM struktur_organisasi
                                WHERE id
                    ::text = $1
                    )
                   , defaults AS (
                SELECT
                    CASE WHEN $1 IS NULL THEN 0 ELSE (SELECT level FROM parent) + 1 END AS lvl, COALESCE (
                              $3:: int, (
                    SELECT COALESCE (MAX (order_index) + 1, 0)
                    FROM struktur_organisasi
                    WHERE parent_id IS NOT DISTINCT FROM (SELECT id FROM parent)
                    )
                    ) AS ord
                    ), ins AS (
                INSERT
                INTO struktur_organisasi (parent_id, name, slug, level, order_index)
                VALUES (
                    (SELECT id FROM parent), $2, $4, (SELECT lvl FROM defaults), (SELECT ord FROM defaults)
                    )
                    RETURNING id, parent_id, name, slug, level, order_index, created_at
                    )
                SELECT *
                FROM ins;
            `,
            [parent_id, name, order_index, slug]
        );

        return Response.json({ok: true, node: rows[0]});
    } catch (e: any) {
        if (e?.code === "23505") {
            return Response.json({ok: false, error: "Slug sudah dipakai di parent yang sama"}, {status: 409});
        }
        console.error(e);
        return Response.json({ok: false, error: "Internal error"}, {status: 500});
    }
}

/**
 * PATCH /api/struktur-organisasi?id=<UUID>
 * Body: { name?: string, slug?: string, order_index?: number }
 */
export async function PATCH(req: NextRequest) {
    try {
        const user = getUserFromReq(req);
        if (!user || !hasRole(user, ["admin"])) {
            return NextResponse.json({error: "Forbidden"}, {status: 403});
        }
        const {searchParams} = new URL(req.url);
        const id = searchParams.get("id");
        if (!id) return Response.json({ok: false, error: "id diperlukan"}, {status: 400});

        const body = await req.json().catch(() => ({}));
        const {name, slug, order_index} = body ?? {};

        const sets: string[] = [];
        const vals: any[] = [];
        let i = 1;

        if (typeof name === "string") {
            sets.push(`name = $${i++}`);
            vals.push(name.trim());
        }
        if (typeof slug === "string") {
            sets.push(`slug = $${i++}`);
            vals.push(slug.trim());
        }
        if (order_index !== undefined) {
            if (order_index === null) {
                // null → auto set ke MAX+1 pada parent id node tsb
                sets.push(`order_index = (
          SELECT COALESCE(MAX(s2.order_index)+1, 0) FROM struktur_organisasi s2
          WHERE s2.parent_id IS NOT DISTINCT FROM struktur_organisasi.parent_id
        )`);
            } else if (typeof order_index === "number" && Number.isFinite(order_index) && order_index >= 0) {
                sets.push(`order_index = $${i++}`);
                vals.push(order_index);
            } else {
                return Response.json({ok: false, error: "order_index tidak valid"}, {status: 400});
            }
        }

        if (!sets.length) {
            return Response.json({ok: false, error: "Tidak ada field untuk diupdate"}, {status: 400});
        }

        vals.push(id); // WHERE
        const {rowCount, rows} = await pool.query<Row>(
            `
                UPDATE struktur_organisasi
                SET ${sets.join(", ")}
                WHERE id::text = $${i}
                    RETURNING id
                    , parent_id
                    , name
                    , slug
                    , level
                    , order_index
                    , created_at;
            `,
            vals
        );

        if (!rowCount) {
            return Response.json({ok: false, error: "ID tidak ditemukan"}, {status: 404});
        }

        return Response.json({ok: true, data: rows[0]});
    } catch (e: any) {
        if (e?.code === "23505") {
            return Response.json({ok: false, error: "Slug sudah dipakai di parent yang sama"}, {status: 409});
        }
        console.error(e);
        return Response.json({ok: false, error: "Internal error"}, {status: 500});
    }
}

/**
 * DELETE /api/struktur-organisasi?id=<UUID>
 */
export async function DELETE(req: NextRequest) {
    try {
        const user = getUserFromReq(req);
        if (!user || !hasRole(user, ["admin"])) {
            return NextResponse.json({error: "Forbidden"}, {status: 403});
        }
        const {searchParams} = new URL(req.url);
        const id = searchParams.get("id");
        if (!id) return Response.json({ok: false, error: "id diperlukan"}, {status: 400});

        const {rowCount} = await pool.query(
            `
                WITH RECURSIVE subtree AS (SELECT id
                                           FROM struktur_organisasi
                                           WHERE id::text = $1
                UNION ALL
                SELECT c.id
                FROM struktur_organisasi c
                         JOIN subtree s ON c.parent_id = s.id )
                DELETE
                FROM struktur_organisasi
                WHERE id IN (SELECT id FROM subtree);
            `,
            [id]
        );

        return Response.json({ok: true, deleted: rowCount ?? 0});
    } catch (e) {
        console.error(e);
        return Response.json({ok: false, error: "Internal error"}, {status: 500});
    }
}
