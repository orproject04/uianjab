// src/lib/rate-limit.ts
import { NextRequest } from "next/server";

interface RateLimitRecord {
    count: number;
    resetTime: number; // timestamp in ms when window resets
    lockedUntil?: number; // timestamp in ms when lockout expires
}

// Global in-memory storage (preserved across module reloads)
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
if (!(globalThis as any).__authRateLimitMap) {
    (globalThis as any).__authRateLimitMap = new Map<string, RateLimitRecord>();
}
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
const rateLimitMap: Map<string, RateLimitRecord> = (globalThis as any).__authRateLimitMap;

// Periodic cleanup of expired entries (runs every 5 minutes)
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
if (!(globalThis as any).__authRateLimitCleanup) {
    (globalThis as any).__authRateLimitCleanup = setInterval(() => {
        const now = Date.now();
        for (const [key, record] of rateLimitMap.entries()) {
            if (now > record.resetTime && (!record.lockedUntil || now > record.lockedUntil)) {
                rateLimitMap.delete(key);
            }
        }
    }, 5 * 60 * 1000);
}

export function getClientIp(req: NextRequest): string {
    const forwarded = req.headers.get("x-forwarded-for");
    if (forwarded) {
        return forwarded.split(",")[0].trim();
    }
    const realIp = req.headers.get("x-real-ip");
    if (realIp) return realIp.trim();
    const cfIp = req.headers.get("cf-connecting-ip");
    if (cfIp) return cfIp.trim();
    return "127.0.0.1";
}

export interface RateLimitStatus {
    allowed: boolean;
    remaining: number;
    retryAfterSeconds: number;
    totalAttempts: number;
}

/**
 * Cek apakah IP/akun sedang di-lockout atau melebihi batas.
 */
export function checkRateLimit(
    key: string,
    maxAttempts = 5,
    windowMs = 60 * 1000,
    lockoutMs = 60 * 1000
): RateLimitStatus {
    const now = Date.now();
    const record = rateLimitMap.get(key);

    if (!record) {
        return {
            allowed: true,
            remaining: maxAttempts,
            retryAfterSeconds: 0,
            totalAttempts: 0,
        };
    }

    // Jika sedang dalam masa lockout
    if (record.lockedUntil && now < record.lockedUntil) {
        const retryAfter = Math.max(1, Math.ceil((record.lockedUntil - now) / 1000));
        return {
            allowed: false,
            remaining: 0,
            retryAfterSeconds: retryAfter,
            totalAttempts: record.count,
        };
    }

    // Jika window waktu sudah lewat, reset counter
    if (now > record.resetTime) {
        rateLimitMap.delete(key);
        return {
            allowed: true,
            remaining: maxAttempts,
            retryAfterSeconds: 0,
            totalAttempts: 0,
        };
    }

    // Jika jumlah percobaan sudah mencapai batas maksimum
    if (record.count >= maxAttempts) {
        const retryAfter = Math.max(1, Math.ceil((record.resetTime - now) / 1000));
        return {
            allowed: false,
            remaining: 0,
            retryAfterSeconds: retryAfter,
            totalAttempts: record.count,
        };
    }

    return {
        allowed: true,
        remaining: Math.max(0, maxAttempts - record.count),
        retryAfterSeconds: 0,
        totalAttempts: record.count,
    };
}

/**
 * Catat percobaan login yang gagal. Jika mencapai limit, otomatis mengaktifkan lockout.
 */
export function recordFailedAttempt(
    key: string,
    maxAttempts = 5,
    windowMs = 60 * 1000,
    lockoutMs = 60 * 1000
): RateLimitStatus {
    const now = Date.now();
    let record = rateLimitMap.get(key);

    if (!record || now > record.resetTime) {
        record = {
            count: 1,
            resetTime: now + windowMs,
        };
        rateLimitMap.set(key, record);
        return {
            allowed: true,
            remaining: maxAttempts - 1,
            retryAfterSeconds: 0,
            totalAttempts: 1,
        };
    }

    record.count += 1;

    if (record.count >= maxAttempts) {
        record.lockedUntil = now + lockoutMs;
        const retryAfter = Math.max(1, Math.ceil(lockoutMs / 1000));
        return {
            allowed: false,
            remaining: 0,
            retryAfterSeconds: retryAfter,
            totalAttempts: record.count,
        };
    }

    return {
        allowed: true,
        remaining: Math.max(0, maxAttempts - record.count),
        retryAfterSeconds: 0,
        totalAttempts: record.count,
    };
}

/**
 * Bersihkan counter rate limit (misal saat login berhasil)
 */
export function clearRateLimit(key: string): void {
    rateLimitMap.delete(key);
}
