/**
 * Convert a string to title case
 * Example: "hello world" -> "Hello World"
 */
export function titleCase(s: string): string {
    return s
        .toLowerCase()
        .split(" ")
        .filter(Boolean)
        .map((w) => w[0].toUpperCase() + w.slice(1))
        .join(" ");
}

/**
 * Convert slug to readable title
 * Example: "kepala-bagian-keuangan" -> "Kepala Bagian Keuangan"
 */
export function slugToTitle(slug: string): string {
    const words = slug.replace(/-/g, " ");
    return titleCase(words);
}