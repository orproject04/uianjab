import {NextRequest, NextResponse} from "next/server";
import pool from "@/lib/db";
import {z} from "zod";
import {getUserFromReq, hasRole} from "@/lib/auth";

// ===== Helpers =====
const noCache = {
    "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
    "Pragma": "no-cache",
    "Expires": "0",
};

// Array cleaner: coerce -> trim -> filter empty
const cleanStrArr = z
    .array(z.union([z.string(), z.number()]))
    .transform(arr =>
        arr
            .map(v => String(v).trim())
            .filter(s => s.length > 0)
    );

const ItemSchema = z.object({
    hasil_kerja: cleanStrArr.default([]),
    satuan_hasil: cleanStrArr.default([]),
});

const ReplaceAllSchema = z.array(ItemSchema);

// ===== Koleksi =====
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
    try {
        const user = getUserFromReq(_req);
        if (!user) {
            return NextResponse.json({error: "Unauthorized"}, {status: 401});
        }
        const {id} = await ctx.params;
        const {rows} = await pool.query(
            `SELECT id_hasil, id_jabatan, hasil_kerja, satuan_hasil
             FROM hasil_kerja
             WHERE id_jabatan = $1
             ORDER BY id_hasil`,
            [id]
        );
        // Pastikan array selalu array
        const data = rows.map((r: any) => ({
            ...r,
            hasil_kerja: Array.isArray(r.hasil_kerja) ? r.hasil_kerja : [],
            satuan_hasil: Array.isArray(r.satuan_hasil) ? r.satuan_hasil : [],
        }));
        return NextResponse.json(data, {headers: noCache});
    } catch (e) {
        console.error("[hasil-kerja][GET]", e);
        return NextResponse.json({error: "General Error"}, {status: 500});
    }
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
    const client = await pool.connect();
    try {
        const user = getUserFromReq(req);
        if (!user || !hasRole(user, ["admin"])) {
            return NextResponse.json({error: "Forbidden"}, {status: 403});
        }
        const {id} = await ctx.params;
        const json = await req.json().catch(() => ({}));
        const p = ItemSchema.safeParse(json);
        if (!p.success) {
            return NextResponse.json({error: "Validasi gagal", detail: p.error.flatten()}, {status: 400});
        }
        const {hasil_kerja, satuan_hasil} = p.data;

        await client.query("BEGIN");
        const ins = await client.query(
            `INSERT INTO hasil_kerja
                 (id_jabatan, hasil_kerja, satuan_hasil, created_at, updated_at)
             VALUES ($1, $2, $3, NOW(),
                     NOW()) RETURNING id_hasil, id_jabatan, hasil_kerja, satuan_hasil, created_at, updated_at`,
            [id, hasil_kerja, satuan_hasil]
        );
        await client.query("COMMIT");
        return NextResponse.json({ok: true, data: ins.rows[0]});
    } catch (e) {
        await pool.query("ROLLBACK");
        console.error("[hasil-kerja][POST]", e);
        return NextResponse.json({error: "General Error"}, {status: 500});
    } finally {
        client.release();
    }
}

// (Opsional) Replace-all
export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
    const client = await pool.connect();
    try {
        const user = getUserFromReq(req);
        if (!user || !hasRole(user, ["admin"])) {
            return NextResponse.json({error: "Forbidden"}, {status: 403});
        }
        const {id} = await ctx.params;
        const json = await req.json().catch(() => ([]));
        const p = ReplaceAllSchema.safeParse(json);
        if (!p.success) {
            return NextResponse.json({error: "Validasi gagal", detail: p.error.flatten()}, {status: 400});
        }

        await client.query("BEGIN");
        await client.query(`DELETE
                            FROM hasil_kerja
                            WHERE id_jabatan = $1`, [id]);
        for (const it of p.data) {
            await client.query(
                `INSERT INTO hasil_kerja
                     (id_jabatan, hasil_kerja, satuan_hasil, created_at, updated_at)
                 VALUES ($1, $2, $3, NOW(), NOW())`,
                [id, it.hasil_kerja ?? [], it.satuan_hasil ?? []]
            );
        }
        await client.query("COMMIT");
        return NextResponse.json({ok: true});
    } catch (e) {
        await pool.query("ROLLBACK");
        console.error("[hasil-kerja][PUT]", e);
        return NextResponse.json({error: "General Error"}, {status: 500});
    } finally {
        client.release();
    }
}
