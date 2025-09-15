// src/app/api/auth/me/route.ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getUserFromReq } from "@/lib/auth";

export async function GET(req: NextRequest) {
    const user = getUserFromReq(req);
    if (!user) return NextResponse.json({ error: "Unauthorized, Silakan login kembali" }, { status: 401 });

    // data minimal dari token (tanpa query DB)
    return NextResponse.json(
        { ok: true, data: { id: user.id, email: user.email, role: user.role, full_name: user.full_name ?? null } },
        { status: 200 }
    );
}
