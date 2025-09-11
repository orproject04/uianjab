// src/lib/auth.ts
// Bearer-only: tidak ada lagi cookie HttpOnly di sini.

import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import type { NextRequest } from "next/server";

/* TTL via env (default: AT=60 menit, RT=30 hari) */
const AT_MIN = parseInt(process.env.ACCESS_TOKEN_TTL_MINUTES || "60", 10);
const RT_DAYS = parseInt(process.env.REFRESH_TOKEN_TTL_DAYS || "30", 10);

export const ACCESS_TOKEN_MAXAGE_SEC = AT_MIN * 60;
export const REFRESH_TOKEN_MAXAGE_SEC = RT_DAYS * 24 * 60 * 60;

/* Password */
export async function hashPassword(plain: string) {
    const salt = await bcrypt.genSalt(12);
    return bcrypt.hash(plain, salt);
}
export function comparePassword(plain: string, hash: string) {
    return bcrypt.compare(plain, hash);
}

/* JWT: sign/verify */
export function signAccessToken(payload: object) {
    return jwt.sign(payload, process.env.JWT_ACCESS_SECRET!, { expiresIn: `${AT_MIN}m` });
}
export function signRefreshToken(payload: object) {
    return jwt.sign(payload, process.env.JWT_REFRESH_SECRET!, { expiresIn: `${RT_DAYS}d` });
}
export function verifyAccessToken(token: string) {
    return jwt.verify(token, process.env.JWT_ACCESS_SECRET!);
}
export function verifyRefreshToken(token: string) {
    return jwt.verify(token, process.env.JWT_REFRESH_SECRET!);
}

/* Auth helper untuk API/middleware (header Authorization saja) */
export type AuthUser = { id: string; email: string; role: string; full_name?: string | null };

export function getBearerFromReq(req: NextRequest): string | null {
    const auth = req.headers.get("authorization") || "";
    if (auth.startsWith("Bearer ")) return auth.slice(7);
    return null;
}

export function requireUserFromReq(req: NextRequest): AuthUser {
    const token = getBearerFromReq(req);
    if (!token) throw new Error("UNAUTHORIZED");
    try {
        const dec = verifyAccessToken(token) as any;
        return {
            id: String(dec.sub ?? ""),
            email: String(dec.email ?? ""),
            role: String(dec.role ?? "user"),
            full_name: dec.full_name ?? null,
        };
    } catch {
        throw new Error("UNAUTHORIZED");
    }
}

export function requireRole(user: AuthUser | null, roles: string[]) {
    return !!user && roles.includes(user.role);
}
