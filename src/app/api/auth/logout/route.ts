// src/app/api/auth/logout/route.ts
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import pool from "@/lib/db";
import { hashRefreshToken } from "@/lib/tokens";

/**
 * Logout: ambil refresh token dari cookie atau fallback ke Authorization/body.
 * Server akan revoke session dan clear cookies.
 * Jika user login via SSO, redirect ke Keycloak logout endpoint.
 */
export async function POST(req: NextRequest) {
    const cookieStore = await cookies();
    const cookieRefresh = cookieStore.get('refresh_token')?.value;
    const keycloakIdToken = cookieStore.get('keycloak_id_token')?.value;
    const auth = req.headers.get("authorization") || "";
    const headerRefresh = auth.startsWith("Bearer ") ? auth.slice(7) : "";
    const body = await req.json().catch(() => ({}));
    const refresh = cookieRefresh || headerRefresh || body?.refresh_token;

    if (refresh) {
        await pool.query(
            `UPDATE user_session
          SET is_revoked = true,
              last_used_at = now()
        WHERE refresh_token_hash = $1`,
            [hashRefreshToken(refresh)]
        );
    }

    // Clear HTTP-only cookies
    cookieStore.delete('access_token');
    cookieStore.delete('refresh_token');
    cookieStore.delete('keycloak_id_token');

    // Jika user login via Keycloak SSO, redirect ke logout endpoint Keycloak
    if (keycloakIdToken) {
        const keycloakUrl = process.env.KEYCLOAK_URL || 'https://ssoaws.duckdns.org';
        const realm = process.env.KEYCLOAK_REALM || 'master';
        const clientId = process.env.KEYCLOAK_CLIENT_ID || 'pandawa';
        const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
        
        const logoutUrl = new URL(`${keycloakUrl}/realms/${realm}/protocol/openid-connect/logout`);
        logoutUrl.searchParams.set('client_id', clientId);
        logoutUrl.searchParams.set('post_logout_redirect_uri', `${baseUrl}/signin`);
        logoutUrl.searchParams.set('id_token_hint', keycloakIdToken);

        return NextResponse.json({ 
            ok: true, 
            message: "Logout berhasil",
            keycloak_logout_url: logoutUrl.toString()
        }, { status: 200 });
    }

    return NextResponse.json({ ok: true, message: "Logout berhasil" }, { status: 200 });
}
