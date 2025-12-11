/**
 * Utility functions for sanitizing user input to prevent XSS attacks
 * Particularly important for SweetAlert2 usage (CVE-2025-55182)
 */

/**
 * Escapes HTML special characters to prevent XSS injection
 * @param str - String that may contain HTML
 * @returns Escaped string safe for display
 */
export function escapeHtml(str: string | null | undefined): string {
    if (!str) return '';
    
    const map: Record<string, string> = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#x27;',
        '/': '&#x2F;',
    };
    
    return String(str).replace(/[&<>"'/]/g, (char) => map[char] || char);
}

/**
 * Sanitizes text for use in SweetAlert2 title/text parameters
 * Use this when displaying user-controlled content
 */
export function sanitizeForAlert(str: string | null | undefined): string {
    return escapeHtml(str);
}

/**
 * Sanitizes filename for display (removes path traversal attempts)
 */
export function sanitizeFilename(filename: string): string {
    if (!filename) return '';
    
    // Remove path traversal patterns
    let clean = filename.replace(/\.\./g, '');
    
    // Remove path separators
    clean = clean.replace(/[/\\]/g, '');
    
    // Escape HTML
    return escapeHtml(clean);
}

/**
 * Strips all HTML tags from a string
 * Use this for text-only fields that should never contain HTML
 */
export function stripHtml(str: string | null | undefined): string {
    if (!str) return '';
    return String(str).replace(/<[^>]*>/g, '');
}
