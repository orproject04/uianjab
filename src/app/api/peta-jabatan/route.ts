// src/app/api/peta-jabatan/route.ts
import {NextRequest, NextResponse} from "next/server";
import pool from "@/lib/db";
import {getUserFromReq, hasRole} from "@/lib/auth";
import {z} from "zod";

// --- UPDATE tipe Row (letakkan di atas, menggantikan tipe Row lama)
type Row = {
    id: string;
    parent_id: string | null;
    nama_jabatan: string;
    slug: string;
    unit_kerja: string | null;
    level: number;
    order_index: number | null;
    bezetting: number;
    kebutuhan_pegawai: number;
    is_pusat: boolean;
    jenis_jabatan: string | null;
    kelas_jabatan: string | null;
    nama_pejabat: string[];
    jabatan_id: string | null;
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
    jabatan_id: z.string().uuid().optional().nullable(), // Manual override
});

export async function GET(req: NextRequest) {
    try {
        const user = getUserFromReq(req);
        if (!user) {
            return NextResponse.json(
                { error: "Unauthorized, Silakan login kembali" },
                { status: 401 }
            );
        }

        const { searchParams } = new URL(req.url);
        const root_id = searchParams.get("root_id");
        const jabatan_id = searchParams.get("jabatan_id");

        // Query by jabatan_id (simple query, tidak recursive)
        if (jabatan_id) {
            if (!isUuid(jabatan_id)) {
                return NextResponse.json({ error: "jabatan_id harus UUID" }, { status: 400 });
            }

            const { rows } = await pool.query<Row>(
                `SELECT
                    pj.id,
                    pj.parent_id,
                    pj.nama_jabatan,
                    pj.slug,
                    pj.unit_kerja,
                    pj.level,
                    pj.order_index,
                    pj.bezetting,
                    pj.kebutuhan_pegawai,
                    pj.is_pusat,
                    pj.jenis_jabatan,
                    pj.jabatan_id,
                    j.kelas_jabatan,
                    COALESCE(pj.nama_pejabat, ARRAY[]::text[]) AS nama_pejabat
                 FROM peta_jabatan pj
                 LEFT JOIN jabatan j ON pj.jabatan_id = j.id
                 WHERE pj.jabatan_id = $1::uuid
                 ORDER BY pj.order_index`,
                [jabatan_id]
            );
            return NextResponse.json({ success: true, data: rows });
        }

        // SELECT final agar tidak duplikatif (dipakai di cabang subtree & full tree)
        const FINAL_SELECT = `
      SELECT
        t.id,
        t.parent_id,
        t.nama_jabatan,
        t.slug,
        t.unit_kerja,
        t.level,
        t.order_index,
        t.bezetting,
        t.kebutuhan_pegawai,
        t.is_pusat,
        t.jenis_jabatan,
        t.jabatan_id,
        j.kelas_jabatan,
        t.nama_pejabat
      FROM tree t
      LEFT JOIN jabatan j
        ON t.jabatan_id = j.id
      ORDER BY t.sort_path
    `;

        if (root_id) {
            if (!isUuid(root_id)) {
                return NextResponse.json({ error: "root_id harus UUID" }, { status: 400 });
            }

            // Subtree mulai root_id, urut preorder
            const { rows } = await pool.query<Row>(
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
            jabatan_id,
            COALESCE(nama_pejabat, ARRAY[]::text[]) AS nama_pejabat,
            ARRAY[
              lpad(COALESCE(order_index, 2147483647)::text, 10, '0') || '-' || id::text
            ]::text[] AS sort_path
          FROM peta_jabatan
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
            c.jabatan_id,
            COALESCE(c.nama_pejabat, ARRAY[]::text[]),
            t.sort_path || (
              lpad(COALESCE(c.order_index, 2147483647)::text, 10, '0') || '-' || c.id::text
            )
          FROM peta_jabatan c
          JOIN tree t ON c.parent_id = t.id
        )
        ${FINAL_SELECT}
        `,
                [root_id]
            );
            return NextResponse.json(rows);
        }

        // Semua pohon (root → preorder)
        const { rows } = await pool.query<Row>(
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
          jabatan_id,
          COALESCE(nama_pejabat, ARRAY[]::text[]) AS nama_pejabat,
          ARRAY[
            lpad(COALESCE(order_index, 2147483647)::text, 10, '0') || '-' || id::text
          ]::text[] AS sort_path
        FROM peta_jabatan
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
          c.jabatan_id,
          COALESCE(c.nama_pejabat, ARRAY[]::text[]),
          t.sort_path || (
            lpad(COALESCE(c.order_index, 2147483647)::text, 10, '0') || '-' || c.id::text
          )
        FROM peta_jabatan c
        JOIN tree t ON c.parent_id = t.id
      )
      ${FINAL_SELECT}
      `
        );

        return NextResponse.json(rows);
    } catch (e) {
        console.error(e);
        return NextResponse.json({ error: "Internal error" }, { status: 500 });
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
            jabatan_id: manual_jabatan_id = null,
        } = parsed.data;

        // Jika parent_id ada, pastikan parent eksis
        if (parent_id) {
            const p = await pool.query<{slug: string}>(
                `SELECT slug FROM peta_jabatan WHERE id = $1::uuid LIMIT 1`,
                [parent_id]
            );
            if (p.rowCount === 0) {
                return NextResponse.json(
                    {error: "parent_id tidak ditemukan"},
                    {status: 400}
                );
            }
        }

        // Gunakan slug langsung tanpa parent prefix
        const finalSlug = slug.trim();

        // Cek slug unik pada sibling (parent sama)
        const dup = await pool.query<{ exists: boolean }>(
            `
                SELECT EXISTS(SELECT 1
                              FROM peta_jabatan
                              WHERE parent_id IS NOT DISTINCT FROM $1::uuid
                    AND slug = $2) AS exists
            `,
            [parent_id, finalSlug]
        );
        if (dup.rows[0]?.exists) {
            return NextResponse.json(
                {error: "Slug sudah dipakai di parent yang sama"},
                {status: 409}
            );
        }

        // Prioritas: manual_jabatan_id > auto-match
        let matched_jabatan_id: string | null = manual_jabatan_id;
        
        // Auto-match jabatan_id hanya jika tidak ada manual selection
        if (!matched_jabatan_id) {
            try {
                const matchResult = await pool.query<{
                    id: string;
                    similarity: number;
                }>(
                    `
                    SELECT 
                        id,
                    SIMILARITY(nama_jabatan, $1) as similarity
                FROM jabatan
                WHERE SIMILARITY(nama_jabatan, $1) > 0.5
                ORDER BY similarity DESC
                LIMIT 1
                `,
                    [nama_jabatan.trim()]
                );
                
                if (matchResult.rows.length > 0) {
                    matched_jabatan_id = matchResult.rows[0].id;
                    console.log(`Auto-matched jabatan_id: ${matched_jabatan_id} (similarity: ${matchResult.rows[0].similarity})`);
                }
            } catch (matchError) {
                console.warn("Gagal auto-match jabatan_id:", matchError);
                // Lanjutkan tanpa jabatan_id jika matching gagal
            }
        }

        // Insert: tentukan level & order_index (default MAX+1) via CTE
        const {rows} = await pool.query<Row>(
            `
                WITH parent AS (SELECT id, level
                                FROM peta_jabatan
                                WHERE id = $1
                    ::uuid
                    )
                   , defaults AS (
                SELECT
                    CASE WHEN $1 IS NULL
                    THEN 0
                    ELSE (SELECT level FROM parent) + 1
                    END AS lvl, COALESCE (
                              $5:: int, (SELECT COALESCE (MAX (order_index) + 1, 0)
                    FROM peta_jabatan
                    WHERE parent_id IS NOT DISTINCT FROM (SELECT id FROM parent))
                    ) AS ord
                    ), ins AS (
                INSERT
                INTO peta_jabatan
                (parent_id, nama_jabatan, slug, unit_kerja, level, order_index, is_pusat, jenis_jabatan, jabatan_id)
                VALUES
                    ((SELECT id FROM parent), $2, $3, $4, (SELECT lvl FROM defaults), (SELECT ord FROM defaults), COALESCE ($6, true), COALESCE ($7, 'JABATAN PELAKSANA'), $8::uuid)
                    RETURNING id, parent_id, nama_jabatan, slug, unit_kerja, level, order_index, bezetting, kebutuhan_pegawai, is_pusat, jenis_jabatan, jabatan_id
                    )
                SELECT *
                FROM ins
            `,
            //         $1         $2                 $3           $4          $5           $6        $7              $8
            [parent_id, nama_jabatan.trim(), finalSlug, unit_kerja, order_index, is_pusat, jenis_jabatan, matched_jabatan_id]
        );

        const newNode = rows[0];

        // Convert slug dash to slash for path (e.g., "setjen-depmin" -> "setjen/depmin")
        const fullPath = newNode.slug.replace(/-/g, '/');

        // Jika berhasil match, kembalikan info anjab juga
        let matchInfo = null;
        if (matched_jabatan_id) {
            try {
                const anjabInfo = await pool.query<{ nama_jabatan: string }>(
                    `SELECT nama_jabatan FROM jabatan WHERE id = $1::uuid LIMIT 1`,
                    [matched_jabatan_id]
                );
                if (anjabInfo.rows.length > 0) {
                    matchInfo = {
                        jabatan_id: matched_jabatan_id,
                        nama_anjab: anjabInfo.rows[0].nama_jabatan
                    };
                }
            } catch (e) {
                console.warn("Gagal fetch info anjab:", e);
            }
        }

        return NextResponse.json({
            ok: true, 
            node: newNode, 
            path: fullPath,
            matched_anjab: matchInfo
        });
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
