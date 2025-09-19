// src/app/api/struktur-organisasi/route.ts
import {NextRequest, NextResponse} from "next/server";
import pool from "@/lib/db";
import {getUserFromReq, hasRole} from "@/lib/auth";
import {z} from "zod";

type Row = {
    id: string;
    parent_id: string | null;
    nama_jabatan: string;
    slug: string;
    unit_kerja: string | null;
    level: number;
    order_index: number | null;
    kebutuhan_pegawai: number;
    is_pusat: boolean;
    jenis_jabatan: string | null;
};

const UUID_RE =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const isUuid = (s: string) => UUID_RE.test(s);

const CreateSchema = z.object({
    parent_id: z.string().uuid().optional().nullable(),
    nama_jabatan: z.string().trim().min(1, "nama_jabatan wajib diisi"),
    slug: z.string().trim().min(1, "slug wajib diisi"),
    unit_kerja: z.string().trim().optional().nullable(),
    order_index: z.number().int().min(0).optional().nullable(),
    is_pusat: z.boolean().optional(),
    jenis_jabatan: z.string().trim().optional().nullable(),
});

export async function GET(req: NextRequest) {
    try {
        const user = getUserFromReq(req);
        if (!user)
            return NextResponse.json(
                {error: "Unauthorized, Silakan login kembali"},
                {status: 401}
            );

        const {searchParams} = new URL(req.url);
        const root_id = searchParams.get("root_id");

        if (root_id) {
            if (!isUuid(root_id)) {
                return NextResponse.json(
                    {error: "root_id harus UUID"},
                    {status: 400}
                );
            }

            // Subtree mulai root_id, urut pre-order
            const {rows} = await pool.query<Row>(
                `
                    WITH RECURSIVE subtree AS (
                        SELECT
                            id,
                            parent_id,
                            nama_jabatan,
                            slug,
                            unit_kerja,
                            level,
                            order_index,
                            bezetting,
                            kebutuhan_pegawai,
                            is_pusat,            
                            jenis_jabatan,       
                            ARRAY[lpad(COALESCE(order_index, 2147483647)::text, 10, '0') || '-' || id::text]::text[] AS sort_path
                        FROM struktur_organisasi
                        WHERE id = $1::uuid
                    UNION ALL
                    SELECT
                        c.id,
                        c.parent_id,
                        c.nama_jabatan,
                        c.slug,
                        c.unit_kerja,
                        c.level,
                        c.order_index,
                        c.bezetting,       
                        c.kebutuhan_pegawai,
                        c.is_pusat,          
                        c.jenis_jabatan,     
                        s.sort_path || (lpad(COALESCE(c.order_index, 2147483647)::text, 10, '0') || '-' || c.id::text)
                    FROM struktur_organisasi c
                             JOIN subtree s ON c.parent_id = s.id
                        )
                    SELECT
                        id,
                        parent_id,
                        nama_jabatan,
                        slug,
                        unit_kerja,
                        level,
                        order_index,
                        bezetting,
                        kebutuhan_pegawai,
                        is_pusat,              
                        jenis_jabatan          
                    FROM subtree
                    ORDER BY sort_path
                `,
                [root_id]
            );
            return NextResponse.json(rows);
        }

        // semua pohon (root → preorder)
        const {rows} = await pool.query<Row>(
            `
                WITH RECURSIVE tree AS (
                    SELECT
                        id,
                        parent_id,
                        nama_jabatan,
                        slug,
                        unit_kerja,
                        level,
                        order_index,
                        bezetting,
                        kebutuhan_pegawai,
                        is_pusat,            
                        jenis_jabatan,       
                        ARRAY[lpad(COALESCE(order_index, 2147483647)::text, 10, '0') || '-' || id::text]::text[] AS sort_path
                    FROM struktur_organisasi
                    WHERE parent_id IS NULL
                    UNION ALL
                    SELECT
                        c.id,
                        c.parent_id,
                        c.nama_jabatan,
                        c.slug,
                        c.unit_kerja,
                        c.level,
                        c.order_index,
                        c.bezetting,       
                        c.kebutuhan_pegawai,
                        c.is_pusat,          
                        c.jenis_jabatan,     
                        t.sort_path || (lpad(COALESCE(c.order_index, 2147483647)::text, 10, '0') || '-' || c.id::text)
                    FROM struktur_organisasi c
                             JOIN tree t ON c.parent_id = t.id
                )
                SELECT
                    id,
                    parent_id,
                    nama_jabatan,
                    slug,
                    unit_kerja,
                    level,
                    order_index,
                    bezetting,
                    kebutuhan_pegawai,
                    is_pusat,              
                    jenis_jabatan          
                FROM tree
                ORDER BY sort_path
            `
        );

        return NextResponse.json(rows);
    } catch (e) {
        console.error(e);
        return NextResponse.json({error: "Internal error"}, {status: 500});
    }
}

