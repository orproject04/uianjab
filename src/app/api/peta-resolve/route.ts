import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";

// GET - Resolve peta_jabatan_id from slug path
export async function GET(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const slug = searchParams.get("slug");

        if (!slug) {
            return NextResponse.json({
                success: false,
                error: "slug path required"
            }, { status: 400 });
        }

        const segments = slug.split('/').filter(Boolean);
        
        if (segments.length === 0) {
            return NextResponse.json({
                success: false,
                error: "Invalid slug path"
            }, { status: 400 });
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
                    ${segments.map((_, i) => `WHEN ${i + 1} THEN $${i + 1}`).join('\n                    ')}
                    ELSE NULL
                END
            )
            SELECT id, jabatan_id, slug
            FROM path_lookup 
            WHERE depth = ${segments.length}
            LIMIT 1
        `;

        const result = await pool.query(query, segments);

        if (result.rows.length === 0) {
            return NextResponse.json({
                success: false,
                error: "Peta jabatan not found for slug path"
            }, { status: 404 });
        }

        return NextResponse.json({
            success: true,
            data: {
                peta_jabatan_id: result.rows[0].id,
                jabatan_id: result.rows[0].jabatan_id,
                slug: result.rows[0].slug
            }
        });
    } catch (error: any) {
        console.error("GET peta-resolve error:", error);
        return NextResponse.json({
            success: false,
            error: error.message
        }, { status: 500 });
    }
}
