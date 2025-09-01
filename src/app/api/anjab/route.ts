import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { z } from "zod";

const CreateJabatanSchema = z.object({
    id_jabatan: z.string().trim().min(1).max(50),
    kode_jabatan: z.string().trim().min(1).max(50),
    nama_jabatan: z.string().trim().min(1).max(200),
    ikhtisar_jabatan: z.string().trim().optional().nullable(),
    kelas_jabatan: z.string().trim().optional().nullable(),
    prestasi_diharapkan: z.string().trim().optional().nullable(),
});

export async function POST(req: NextRequest) {
    try {
        const body = await req.json().catch(() => ({}));
        const parsed = CreateJabatanSchema.safeParse(body);
        if (!parsed.success) {
            return NextResponse.json(
                { error: "Validasi gagal", detail: parsed.error.flatten() },
                { status: 400 }
            );
        }

        const {
            id_jabatan,
            kode_jabatan,
            nama_jabatan,
            ikhtisar_jabatan = null,
            kelas_jabatan = null,
            prestasi_diharapkan = null,
        } = parsed.data;

        // Cek duplikasi
        const existed = await pool.query(
            `SELECT 1 FROM jabatan WHERE id_jabatan = $1 LIMIT 1`,
            [id_jabatan]
        );
        if (existed.rowCount) {
            return NextResponse.json(
                { error: "id_jabatan sudah ada" },
                { status: 409 }
            );
        }

        const { rows } = await pool.query(
            `INSERT INTO jabatan
        (id_jabatan, kode_jabatan, nama_jabatan, ikhtisar_jabatan, kelas_jabatan, prestasi_diharapkan, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6, NOW(), NOW())
       RETURNING id_jabatan, kode_jabatan, nama_jabatan, ikhtisar_jabatan, kelas_jabatan, prestasi_diharapkan`,
            [
                id_jabatan,
                kode_jabatan,
                nama_jabatan,
                ikhtisar_jabatan,
                kelas_jabatan,
                prestasi_diharapkan,
            ]
        );

        return NextResponse.json({ ok: true, data: rows[0] }, { status: 201 });
    } catch (e) {
        console.error("[api/anjab][POST] error:", e);
        return NextResponse.json({ error: "General Error" }, { status: 500 });
    }
}
