import { cookies, headers } from "next/headers";
import jwt from "jsonwebtoken";

export type AuthUser = { id: string; email: string; role: string };

// ✅ sekarang async
export async function getAuthUser(): Promise<AuthUser | null> {
    const cookieStore = await cookies();                     // ← await
    const token = cookieStore.get("access_token")?.value;
    if (!token) return null;
    try {
        const dec = jwt.verify(token, process.env.JWT_ACCESS_SECRET!) as any;
        return { id: dec.sub, email: dec.email, role: dec.role };
    } catch {
        return null;
    }
}

export function requireRole(user: AuthUser | null, roles: string[]) {
    return !!user && roles.includes(user.role);
}

// ✅ sekarang async
export async function getClientMeta() {
    const h = await headers();                               // ← await
    return {
        ip: h.get("x-forwarded-for") || "0.0.0.0",
        ua: h.get("user-agent") || "unknown",
    };
}
