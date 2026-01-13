import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { getUserFromReq, hasRole } from "@/lib/auth";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const isUuid = (s: string) => UUID_RE.test(s);

export async function POST(req: NextRequest) {
    try {
        const user = getUserFromReq(req);
        if (!user || !hasRole(user, ["admin"])) {
            return NextResponse.json({ error: "Forbidden, Anda tidak berhak mengakses fitur ini" }, { status: 403 });
        }

        const json = await req.json().catch(() => ({}));
        const petaId = (json?.peta_jabatan_id || "").trim();
        if (!isUuid(petaId)) return NextResponse.json({ error: "Invalid peta_jabatan_id" }, { status: 400 });

        // Delete all ABK rows for this peta_jabatan
        await pool.query(`DELETE FROM tugas_pokok_abk WHERE peta_jabatan_id = $1::uuid`, [petaId]);

        // Recompute kebutuhan_pegawai for the peta_jabatan (should be 0 after deletion)
        await pool.query(`UPDATE peta_jabatan SET kebutuhan_pegawai = COALESCE((SELECT CEIL(COALESCE(SUM(tpa.kebutuhan_pegawai)::numeric,0)) FROM tugas_pokok_abk tpa WHERE tpa.peta_jabatan_id = peta_jabatan.id),0), updated_at = NOW() WHERE id = $1::uuid`, [petaId]);

        return NextResponse.json({ ok: true });
    } catch (e: any) {
        console.error('[abk][clear]', e);
        return NextResponse.json({ error: 'General Error' }, { status: 500 });
    }
}
