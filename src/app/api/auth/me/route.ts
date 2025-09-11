// src/app/api/auth/me/route.ts
import { NextRequest } from "next/server";
import { jwtVerify } from "jose";

export async function GET(req: NextRequest) {
    // 1) Ambil token dari Authorization header: "Bearer <token>"
    const auth = req.headers.get("authorization") || "";
    let token = "";

    if (auth.toLowerCase().startsWith("bearer ")) {
        token = auth.slice(7).trim();
    }

    if (!token) {
        return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const secret = new TextEncoder().encode(process.env.JWT_ACCESS_SECRET!);
        const { payload } = await jwtVerify(token, secret, { algorithms: ["HS256"] });

        const data = {
            id: String(payload.sub ?? ""),
            email: String(payload.email ?? ""),
            role: String(payload.role ?? "user"),
            full_name: String(payload.full_name ?? "user"),
        };

        return Response.json({ ok: true, data }, { status: 200 });
    } catch {
        return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
}
