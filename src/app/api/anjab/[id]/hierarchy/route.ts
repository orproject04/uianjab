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
        
        // First, get the peta_id for the jabatan
        let petaId: string | null = null;

        if (isUuid(id)) {
            // Try to find by jabatan id first, then by peta_id
            const jabatanQuery = await pool.query(
                `SELECT j.peta_id FROM jabatan j WHERE j.id = $1::uuid LIMIT 1`,
                [id]
            );
            
            if (jabatanQuery.rows[0]) {
                petaId = jabatanQuery.rows[0].peta_id;
            } else {
                // Try to find by peta_id directly
                const petaQuery = await pool.query(
                    `SELECT j.peta_id FROM jabatan j WHERE j.peta_id = $1::uuid LIMIT 1`,
                    [id]
                );
                if (petaQuery.rows[0]) {
                    petaId = id; // The id is actually a peta_id
                }
            }
        } else {
            // Find by slug
            const slugQuery = await pool.query(
                `SELECT j.peta_id FROM jabatan j WHERE j.slug = $1 LIMIT 1`,
                [id]
            );
            if (slugQuery.rows[0]) {
                petaId = slugQuery.rows[0].peta_id;
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