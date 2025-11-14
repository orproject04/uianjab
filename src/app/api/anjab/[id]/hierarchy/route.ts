// app/api/anjab/[id]/hierarchy/route.ts
import {NextRequest, NextResponse} from "next/server";
import pool from "@/lib/db";
import {getUserFromReq} from "@/lib/auth";

type Params = { id: string };

type HierarchyNode = {
    id: string;
    nama_jabatan: string;
    slug: string;
    level: number;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(s: string) {
    return UUID_RE.test(s);
}

/**
 * GET /api/anjab/:id/hierarchy
 * - Returns breadcrumb hierarchy for a jabatan
 * - Works with both UUID and slug
 */
export async function GET(req: NextRequest, ctx: { params: Promise<Params> }) {
    try {
        const user = getUserFromReq(req);
        if (!user) {
            return NextResponse.json({error: "Unauthorized, Silakan login kembali"}, {status: 401});
        }

        const {id} = await ctx.params;
        
        // First, get the peta_jabatan_id for the jabatan
        let petaId: string | null = null;

        if (isUuid(id)) {
            // Try to find peta_jabatan by jabatan_id
            const petaQuery = await pool.query(
                `SELECT id FROM peta_jabatan WHERE jabatan_id = $1::uuid LIMIT 1`,
                [id]
            );
            
            if (petaQuery.rows[0]) {
                petaId = petaQuery.rows[0].id;
            } else {
                // id might be a peta_jabatan.id directly - check if it exists
                const directQuery = await pool.query(
                    `SELECT id FROM peta_jabatan WHERE id = $1::uuid LIMIT 1`,
                    [id]
                );
                if (directQuery.rows[0]) {
                    petaId = id;
                }
            }
        } else {
            // Not UUID - treat as slug path (e.g., "setjen/depmin/okk")
            const segments = id.split('/').filter(Boolean);
            
            if (segments.length > 0) {
                // Build recursive query to find peta_jabatan.id by following slug path
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
                            ${segments.map((_, i) => `WHEN ${i + 1} THEN $${i + 1}`).join('\n                            ')}
                            ELSE NULL
                        END
                    )
                    SELECT id
                    FROM path_lookup 
                    WHERE depth = ${segments.length}
                    LIMIT 1
                `;

                const result = await pool.query<{id: string}>(query, segments);
                if (result.rows[0]) {
                    petaId = result.rows[0].id;
                }
            }
        }

        if (!petaId) {
            return NextResponse.json({error: "Jabatan tidak ditemukan"}, {status: 404});
        }

        // Get the hierarchy path using recursive CTE
        const {rows} = await pool.query<HierarchyNode>(
            `
            WITH RECURSIVE hierarchy AS (
                -- Start from the target jabatan
                SELECT 
                    id,
                    parent_id,
                    nama_jabatan,
                    slug,
                    level,
                    0 as depth
                FROM peta_jabatan 
                WHERE id = $1::uuid
                
                UNION ALL
                
                -- Recursively get parents
                SELECT 
                    p.id,
                    p.parent_id,
                    p.nama_jabatan,
                    p.slug,
                    p.level,
                    h.depth + 1
                FROM peta_jabatan p
                INNER JOIN hierarchy h ON p.id = h.parent_id
            )
            SELECT 
                id,
                nama_jabatan,
                slug,
                level
            FROM hierarchy
            ORDER BY depth DESC  -- Root first, target last
            `,
            [petaId]
        );

        return NextResponse.json(rows);
    } catch (e: any) {
        console.error("[anjab][hierarchy][GET]", e);
        return NextResponse.json({error: "Internal server error"}, {status: 500});
    }
}