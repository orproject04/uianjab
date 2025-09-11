// src/lib/auth.ts
// Bearer-only (tanpa cookie HttpOnly). Pakai header Authorization: Bearer <token>

import jwt, { JwtPayload } from "jsonwebtoken";
import bcrypt from "bcryptjs";
import type { NextRequest } from "next/server";

/* ====== Konfigurasi TTL via .env ====== */
// ACCESS_TOKEN_TTL_MINUTES=60   (default 60 menit)
// REFRESH_TOKEN_TTL_DAYS=30     (default 30 hari)
const AT_MIN  = parseInt(process.env.ACCESS_TOKEN_TTL_MINUTES || "60", 10);
const RT_DAYS = parseInt(process.env.REFRESH_TOKEN_TTL_DAYS   || "30", 10);

export const ACCESS_TOKEN_MAXAGE_SEC  = AT_MIN * 60;
export const REFRESH_TOKEN_MAXAGE_SEC = RT_DAYS * 24 * 60 * 60;

/* ====== Password hashing ====== */
export async function hashPassword(plain: string) {
    const salt = await bcrypt.genSalt(12);
    return bcrypt.hash(plain, salt);
}
export function comparePassword(plain: string, hash: string) {
    return bcrypt.compare(plain, hash);
}

/* ====== JWT ====== */
type BaseClaims = JwtPayload & {
    sub?: string;
    email?: string;
    role?: string;
    full_name?: string | null;
};

export function signAccessToken(payload: object) {
    return jwt.sign(payload, process.env.JWT_ACCESS_SECRET!, {
        expiresIn: `${AT_MIN}m`,
        algorithm: "HS256",
    });
}
export function signRefreshToken(payload: object) {
    return jwt.sign(payload, process.env.JWT_REFRESH_SECRET!, {
        expiresIn: `${RT_DAYS}d`,
        algorithm: "HS256",
    });
}

export function verifyAccessToken(token: string): BaseClaims {
    return jwt.verify(token, process.env.JWT_ACCESS_SECRET!, {
        algorithms: ["HS256"],
        clockTolerance: 5, // toleransi drift jam
    }) as BaseClaims;
}
export function verifyRefreshToken(token: string): BaseClaims {
    return jwt.verify(token, process.env.JWT_REFRESH_SECRET!, {
        algorithms: ["HS256"],
        clockTolerance: 5,
    }) as BaseClaims;
}

// “Safe verify”: balik null jika invalid/expired
export function safeVerifyAccess(token: string): BaseClaims | null {
    try { return verifyAccessToken(token); } catch { return null; }
}
export function safeVerifyRefresh(token: string): BaseClaims | null {
    try { return verifyRefreshToken(token); } catch { return null; }
}

/* ====== Guard helper untuk API Next.js (Authorization Bearer) ====== */
export type AuthUser = { id: string; email: string; role: string; full_name?: string | null };

export function getBearerFromReq(req: NextRequest): string | null {
    const auth = req.headers.get("authorization") || "";
    const m = auth.match(/^Bearer\s+(.+)$/i);
    return m?.[1]?.trim() || null;
}

export function getUserFromReq(req: NextRequest): AuthUser | null {
    const token = getBearerFromReq(req);
    if (!token) return null;
    const dec = safeVerifyAccess(token);
    if (!dec) return null;
    return {
        id: String(dec.sub ?? ""),
        email: String(dec.email ?? ""),
        role: String(dec.role ?? "user"),
        full_name: dec.full_name ?? null,
    };
}

export function hasRole(user: AuthUser | null, roles: string[]) {
    return !!user && roles.includes(user.role);
}
