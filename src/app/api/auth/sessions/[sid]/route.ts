import { NextRequest } from "next/server";
import pool from "@/lib/db";
import { getAuthUser } from "@/lib/auth-guard";

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ sid: string }> }) {
    const user = getAuthUser();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const { sid } = await ctx.params;
    await pool.query(`DELETE FROM user_session WHERE id=$1 AND user_id=$2`, [sid, user.id]);
    return Response.json({ ok: true });
}
