import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { getUserFromReq, hasRole } from "@/lib/auth";

export async function PATCH(
    req: NextRequest,
    { params }: { params: { id: string } }
) {
    try {
        const user = getUserFromReq(req);
        if (!user || !hasRole(user, ["admin"])) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

        const body = await req.json();
        const { jabatan_id } = body;
        const petaId = params.id;

        if (!jabatan_id) {
            return NextResponse.json(
                { error: "jabatan_id required" },
                { status: 400 }
            );
        }

        // Update peta_jabatan
        await pool.query(
            `UPDATE peta_jabatan 
             SET jabatan_id = $1, updated_at = NOW()
             WHERE id = $2`,
            [jabatan_id, petaId]
        );

        return NextResponse.json({ ok: true });
    } catch (error: any) {
        console.error("Error matching peta jabatan:", error);
        return NextResponse.json(
            { error: error?.message || "Gagal matching" },
            { status: 500 }
        );
    }
}
