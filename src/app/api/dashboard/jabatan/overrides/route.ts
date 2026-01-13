import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { getUserFromReq, hasRole } from "@/lib/auth";

export async function POST(req: NextRequest) {
    try {
        const user = getUserFromReq(req);
        if (!user || !hasRole(user, ["admin"])) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

        const json = await req.json().catch(() => ({}));
        const edits = Array.isArray(json?.edits) ? json.edits : [];
        if (!edits.length) return NextResponse.json({ ok: true, updated: 0 });

        // For each edit, update peta_jabatan.kebutuhan_pegawai for matching fungsional rows.
        let updated = 0;
        for (const e of edits) {
            const nama = String(e.nama_jabatan || "").trim();
            const unit = String(e.unit_kerja || "").trim();
            const kebRaw = Number(e.kebutuhan_khusus ?? 0);
            if (!nama) continue;

            // Keep 0 as 0 (user requested). Only set NULL when value is not a finite number.
            const kebVal = Number.isFinite(kebRaw) ? kebRaw : null;

            const res = await pool.query(
                `UPDATE peta_jabatan SET kebutuhan_pegawai = $1, updated_at = NOW() WHERE lower(trim(coalesce(nama_jabatan,''))) = lower(trim($2)) AND lower(trim(coalesce(unit_kerja,''))) = lower(trim($3)) AND lower(coalesce(jenis_jabatan,'')) LIKE '%fungsional%' RETURNING id`,
                [kebVal, nama, unit]
            );
            updated += (res.rowCount || 0);
        }

        return NextResponse.json({ ok: true, updated });
    } catch (err: any) {
        console.error('[dashboard.overrides]', err?.message || err);
        return NextResponse.json({ error: 'Server error' }, { status: 500 });
    }
}
