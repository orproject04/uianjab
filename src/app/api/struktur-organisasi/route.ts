// src/app/api/struktur-organisasi/route.ts
import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { getUserFromReq, hasRole } from "@/lib/auth";

type Row = {
    id: string;
    parent_id: string | null;
    nama_jabatan: string;
    slug: string;
    unit_kerja: string | null;   // 🔹 baru
    level: number;
    order_index: number;
    created_at: string;
};

export async function GET(req: NextRequest) {
    try {
        const user = getUserFromReq(req);
        if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        const { searchParams } = new URL(req.url);
        const root_id = searchParams.get("root_id");

        if (root_id) {
            const { rows } = await pool.query<Row>(
                `
                    WITH RECURSIVE subtree AS (
                        SELECT id, parent_id, nama_jabatan, slug, unit_kerja, level, order_index
                        FROM struktur_organisasi
                        WHERE id::text = $1
                    UNION ALL
                    SELECT c.id, c.parent_id, c.nama_jabatan, c.slug, c.unit_kerja, c.level, c.order_index
                    FROM struktur_organisasi c
                             JOIN subtree s ON c.parent_id = s.id
                        )
                    SELECT * FROM subtree
                    ORDER BY parent_id NULLS FIRST, order_index ASC
                `,
                [root_id]
            );
            return Response.json(rows);
        }

        const { rows } = await pool.query<Row>(
            `
                SELECT id, parent_id, nama_jabatan, slug, unit_kerja, level, order_index
                FROM struktur_organisasi
                ORDER BY level, order_index ASC
            `
        );
        return Response.json(rows);
    } catch (e) {
        console.error(e);
        return Response.json({ ok: false, error: "Internal error" }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    try {
        const user = getUserFromReq(req);
        if (!user || !hasRole(user, ["admin"])) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }
        const body = await req.json().catch(() => ({}));
        let { parent_id, nama_jabatan, slug, unit_kerja, order_index } = body || {};

        if (!nama_jabatan || typeof nama_jabatan !== "string")
            return Response.json({ ok: false, error: "nama_jabatan wajib diisi" }, { status: 400 });
        if (!slug || typeof slug !== "string")
            return Response.json({ ok: false, error: "slug wajib diisi" }, { status: 400 });

        if (parent_id === undefined) parent_id = null;
        if (order_index !== null && order_index !== undefined) {
            if (typeof order_index !== "number" || !Number.isFinite(order_index) || order_index < 0) {
                return Response.json({ ok: false, error: "order_index tidak valid" }, { status: 400 });
            }
        } else {
            order_index = null;
        }

        const { rows } = await pool.query<Row>(
            `
                WITH parent AS (
                    SELECT id, level FROM struktur_organisasi WHERE id::text = $1
                    ),
                    defaults AS (
                SELECT
                    CASE WHEN $1 IS NULL THEN 0 ELSE (SELECT level FROM parent) + 1 END AS lvl,
                    COALESCE($5::int, (
                    SELECT COALESCE(MAX(order_index)+1, 0)
                    FROM struktur_organisasi
                    WHERE parent_id IS NOT DISTINCT FROM (SELECT id FROM parent)
                    )) AS ord
                    ),
                    ins AS (
                INSERT INTO struktur_organisasi (parent_id, nama_jabatan, slug, unit_kerja, level, order_index)
                VALUES ((SELECT id FROM parent), $2, $3, $4, (SELECT lvl FROM defaults), (SELECT ord FROM defaults))
                    RETURNING id, parent_id, nama_jabatan, slug, unit_kerja, level, order_index, created_at
                    )
                SELECT * FROM ins
            `,
            [parent_id, nama_jabatan.trim(), slug.trim(), unit_kerja ?? null, order_index]
        );

        return Response.json({ ok: true, node: rows[0] });
    } catch (e: any) {
        if (e?.code === "23505") {
            return Response.json({ ok: false, error: "Slug sudah dipakai di parent yang sama" }, { status: 409 });
        }
        console.error(e);
        return Response.json({ ok: false, error: "Internal error" }, { status: 500 });
    }
}

export async function DELETE(req: NextRequest) {
    try {
        const user = getUserFromReq(req);
        if (!user || !hasRole(user, ["admin"])) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }
        const { searchParams } = new URL(req.url);
        const id = searchParams.get("id");
        if (!id) return Response.json({ ok: false, error: "id diperlukan" }, { status: 400 });

        const { rowCount } = await pool.query(
            `
                WITH RECURSIVE subtree AS (
                    SELECT id FROM struktur_organisasi WHERE id::text = $1
                UNION ALL
                SELECT c.id FROM struktur_organisasi c JOIN subtree s ON c.parent_id = s.id
                    )
                DELETE FROM struktur_organisasi WHERE id IN (SELECT id FROM subtree)
            `,
            [id]
        );

        return Response.json({ ok: true, deleted: rowCount ?? 0 });
    } catch (e) {
        console.error(e);
        return Response.json({ ok: false, error: "Internal error" }, { status: 500 });
    }
}
