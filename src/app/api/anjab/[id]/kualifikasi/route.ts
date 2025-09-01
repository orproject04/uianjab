import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { z } from "zod";

const Schema = z.object({
    pendidikan_formal: z.array(z.string()).optional().nullable(),
    diklat_penjenjangan: z.array(z.string()).optional().nullable(),
    diklat_teknis: z.array(z.string()).optional().nullable(),
    diklat_fungsional: z.array(z.string()).optional().nullable(),
    pengalaman_kerja: z.array(z.string()).optional().nullable(),
    upsert: z.boolean().optional(),
});

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await ctx.params;
        const { rows } = await pool.query(
            `SELECT id_kualifikasi, id_jabatan, pendidikan_formal, diklat_penjenjangan, diklat_teknis, diklat_fungsional, pengalaman_kerja
       FROM kualifikasi_jabatan
       WHERE id_jabatan=$1
       LIMIT 1`,
            [id]
        );

        if (!rows.length) {
            return NextResponse.json({
                id_jabatan: id,
                pendidikan_formal: [],
                diklat_penjenjangan: [],
                diklat_teknis: [],
                diklat_fungsional: [],
                pengalaman_kerja: [],
            }, {
                headers: {
                    "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
                    "Pragma": "no-cache",
                    "Expires": "0",
                },
            });
        }

        return NextResponse.json(rows[0], {
            headers: {
                "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
                "Pragma": "no-cache",
                "Expires": "0",
            },
        });
    } catch (e) {
        console.error("[kualifikasi][GET] error:", e);
        return NextResponse.json({ error: "General Error" }, { status: 500 });
    }
}

export async function HEAD(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await ctx.params;
        const { rows } = await pool.query(`SELECT 1 FROM kualifikasi_jabatan WHERE id_jabatan=$1`, [id]);
        return new Response(null, { status: rows.length ? 200 : 404 });
    } catch {
        return new Response(null, { status: 500 });
    }
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await ctx.params;
        const json = await req.json().catch(() => ({}));
        const p = Schema.safeParse(json);
        if (!p.success) {
            return NextResponse.json({ error: "Validasi gagal", detail: p.error.flatten() }, { status: 400 });
        }

        const {
            pendidikan_formal = [],
            diklat_penjenjangan = [],
            diklat_teknis = [],
            diklat_fungsional = [],
            pengalaman_kerja = [],
            upsert = true,
        } = p.data;

        // UPDATE dulu
        const up = await pool.query(
            `UPDATE kualifikasi_jabatan
         SET pendidikan_formal=$1,
             diklat_penjenjangan=$2,
             diklat_teknis=$3,
             diklat_fungsional=$4,
             pengalaman_kerja=$5,
             updated_at=NOW()
       WHERE id_jabatan=$6`,
            [pendidikan_formal, diklat_penjenjangan, diklat_teknis, diklat_fungsional, pengalaman_kerja, id]
        );

        if (up.rowCount === 0) {
            if (!upsert) {
                return NextResponse.json({ error: "Data belum ada, upsert=false" }, { status: 404 });
            }
            await pool.query(
                `INSERT INTO kualifikasi_jabatan
           (id_jabatan, pendidikan_formal, diklat_penjenjangan, diklat_teknis, diklat_fungsional, pengalaman_kerja, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,NOW(),NOW())`,
                [id, pendidikan_formal, diklat_penjenjangan, diklat_teknis, diklat_fungsional, pengalaman_kerja]
            );
        }

        const { rows } = await pool.query(
            `SELECT id_kualifikasi, id_jabatan, pendidikan_formal, diklat_penjenjangan, diklat_teknis, diklat_fungsional, pengalaman_kerja
       FROM kualifikasi_jabatan
       WHERE id_jabatan=$1
       LIMIT 1`,
            [id]
        );
        return NextResponse.json({ ok: true, data: rows[0] });
    } catch (e) {
        console.error("[kualifikasi][PATCH] error:", e);
        return NextResponse.json({ error: "General Error" }, { status: 500 });
    }
}
