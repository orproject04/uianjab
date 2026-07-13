import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { getUserFromReq, hasRole } from "@/lib/auth";
import { getDownloadGroups } from "@/lib/download-groups";

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';
export const revalidate = 0;

export async function GET(req: NextRequest) {
    try {
        const user = getUserFromReq(req);
        if (!user || !hasRole(user, "admin")) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const result = await pool.query(`SELECT
                pj.id as peta_id,
                pj.jabatan_id,
                pj.nama_jabatan,
                pj.jenis_jabatan,
                pj.unit_kerja,
                pj.level,
                pj.parent_id,
                pj.is_pusat,
                pp.nama_jabatan as parent_nama,
                pp.jenis_jabatan as parent_jenis,
                EXISTS(SELECT 1 FROM tugas_pokok_abk tpa WHERE tpa.peta_jabatan_id = pj.id) as has_abk
            FROM peta_jabatan pj
            LEFT JOIN peta_jabatan pp ON pp.id = pj.parent_id
            ORDER BY pj.level, pj.order_index, pj.nama_jabatan
        `);

        const groups = getDownloadGroups(result.rows);
        
        // Return summary for UI
        const summary = groups.map(g => ({
            id: g.id,
            name: g.name,
            count: g.nodes.length
        }));

        return NextResponse.json(summary, { status: 200 });
    } catch (err: any) {
        console.error("[anjab/download-groups][GET] error:", err);
        return NextResponse.json({ error: err.message || "General Error" }, { status: 500 });
    }
}
