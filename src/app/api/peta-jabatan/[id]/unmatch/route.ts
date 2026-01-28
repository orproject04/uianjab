import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { getUserFromReq, hasRole } from "@/lib/auth";

export async function PATCH(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const user = getUserFromReq(req);
        if (!user || !hasRole(user, ["admin"])) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

        const { id: petaId } = await params;

        // Update peta_jabatan - set jabatan_id to NULL
        await pool.query(
            `UPDATE peta_jabatan 
             SET jabatan_id = NULL, updated_at = NOW()
             WHERE id = $1`,
            [petaId]
        );

        return NextResponse.json({ ok: true, message: "Berhasil unmatch" });
    } catch (error: any) {
        console.error("Error unmatching peta jabatan:", error);
        return NextResponse.json(
            { error: error?.message || "Gagal unmatch" },
            { status: 500 }
        );
    }
}
