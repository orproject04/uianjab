// src/app/api/me/route.ts
import { cookies } from "next/headers";
import { jwtVerify } from "jose";

export async function GET() {
    const cookieStore = await cookies();
    const token = cookieStore.get("access_token")?.value;
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
