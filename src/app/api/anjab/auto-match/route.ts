import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { getUserFromReq, hasRole } from "@/lib/auth";

export async function POST(req: NextRequest) {
    try {
        const user = getUserFromReq(req);
        if (!user || !hasRole(user, ["admin"])) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

        const body = await req.json();
        const { suggestions } = body;

        // Filter hanya yang similarity 100%
        const perfectMatches = suggestions.filter((s: any) => s.similarity === 1.0);

        if (perfectMatches.length === 0) {
            return NextResponse.json({ 
                ok: true, 
                matched_count: 0,
                message: "Tidak ada peta jabatan yang cocok 100%" 
            });
        }

        const client = await pool.connect();
        let matchedCount = 0;

        try {
            await client.query("BEGIN");

            for (const sug of perfectMatches) {
                // Update peta_jabatan dengan jabatan_id
                await client.query(
                    `UPDATE peta_jabatan 
                     SET jabatan_id = $1, updated_at = NOW()
                     WHERE id = $2 AND jabatan_id IS NULL`,
                    [sug.anjab_id, sug.peta_id]
                );
                matchedCount++;
            }

            await client.query("COMMIT");
            
            return NextResponse.json({ 
                ok: true, 
                matched_count: matchedCount 
            });
        } catch (error) {
            await client.query("ROLLBACK");
            throw error;
        } finally {
            client.release();
        }
    } catch (error: any) {
        console.error("Error auto matching:", error);
        return NextResponse.json(
            { error: error?.message || "Gagal auto matching" },
            { status: 500 }
        );
    }
}
