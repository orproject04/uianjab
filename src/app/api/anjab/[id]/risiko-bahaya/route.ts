import {NextRequest, NextResponse} from "next/server";
import pool from "@/lib/db";
import {z} from "zod";
import {getUserFromReq, hasRole} from "@/lib/auth";

const noCache = {
    "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
    "Pragma": "no-cache",
    "Expires": "0",
};

const UUID_RE =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const isUuid = (s: string) => UUID_RE.test(s);

async function jabatanExists(id: string): Promise<boolean> {
    const q = await pool.query<{ exists: boolean }>(
        "SELECT EXISTS(SELECT 1 FROM jabatan WHERE id = $1::uuid) AS exists",
        [id]
    );
    return !!q.rows[0]?.exists;
}

// coerce → trim → non-empty (wajib)
const TextRequired = z
    .union([z.string(), z.number()])
    .transform(v => String(v).trim())
    .refine(s => s.length > 0, "Nama risiko wajib diisi.");
// coerce → trim (opsional)
const TextOptional = z.union([z.string(), z.number()]).transform(v => String(v).trim());

const ItemSchema = z.object({
    nama_risiko: TextRequired,
    penyebab: TextOptional.optional(),
});
const ReplaceAllSchema = z.array(ItemSchema);

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
    try {
        const user = getUserFromReq(_req);
        if (!user) return NextResponse.json({error: "Unauthorized, Silakan login kembali"}, {status: 401});

        const {id} = await ctx.params;
        if (!isUuid(id)) {
            return NextResponse.json({error: "Invalid, id harus UUID, id_risiko harus angka"}, {status: 400});
        }

        // ✅ cek jabatan
        if (!(await jabatanExists(id))) {
            return NextResponse.json({error: "Not Found, (Dokumen analisis jabatan tidak ditemukan)"}, {status: 404});
        }

        const {rows} = await pool.query(
            `SELECT id, jabatan_id, nama_risiko, penyebab
             FROM risiko_bahaya
             WHERE jabatan_id = $1::uuid
             ORDER BY id`,
            [id]
        );
        return NextResponse.json(rows, {headers: noCache});
    } catch (e: any) {
        if (e?.code === "22P02") {
            return NextResponse.json({error: "Invalid, id harus UUID, id_risiko harus angka"}, {status: 400});
        }
        console.error("[risiko-bahaya][GET]", e);
        return NextResponse.json({error: "General Error"}, {status: 500});
    }
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
    const client = await pool.connect();
    try {
        const user = getUserFromReq(req);
        if (!user || !hasRole(user, ["admin"])) {
            return NextResponse.json({error: "Forbidden, Anda tidak berhak mengakses fitur ini"}, {status: 403});
        }

        const {id} = await ctx.params;
        if (!isUuid(id)) return NextResponse.json({error: "Invalid, id harus UUID, id_risiko harus angka"}, {status: 400});

        // ✅ cek jabatan
        if (!(await jabatanExists(id))) {
            return NextResponse.json({error: "Not Found, (Dokumen analisis jabatan tidak ditemukan)"}, {status: 404});
        }

        const json = await req.json().catch(() => ({}));
        const p = ItemSchema.safeParse(json);
        if (!p.success) {
            return NextResponse.json({error: "Validasi gagal", detail: p.error.flatten()}, {status: 400});
        }

        const {nama_risiko, penyebab = ""} = p.data;

        await client.query("BEGIN");
        const ins = await client.query(
            `INSERT INTO risiko_bahaya
                 (jabatan_id, nama_risiko, penyebab, created_at, updated_at)
             VALUES ($1::uuid, $2, $3, NOW(),
                     NOW()) RETURNING id, jabatan_id, nama_risiko, penyebab`,
            [id, nama_risiko, penyebab]
        );
        await client.query("COMMIT");

        return NextResponse.json({ok: true, data: ins.rows[0]});
    } catch (e: any) {
        try {
            await client.query("ROLLBACK");
        } catch {
        }
        if (e?.code === "22P02") return NextResponse.json({error: "Invalid, id harus UUID, id_risiko harus angka"}, {status: 400});
        if (e?.code === "23503") return NextResponse.json({error: "jabatan_id tidak ditemukan"}, {status: 400});
        console.error("[risiko-bahaya][POST]", e);
        return NextResponse.json({error: "General Error"}, {status: 500});
    } finally {
        client.release();
    }
}

export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
    const client = await pool.connect();
    try {
        const user = getUserFromReq(req);
        if (!user || !hasRole(user, ["admin"])) {
            return NextResponse.json({error: "Forbidden, Anda tidak berhak mengakses fitur ini"}, {status: 403});
        }

        const {id} = await ctx.params;
        if (!isUuid(id)) return NextResponse.json({error: "Invalid, id harus UUID, id_risiko harus angka"}, {status: 400});

        // ✅ cek jabatan
        if (!(await jabatanExists(id))) {
            return NextResponse.json({error: "Not Found, (Dokumen analisis jabatan tidak ditemukan)"}, {status: 404});
        }

        const json = await req.json().catch(() => ([]));
        const p = ReplaceAllSchema.safeParse(json);
        if (!p.success) {
            return NextResponse.json({error: "Validasi gagal", detail: p.error.flatten()}, {status: 400});
        }

        await client.query("BEGIN");
        await client.query(`DELETE
                            FROM risiko_bahaya
                            WHERE jabatan_id = $1::uuid`, [id]);

        const inserted: any[] = [];
        for (const it of p.data) {
            const ins = await client.query(
                `INSERT INTO risiko_bahaya
                     (jabatan_id, nama_risiko, penyebab, created_at, updated_at)
                 VALUES ($1::uuid, $2, $3, NOW(),
                         NOW()) RETURNING id, jabatan_id, nama_risiko, penyebab`,
                [id, it.nama_risiko, it.penyebab ?? ""]
            );
            inserted.push(ins.rows[0]);
        }

        await client.query("COMMIT");
        return NextResponse.json({ok: true, data: inserted});
    } catch (e: any) {
        try {
            await client.query("ROLLBACK");
        } catch {
        }
        if (e?.code === "22P02") return NextResponse.json({error: "Invalid, id harus UUID, id_risiko harus angka"}, {status: 400});
        if (e?.code === "23503") return NextResponse.json({error: "jabatan_id tidak ditemukan"}, {status: 400});
        console.error("[risiko-bahaya][PUT]", e);
        return NextResponse.json({error: "General Error"}, {status: 500});
    } finally {
        client.release();
    }
}