export async function POST(req: NextRequest) {
    try {
        const user = getUserFromReq(req);
        if (!user || !hasRole(user, ["admin"])) {
            return NextResponse.json(
                {error: "Forbidden, Anda tidak berhak mengakses fitur ini"},
                {status: 403}
            );
        }

        const body = await req.json().catch(() => ({}));
        const parsed = CreateSchema.safeParse(body);
        if (!parsed.success) {
            return NextResponse.json(
                {error: "Validasi gagal", detail: parsed.error.flatten()},
                {status: 400}
            );
        }

        const {
            parent_id = null,
            nama_jabatan,
            slug,
            unit_kerja = null,
            order_index = null,
            is_pusat,
            jenis_jabatan,
        } = parsed.data;

        // Jika parent_id ada, pastikan parent eksis
        if (parent_id) {
            const p = await pool.query(
                `SELECT 1
                 FROM struktur_organisasi
                 WHERE id = $1::uuid LIMIT 1`,
                [parent_id]
            );
            if (p.rowCount === 0) {
                return NextResponse.json(
                    {error: "parent_id tidak ditemukan"},
                    {status: 400}
                );
            }
        }

        // Cek slug unik pada sibling (parent sama)
        const dup = await pool.query<{ exists: boolean }>(
            `
                SELECT EXISTS(SELECT 1
                              FROM struktur_organisasi
                              WHERE parent_id IS NOT DISTINCT FROM $1::uuid
                    AND slug = $2) AS exists
            `,
            [parent_id, slug.trim()]
        );
        if (dup.rows[0]?.exists) {
            return NextResponse.json(
                {error: "Slug sudah dipakai di parent yang sama"},
                {status: 409}
            );
        }

        // Insert: tentukan level & order_index (default MAX+1) via CTE
        const {rows} = await pool.query<Row>(
            `
                WITH parent AS (SELECT id, level
                                FROM struktur_organisasi
                                WHERE id = $1
                    ::uuid
                    )
                   , defaults AS (
                SELECT
                    CASE WHEN $1 IS NULL THEN 0 ELSE (SELECT level FROM parent) + 1 END AS lvl, COALESCE (
                              $5:: int, (
                    SELECT COALESCE (MAX (order_index) + 1, 0)
                    FROM struktur_organisasi
                    WHERE parent_id IS NOT DISTINCT FROM (SELECT id FROM parent)
                    )
                    ) AS ord
                    ), ins AS (
                INSERT
                INTO struktur_organisasi
                (parent_id, nama_jabatan, slug, unit_kerja, level, order_index, is_pusat, jenis_jabatan)
                VALUES (
                    (SELECT id FROM parent), $2, $3, $4, (SELECT lvl FROM defaults), (SELECT ord FROM defaults), COALESCE ($6, true), COALESCE ($7, 'JABATAN PELAKSANA')
                    )
                    RETURNING id, parent_id, nama_jabatan, slug, unit_kerja, level, order_index, bezetting, kebutuhan_pegawai, is_pusat, jenis_jabatan
                    )
                SELECT *
                FROM ins
            `,
            //                $1         $2                 $3           $4          $5           $6        $7
            [parent_id, nama_jabatan.trim(), slug.trim(), unit_kerja, order_index, is_pusat, jenis_jabatan]
        );

        return NextResponse.json({ok: true, node: rows[0]});
    } catch (e: any) {
        if (e?.code === "23505") {
            return NextResponse.json(
                {error: "Slug sudah dipakai di parent yang sama"},
                {status: 409}
            );
        }
        if (e?.code === "22P02") {
            return NextResponse.json({error: "parent_id harus UUID"}, {status: 400});
        }
        console.error(e);
        return NextResponse.json({error: "Internal error"}, {status: 500});
    }
}
