// src/lib/auth.ts
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";

const AT_MIN = parseInt(process.env.ACCESS_TOKEN_TTL_MINUTES || "60", 10); // default 60 menit
const RT_DAYS = parseInt(process.env.REFRESH_TOKEN_TTL_DAYS || "30", 10);  // default 30 hari

export const ACCESS_TOKEN_MAXAGE_SEC = AT_MIN * 60;
export const REFRESH_TOKEN_MAXAGE_SEC = RT_DAYS * 24 * 60 * 60;

export async function hashPassword(plain: string) {
    const salt = await bcrypt.genSalt(12);
    return bcrypt.hash(plain, salt);
}
export function comparePassword(plain: string, hash: string) {
    return bcrypt.compare(plain, hash);
}

export function signAccessToken(payload: object) {
    // contoh: "60m"
    return jwt.sign(payload, process.env.JWT_ACCESS_SECRET!, { expiresIn: `${AT_MIN}m` });
}
export function signRefreshToken(payload: object) {
    // contoh: "30d"
    return jwt.sign(payload, process.env.JWT_REFRESH_SECRET!, { expiresIn: `${RT_DAYS}d` });
}
export function verifyAccessToken(token: string) {
    return jwt.verify(token, process.env.JWT_ACCESS_SECRET!);
}
export function verifyRefreshToken(token: string) {
    return jwt.verify(token, process.env.JWT_REFRESH_SECRET!);
}

function isProd() { return process.env.NODE_ENV === "production"; }
export function httpOnlyCookie(name: string, value: string, maxAgeSec: number) {
    return `${name}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAgeSec};${isProd() ? " Secure;" : ""}`;
}
