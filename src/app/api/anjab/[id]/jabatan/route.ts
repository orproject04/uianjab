// app/api/anjab/[id]/route.ts
import {NextRequest, NextResponse} from "next/server";
import pool from "@/lib/db";
import {z} from "zod";
import {getUserFromReq, hasRole} from "@/lib/auth";

const UpdateSchema = z.object({
    kode_jabatan: z.string().min(1),
    nama_jabatan: z.string().min(1),
    ikhtisar_jabatan: z.string().optional().nullable(),
    kelas_jabatan: z.string().optional().nullable(),
    prestasi_diharapkan: z.string().optional().nullable(),
});

// Helper: cek UUID v1–v5
const UUID_RE =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(s: string) {
    return UUID_RE.test(s);
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
    try {
        const user = getUserFromReq(_req);
        if (!user) return NextResponse.json({error: "Unauthorized, Silakan login kembali"}, {status: 401});

        const {id} = await ctx.params;
        
        let jabatanId: string | null = null;

        if (isUuid(id)) {
            // Direct UUID - use as is
            jabatanId = id;
        } else {
            // Not UUID - treat as slug path, resolve to jabatan_id
            const segments = id.split('/').filter(Boolean);
            
            if (segments.length > 0) {
                const query = `
                    WITH RECURSIVE path_lookup AS (
                        SELECT id, jabatan_id, slug, parent_id, 1 as depth
                        FROM peta_jabatan
                        WHERE parent_id IS NULL AND slug = $1
                        
                        UNION ALL
                        
                        SELECT p.id, p.jabatan_id, p.slug, p.parent_id, path_lookup.depth + 1
                        FROM peta_jabatan p
                        INNER JOIN path_lookup ON p.parent_id = path_lookup.id
                        WHERE p.slug = CASE path_lookup.depth + 1
                            ${segments.map((_, i) => `WHEN ${i + 1} THEN $${i + 1}`).join('\n                            ')}
                            ELSE NULL
                        END
                    )
                    SELECT jabatan_id
                    FROM path_lookup 
                    WHERE depth = ${segments.length}
                    LIMIT 1
                `;

                const result = await pool.query<{jabatan_id: string | null}>(query, segments);
                jabatanId = result.rows[0]?.jabatan_id || null;
            }
        }

        if (!jabatanId) {
            return NextResponse.json({error: "Not Found, (Dokumen analisis jabatan tidak ditemukan)"}, {status: 404});
        }

        const {rows} = await pool.query(
            `SELECT id, kode_jabatan, nama_jabatan, ikhtisar_jabatan, kelas_jabatan, prestasi_diharapkan
             FROM jabatan
             WHERE id = $1::uuid`,
            [jabatanId]
        );
        if (!rows.length) return NextResponse.json({error: "Not Found, (Dokumen analisis jabatan tidak ditemukan)"}, {status: 404});

        return NextResponse.json(rows[0], {
            headers: {
                "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
                Pragma: "no-cache",
                Expires: "0",
            },
        });
    } catch (e: any) {
        console.error(e);
        return NextResponse.json({error: "General Error"}, {status: 500});
    }
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
    try {
        const user = getUserFromReq(req);
        if (!user || !hasRole(user, ["admin"])) {
            return NextResponse.json({error: "Forbidden, Anda tidak berhak mengakses fitur ini"}, {status: 403});
        }

        const {id} = await ctx.params;
        
        let jabatanId: string | null = null;

        if (isUuid(id)) {
            jabatanId = id;
        } else {
            // Resolve slug path to jabatan_id
            const segments = id.split('/').filter(Boolean);
            
            if (segments.length > 0) {
                const query = `
                    WITH RECURSIVE path_lookup AS (
                        SELECT id, jabatan_id, slug, parent_id, 1 as depth
                        FROM peta_jabatan
                        WHERE parent_id IS NULL AND slug = $1
                        
                        UNION ALL
                        
                        SELECT p.id, p.jabatan_id, p.slug, p.parent_id, path_lookup.depth + 1
                        FROM peta_jabatan p
                        INNER JOIN path_lookup ON p.parent_id = path_lookup.id
                        WHERE p.slug = CASE path_lookup.depth + 1
                            ${segments.map((_, i) => `WHEN ${i + 1} THEN $${i + 1}`).join('\n                            ')}
                            ELSE NULL
                        END
                    )
                    SELECT jabatan_id
                    FROM path_lookup 
                    WHERE depth = ${segments.length}
                    LIMIT 1
                `;

                const result = await pool.query<{jabatan_id: string | null}>(query, segments);
                jabatanId = result.rows[0]?.jabatan_id || null;
            }
        }

        if (!jabatanId) {
            return NextResponse.json({error: "Not Found, (Dokumen analisis jabatan tidak ditemukan)"}, {status: 404});
        }

        const json = await req.json().catch(() => ({}));
        const parsed = UpdateSchema.safeParse(json);
        if (!parsed.success) {
            return NextResponse.json(
                {error: "Validasi gagal", detail: parsed.error.flatten()},
                {status: 400}
            );
        }

        const {kode_jabatan, nama_jabatan, ikhtisar_jabatan, kelas_jabatan, prestasi_diharapkan} =
            parsed.data;

        const {rowCount} = await pool.query(
            `UPDATE jabatan
             SET kode_jabatan=$1,
                 nama_jabatan=$2,
                 ikhtisar_jabatan=COALESCE($3, ''),
                 kelas_jabatan=COALESCE($4, ''),
                 prestasi_diharapkan=COALESCE($5, ''),
                 updated_at=NOW()
             WHERE id = $6::uuid`,
            [kode_jabatan, nama_jabatan, ikhtisar_jabatan, kelas_jabatan, prestasi_diharapkan, jabatanId]
        );
        if (!rowCount) return NextResponse.json({error: "Not Found, (Dokumen analisis jabatan tidak ditemukan)"}, {status: 404});

        const {rows} = await pool.query(
            `SELECT id, kode_jabatan, nama_jabatan, ikhtisar_jabatan, kelas_jabatan, prestasi_diharapkan
             FROM jabatan
             WHERE id = $1::uuid`,
            [jabatanId]
        );
        return NextResponse.json({ok: true, data: rows[0]});
    } catch (e: any) {
        console.error("PATCH error:", e);
        return NextResponse.json({error: "General Error"}, {status: 500});
    }
}
