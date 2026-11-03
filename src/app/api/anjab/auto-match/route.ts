import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { getUserFromReq, hasRole } from "@/lib/auth";
import { resolveVersiId } from "@/lib/versi";

export async function POST(req: NextRequest) {
    try {
        const user = getUserFromReq(req);
        if (!user || !hasRole(user, ["admin"])) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

        const body = await req.json();
        const { suggestions, versi_id: raw_versi_id } = body;

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

            const defaultVersiId = raw_versi_id && raw_versi_id !== 'ALL' ? await resolveVersiId(raw_versi_id) : null;

            for (const sug of perfectMatches) {
                const itemVersiId = sug.versi_id ? await resolveVersiId(sug.versi_id) : defaultVersiId;

                if (itemVersiId) {
                    await client.query(
                        `UPDATE peta_jabatan 
                         SET jabatan_id = $1, updated_at = NOW()
                         WHERE id = $2 AND versi_id = $3 AND jabatan_id IS NULL`,
                        [sug.anjab_id, sug.peta_id, itemVersiId]
                    );
                } else {
                    await client.query(
                        `UPDATE peta_jabatan 
                         SET jabatan_id = $1, updated_at = NOW()
                         WHERE id = $2 AND jabatan_id IS NULL`,
                        [sug.anjab_id, sug.peta_id]
                    );
                }
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
