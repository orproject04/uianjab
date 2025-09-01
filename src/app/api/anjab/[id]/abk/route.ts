import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await ctx.params;

        // Cek baris tugas_pokok dengan kolom numerik yang kosong/null
        const { rows } = await pool.query(
            `
      SELECT id_tugas, nomor_tugas
      FROM tugas_pokok
      WHERE id_jabatan = $1
        AND (
          jumlah_hasil IS NULL
          OR waktu_penyelesaian_jam IS NULL
          OR waktu_efektif IS NULL
          OR kebutuhan_pegawai IS NULL
        )
      ORDER BY COALESCE(nomor_tugas, 999999), id_tugas
      LIMIT 5
      `,
            [id]
        );

        return NextResponse.json({
            needed: rows.length > 0,
            missing_count: rows.length,        // ini jumlah contoh (max 5). Kalau mau total, bisa COUNT(*) di query terpisah
            examples: rows,                    // contoh item yang masih kosong
        }, {
            headers: {
                "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
                "Pragma": "no-cache",
                "Expires": "0",
            }
        });
    } catch (e) {
        console.error("[abk-needed][GET]", e);
        return NextResponse.json({ error: "General Error" }, { status: 500 });
    }
}
