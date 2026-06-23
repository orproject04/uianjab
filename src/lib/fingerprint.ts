import crypto from 'crypto';

/**
 * Membuat hash SHA-256 dari string User-Agent.
 * Ini digunakan sebagai "fingerprint" untuk mengikat JWT ke perangkat tertentu.
 */
export function generateUserAgentHash(userAgent: string | null | undefined): string {
    // Jika tidak ada user-agent (misal dipanggil dari script backend/cron), fallback ke string default
    const uaString = userAgent || 'unknown-user-agent';
    
    // Hash string tersebut
    return crypto.createHash('sha256').update(uaString).digest('hex');
}
