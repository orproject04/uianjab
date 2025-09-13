import {NextRequest, NextResponse} from "next/server";
import pool from "@/lib/db";
import {z} from "zod";
import {getUserFromReq, hasRole} from "@/lib/auth";

const noCache = {
    "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
    "Pragma": "no-cache",
    "Expires": "0",
};

// UUID validator
const UUID_RE =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const isUuid = (s: string) => UUID_RE.test(s);

// text → trim → non-empty (wajib)
const TextRequired = z
    .union([z.string(), z.number()])
    .transform(v => String(v).trim())
    .refine(s => s.length > 0, "Field wajib diisi.");
// text → trim (opsional)
const TextOptional = z.union([z.string(), z.number()]).transform(v => String(v).trim());
// array cleaner
const cleanStrArr = z
    .array(z.union([z.string(), z.number()]))
    .transform(arr => arr.map(v => String(v).trim()).filter(s => s.length > 0));

const ItemSchema = z.object({
    jabatan_terkait: TextRequired,
    unit_kerja_instansi: TextOptional.optional(),
    dalam_hal: cleanStrArr.default([]),
});
const ReplaceAllSchema = z.array(ItemSchema);

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
    try {
        const user = getUserFromReq(_req);
        if (!user) return NextResponse.json({error: "Unauthorized"}, {status: 401});

        const {id} = await ctx.params; // jabatan_id (UUID)
        if (!isUuid(id)) {
            return NextResponse.json({error: "jabatan_id harus UUID"}, {status: 400});
        }

        const {rows} = await pool.query(
            `SELECT id, jabatan_id, jabatan_terkait, unit_kerja_instansi, dalam_hal
             FROM korelasi_jabatan
             WHERE jabatan_id = $1::uuid
             ORDER BY id`,
            [id]
        );
        const data = rows.map((r: any) => ({
            ...r,
            dalam_hal: Array.isArray(r.dalam_hal) ? r.dalam_hal : [],
        }));
        return NextResponse.json(data, {headers: noCache});
    } catch (e: any) {
        if (e?.code === "22P02") {
            return NextResponse.json({error: "jabatan_id harus UUID"}, {status: 400});
        }
        console.error("[korelasi-jabatan][GET]", e);
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

        const {id} = await ctx.params; // jabatan_id (UUID)
        if (!isUuid(id)) {
            return NextResponse.json({error: "jabatan_id harus UUID"}, {status: 400});
        }

        const json = await req.json().catch(() => ({}));
        const p = ItemSchema.safeParse(json);
        if (!p.success) {
            return NextResponse.json({error: "Validasi gagal", detail: p.error.flatten()}, {status: 400});
        }

        const {jabatan_terkait, unit_kerja_instansi = "", dalam_hal} = p.data;

        await client.query("BEGIN");
        const ins = await client.query(
            `INSERT INTO korelasi_jabatan
             (jabatan_id, jabatan_terkait, unit_kerja_instansi, dalam_hal, created_at, updated_at)
             VALUES ($1::uuid, $2, $3, $4, NOW(),
                     NOW()) RETURNING id, jabatan_id, jabatan_terkait, unit_kerja_instansi, dalam_hal, created_at, updated_at`,
            [id, jabatan_terkait, unit_kerja_instansi, dalam_hal]
        );
        await client.query("COMMIT");
        return NextResponse.json({ok: true, data: ins.rows[0]});
    } catch (e: any) {
        try {
            await client.query("ROLLBACK");
        } catch {
        }
        if (e?.code === "22P02") {
            return NextResponse.json({error: "jabatan_id harus UUID"}, {status: 400});
        }
        if (e?.code === "23503") {
            return NextResponse.json({error: "jabatan_id tidak ditemukan (FK)"}, {status: 400});
        }
        console.error("[korelasi-jabatan][POST]", e);
        return NextResponse.json({error: "General Error"}, {status: 500});
    } finally {
        client.release();
    }
}

// (opsional) replace-all
export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
    const client = await pool.connect();
    try {
        const user = getUserFromReq(req);
        if (!user || !hasRole(user, ["admin"])) {
            return NextResponse.json({error: "Forbidden"}, {status: 403});
        }

        const {id} = await ctx.params; // jabatan_id (UUID)
        if (!isUuid(id)) {
            return NextResponse.json({error: "jabatan_id harus UUID"}, {status: 400});
        }

        const json = await req.json().catch(() => ([]));
        const p = ReplaceAllSchema.safeParse(json);
        if (!p.success) {
            return NextResponse.json({error: "Validasi gagal", detail: p.error.flatten()}, {status: 400});
        }

        await client.query("BEGIN");
        await client.query(`DELETE
                            FROM korelasi_jabatan
                            WHERE jabatan_id = $1::uuid`, [id]);

        for (const it of p.data) {
            await client.query(
                `INSERT INTO korelasi_jabatan
                 (jabatan_id, jabatan_terkait, unit_kerja_instansi, dalam_hal, created_at, updated_at)
                 VALUES ($1::uuid, $2, $3, $4, NOW(), NOW())`,
                [id, it.jabatan_terkait, it.unit_kerja_instansi ?? "", it.dalam_hal ?? []]
            );
        }

        await client.query("COMMIT");
        return NextResponse.json({ok: true});
    } catch (e: any) {
        try {
            await client.query("ROLLBACK");
        } catch {
        }
        if (e?.code === "22P02") {
            return NextResponse.json({error: "jabatan_id harus UUID"}, {status: 400});
        }
        if (e?.code === "23503") {
            return NextResponse.json({error: "jabatan_id tidak ditemukan (FK)"}, {status: 400});
        }
        console.error("[korelasi-jabatan][PUT]", e);
        return NextResponse.json({error: "General Error"}, {status: 500});
    } finally {
        client.release();
    }
}
