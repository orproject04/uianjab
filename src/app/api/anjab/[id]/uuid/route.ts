// src/app/api/anjab/[id]/uuid/route.ts
import {NextRequest, NextResponse} from "next/server";
import pool from "@/lib/db";
import {getUserFromReq} from "@/lib/auth";

const UUID_RE =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
    try {
        // Auth wajib login
        const user = getUserFromReq(req);
        if (!user) {
            return NextResponse.json({error: "Unauthorized, Silakan login kembali"}, {status: 401});
        }

        const {id} = await ctx.params;
        if (!id || typeof id !== "string") {
            return NextResponse.json({error: "Bad Request: id (slug path / uuid) wajib diisi"}, {status: 400});
        }

        const isUuid = UUID_RE.test(id);

        let row: { id: string } | undefined;

        if (isUuid) {
            // If UUID → try to match as jabatan.id directly or via peta_jabatan.id → jabatan_id
            const q = await pool.query<{ id: string }>(
                `
                    SELECT j.id
                    FROM jabatan j
                    LEFT JOIN peta_jabatan pj ON pj.jabatan_id = j.id
                    WHERE j.id = $1::uuid
                       OR pj.id = $1::uuid
                    LIMIT 1
                `,
                [id]
            );
            row = q.rows[0];
        } else {
            // If not UUID → treat as peta_jabatan slug path (e.g., "setjen/depmin/okk")
            // Split path and traverse tree to find jabatan_id
            const segments = id.split('/').filter(Boolean);
            
            if (segments.length === 0) {
                return NextResponse.json(
                    {error: "Bad Request: slug path kosong"},
                    {status: 400}
                );
            }

            // Build recursive query to traverse tree by slug path
            const query = `
                WITH RECURSIVE path_lookup AS (
                    -- Base: find root with first segment
                    SELECT id, jabatan_id, slug, parent_id, 1 as depth
                    FROM peta_jabatan
                    WHERE parent_id IS NULL AND slug = $1
                    
                    UNION ALL
                    
                    -- Recursive: follow path by matching next segment
                    SELECT p.id, p.jabatan_id, p.slug, p.parent_id, path_lookup.depth + 1
                    FROM peta_jabatan p
                    INNER JOIN path_lookup ON p.parent_id = path_lookup.id
                    WHERE p.slug = CASE path_lookup.depth + 1
                        ${segments.map((_, i) => `WHEN ${i + 1} THEN $${i + 1}`).join('\n                        ')}
                        ELSE NULL
                    END
                )
                SELECT jabatan_id AS id
                FROM path_lookup 
                WHERE depth = ${segments.length}
                LIMIT 1
            `;

            const q = await pool.query<{ id: string }>(query, segments);
            row = q.rows[0];
        }

        if (!row) {
            return NextResponse.json(
                {error: "Not Found, slug path / uuid tidak ditemukan"},
                {status: 404, headers: {"Cache-Control": "no-store"}}
            );
        }

        return NextResponse.json(
            {id: row.id},
            {
                status: 200,
                headers: {
                    "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
                    Pragma: "no-cache",
                    Expires: "0",
                },
            }
        );
    } catch (err) {
        console.error("GET /api/anjab/[id]/uuid error:", err);
        return NextResponse.json({error: "Server error"}, {status: 500});
    }
}
