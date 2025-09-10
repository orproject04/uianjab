import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jwtVerify } from "jose";

// ----- helpers -----
async function getUser(req: NextRequest) {
    const token = req.cookies.get("access_token")?.value;
    if (!token) return null;
    try {
        const secret = new TextEncoder().encode(process.env.JWT_ACCESS_SECRET!);
        const { payload } = await jwtVerify(token, secret, { algorithms: ["HS256"] }); // ★ pin algoritma
        const role = String(payload.role ?? "user").toLowerCase();
        return {
            id: String(payload.sub ?? ""),
            email: String(payload.email ?? ""),
            role,
        };
    } catch {
        return null;
    }
}

function hasRefresh(req: NextRequest) {
    return Boolean(req.cookies.get("refresh_token")?.value); // ★ cek ada refresh cookie
}

function isPublicAsset(p: string) {
    return (
        /\.[a-zA-Z0-9]+$/.test(p) || // *.png, *.css, *.js, *.svg, *.woff2, dll
        p.startsWith("/_next/") ||
        p === "/favicon.ico" ||
        p === "/robots.txt" ||
        p === "/sitemap.xml" ||
        p.startsWith("/images/") ||
        p.startsWith("/assets/") ||
        p.startsWith("/icons/") ||
        p.startsWith("/fonts/")
    );
}

function isAuthPage(p: string) {
    return (
        p.startsWith("/signin") ||
        p.startsWith("/signup") ||
        p.startsWith("/forgot-password") ||
        p.startsWith("/reset-password")
    );
}

// admin-only mutations untuk struktur-organisasi
function isStrukturOrgMutation(req: NextRequest) {
    const p = req.nextUrl.pathname;
    const m = req.method.toUpperCase();
    if (!p.startsWith("/api/struktur-organisasi")) return false;
    return m === "POST" || m === "PUT" || m === "PATCH" || m === "DELETE";
}

// admin-only mutations untuk anjab
function isAnjabMutation(req: NextRequest) {
    const p = req.nextUrl.pathname;
    const m = req.method.toUpperCase();
    if (!p.startsWith("/api/anjab")) return false;
    return m === "POST" || m === "PUT" || m === "PATCH" || m === "DELETE";
}

// halaman admin-only (opsional, tambahkan sesuai kebutuhan)
function isAdminPage(p: string) {
    return p === "/StrukturOrganisasi"; // tambahkan path lain bila perlu
}

// ----- middleware utama -----
export async function middleware(req: NextRequest) {
    const { pathname } = req.nextUrl;

    // lewati preflight/HEAD
    if (req.method === "OPTIONS" || req.method === "HEAD") return NextResponse.next();

    // lewati aset publik
    if (isPublicAsset(pathname)) return NextResponse.next();

    // lewati API auth
    if (pathname.startsWith("/api/auth")) return NextResponse.next();

    // ===== API =====
    if (pathname.startsWith("/api/")) {
        // contoh API me (kalau ada) → wajib login
        if (pathname === "/api/me") {
            const user = await getUser(req);
            if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
            return NextResponse.next();
        }

        // Mutasi struktur-organisasi → admin-only
        if (isStrukturOrgMutation(req)) {
            const user = await getUser(req);
            if (!user || user.role !== "admin") {
                return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
            }
            return NextResponse.next();
        }

        // Mutasi anjab → admin-only
        if (isAnjabMutation(req)) {
            const user = await getUser(req);
            if (!user || user.role !== "admin") {
                return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
            }
            return NextResponse.next();
        }

        // selain itu (READ/GET untuk API lain) → dibiarkan (exposed)
        return NextResponse.next();
    }

    // ===== Pages =====
    const user = await getUser(req);
    const hasRefreshCookie = hasRefresh(req); // ★

    // Halaman auth: kalau sudah login, pantulkan ke "/"
    if (isAuthPage(pathname)) {
        if (user) return NextResponse.redirect(new URL("/", req.url));
        // bersihkan loop ?next=/signin...
        const nextParam = req.nextUrl.searchParams.get("next") || "";
        if (nextParam.startsWith("/signin")) return NextResponse.redirect(new URL(pathname, req.url));
        return NextResponse.next();
    }

    // Global: selain halaman auth → wajib login
    if (!user) {
        if (hasRefreshCookie) {
            // ★ JANGAN redirect: biarkan page render, nanti client API (apiFetch)
            // ★ akan mendapat 401 lalu memicu /api/auth/refresh otomatis.
            return NextResponse.next();
        }
        // Tidak ada access token & TIDAK ada refresh token → redirect signin
        const signinUrl = new URL("/signin", req.url);
        const qs = req.nextUrl.search;
        signinUrl.searchParams.set("next", pathname + (qs || ""));
        return NextResponse.redirect(signinUrl);
    }

    // Admin-only pages
    if (isAdminPage(pathname) && user.role !== "admin") {
        return NextResponse.redirect(new URL("/", req.url));
    }

    return NextResponse.next();
}

export const config = { matcher: ["/:path*"] };
