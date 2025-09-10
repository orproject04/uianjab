import crypto from "crypto";

export function randomToken(bytes = 32) {
    return crypto.randomBytes(bytes).toString("base64url");
}

export function hashRefreshToken(token: string) {
    const pepper = process.env.REFRESH_TOKEN_PEPPER || ""; // tambahkan di .env
    return crypto.createHash("sha256").update(token + pepper).digest("hex");
}
