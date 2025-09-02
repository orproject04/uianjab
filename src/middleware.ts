import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jwtVerify } from "jose";

async function getUserFromCookies(req: NextRequest) {
    const accessToken = req.cookies.get("access_token")?.value;
    if (!accessToken) return null;
    try {
        const secret = new TextEncoder().encode(process.env.JWT_ACCESS_SECRET!);
        const { payload } = await jwtVerify(accessToken, secret);
        return {
            id: (payload.sub as string) || "",
            email: (payload.email as string) || "",
            role: (payload.role as string) || "user",
        };
    } catch {
        return null;
    }
}

function isPublicAsset(pathname: string) {
    if (/\.[a-zA-Z0-9]+$/.test(pathname)) return true; // *.png *.svg *.css *.js *.woff2 ...
    if (
        pathname.startsWith("/_next/") ||
        pathname === "/favicon.ico" ||
        pathname === "/robots.txt" ||
        pathname === "/sitemap.xml" ||
        pathname.startsWith("/images/") ||
        pathname.startsWith("/assets/") ||
        pathname.startsWith("/icons/") ||
        pathname.startsWith("/fonts/")
    ) return true;
    return false;
}

export async function middleware(req: NextRequest) {
    const { pathname } = req.nextUrl;

    // 1) lewati aset publik/statik
    if (isPublicAsset(pathname)) return NextResponse.next();

    // 2) identifikasi halaman auth
    const isAuthPage =
        pathname.startsWith("/signin") ||
        pathname.startsWith("/signup") ||
        pathname.startsWith("/forgot-password") ||
        pathname.startsWith("/reset-password");

    // 3) API auth selalu dibiarkan
    if (pathname.startsWith("/api/auth")) return NextResponse.next();

    const user = await getUserFromCookies(req);

    // 4) Jika SUDAH login & mengakses halaman auth → redirect cepat ke "/"
    if (isAuthPage && user) {
        return NextResponse.redirect(new URL("/", req.url)); // ganti "/" jika mau ke "/Anjab"
    }

    // 5) Jika BELUM login & mengakses halaman auth → BIARKAN (jangan redirect ke /signin lagi)
    if (isAuthPage && !user) {
        // Bersihkan kasus loop: kalau ada ?next=... yang menunjuk ke /signin, hapus.
        const nextParam = req.nextUrl.searchParams.get("next") || "";
        if (nextParam.startsWith("/signin")) {
            const clean = new URL(pathname, req.url);
            return NextResponse.redirect(clean); // hilangkan query 'next' yang recursive
        }
        return NextResponse.next();
    }

    // 6) Proteksi global: halaman non-auth wajib login
    if (!user) {
        const signinUrl = new URL("/signin", req.url);
        // simpan tujuan balik setelah login (hanya untuk non-auth pages)
        const qs = req.nextUrl.search; // termasuk query kalau ada
        signinUrl.searchParams.set("next", pathname + (qs || ""));
        return NextResponse.redirect(signinUrl);
    }

    // 7) Batasi admin-only untuk /AnjabEdit & /AnjabCreate
    if (
        (pathname.startsWith("/AnjabEdit") || pathname.startsWith("/AnjabCreate")) &&
        user.role !== "admin"
    ) {
        return NextResponse.redirect(new URL("/", req.url));
    }

    return NextResponse.next();
}

export const config = { matcher: ["/:path*"] };
