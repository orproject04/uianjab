// src/app/api/auth/keycloak/login/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getKeycloakConfig, getKeycloakAuthUrl } from '@/lib/keycloak';
import { randomBytes, createHash } from 'crypto';
import { sanitizeInternalNext } from '@/lib/redirect';

function generateRandomString(length: number = 32): string {
    return randomBytes(length).toString('base64url');
}

function generateCodeChallenge(verifier: string): string {
    return createHash('sha256')
        .update(verifier)
        .digest('base64url');
}

export async function GET(req: NextRequest) {
    try {
        const config = getKeycloakConfig();
        
        // Generate state dan code_verifier untuk PKCE
        const state = generateRandomString();
        const code_verifier = generateRandomString(32);
        const code_challenge = generateCodeChallenge(code_verifier);

        // Ambil 'next' parameter dari query untuk redirect setelah login
        const next = sanitizeInternalNext(req.nextUrl.searchParams.get('next'));
        
        // Generate authorization URL
        const authUrl = getKeycloakAuthUrl(config, state, code_challenge);

        // Simpan state, code_verifier, dan next ke dalam cookies untuk verifikasi di callback
        const response = NextResponse.redirect(authUrl);
        
        // Set cookies with proper security settings
        const isProduction = process.env.NODE_ENV === 'production';
        response.cookies.set('keycloak_state', state, {
            httpOnly: true,
            secure: isProduction,
            sameSite: 'lax',
            maxAge: 60 * 10, // 10 minutes
            path: '/',
        });
        
        response.cookies.set('keycloak_code_verifier', code_verifier, {
            httpOnly: true,
            secure: isProduction,
            sameSite: 'lax',
            maxAge: 60 * 10, // 10 minutes
            path: '/',
        });
        
        response.cookies.set('keycloak_next', next, {
            httpOnly: true,
            secure: isProduction,
            sameSite: 'lax',
            maxAge: 60 * 10, // 10 minutes
            path: '/',
        });

        return response;
    } catch (error) {
        console.error('Keycloak login error:', error);
        return NextResponse.json(
            { error: 'Failed to initiate Keycloak login' },
            { status: 500 }
        );
    }
}
