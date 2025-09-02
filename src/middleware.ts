// middleware.ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jwtVerify } from "jose";

async function getUser(req: NextRequest) {
    const token = req.cookies.get("access_token")?.value;
    if (!token) return null;
    try {
        const secret = new TextEncoder().encode(process.env.JWT_ACCESS_SECRET!);
        const { payload } = await jwtVerify(token, secret);
        return { id: payload.sub as string, email: payload.email as string, role: (payload.role as string) || "user" };
    } catch {
        return null;
    }
}

function isPublicAsset(p: string) {
    return (
        /\.[a-zA-Z0-9]+$/.test(p) ||
        p.startsWith("/_next/") ||
        p === "/favicon.ico" ||
        p === "/robots.txt" ||
        p === "/sitemap.xml" ||
        p.startsWith("/images/") || p.startsWith("/assets/") ||
        p.startsWith("/icons/")  || p.startsWith("/fonts/")
    );
}

function isAuthPage(p: string) {
    return ["/signin", "/signup", "/forgot-password", "/reset-password"].some((x) => p.startsWith(x));
}

function isAdminPage(p: string) {
    return p === "/StrukturOrganisasi"; // tambah di sini jika perlu
}

function isStrukturOrgMutation(req: NextRequest) {
    const p = req.nextUrl.pathname;
    const m = req.method.toUpperCase();
    if (!p.startsWith("/api/struktur-organisasi")) return false;
    return m === "POST" || m === "PUT" || m === "PATCH" || m === "DELETE";
}

export async function middleware(req: NextRequest) {
    const { pathname } = req.nextUrl;

    // Preflight/HEAD lewat
    if (req.method === "OPTIONS" || req.method === "HEAD") return NextResponse.next();

    // Aset publik
    if (isPublicAsset(pathname)) return NextResponse.next();

    // API AUTH provider
    if (pathname.startsWith("/api/auth")) return NextResponse.next();

    // ====== API rules ======
    if (pathname.startsWith("/api/")) {
        // /api/me → wajib login
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

        // Selain itu: API dibuka (GET/POST dsb) — pastikan handler masih validasi input!
        return NextResponse.next();
    }

    // ====== Page rules ======
    const user = await getUser(req);

    // Halaman auth
    if (isAuthPage(pathname)) {
        if (user) return NextResponse.redirect(new URL("/", req.url));
        const nextParam = req.nextUrl.searchParams.get("next") || "";
        if (nextParam.startsWith("/signin")) return NextResponse.redirect(new URL(pathname, req.url));
        return NextResponse.next();
    }

    // Global: selain halaman auth → wajib login
    if (!user) {
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
