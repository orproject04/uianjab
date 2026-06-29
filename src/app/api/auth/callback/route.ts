// src/app/api/auth/callback/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getKeycloakConfig, exchangeCodeForToken, getUserInfo } from '@/lib/keycloak';
import pool from '@/lib/db';
import { signAccessToken, signRefreshToken, ACCESS_TOKEN_MAXAGE_SEC } from '@/lib/auth';
import { hashRefreshToken } from '@/lib/tokens';
import { sanitizeInternalNext } from '@/lib/redirect';
import { generateUserAgentHash } from '@/lib/fingerprint';

export async function GET(req: NextRequest) {
    try {
        const searchParams = req.nextUrl.searchParams;
        const code = searchParams.get('code');
        const state = searchParams.get('state');
        const error = searchParams.get('error');
        const errorDescription = searchParams.get('error_description');

        // Handle OAuth error dari Keycloak
        if (error) {
            console.error('Keycloak OAuth error:', error, errorDescription);
            return NextResponse.redirect(
                new URL(`/signin?error=${encodeURIComponent(errorDescription || error)}`, req.url)
            );
        }

        if (!code || !state) {
            return NextResponse.redirect(
                new URL('/signin?error=missing_code_or_state', req.url)
            );
        }

        // Ambil state, code_verifier, dan next dari cookies
        const cookieStore = await cookies();
        const savedState = cookieStore.get('keycloak_state')?.value;
        const codeVerifier = cookieStore.get('keycloak_code_verifier')?.value;
        const next = sanitizeInternalNext(cookieStore.get('keycloak_next')?.value);

        // Verifikasi state untuk mencegah CSRF
        if (!savedState || savedState !== state) {
            console.error('State mismatch:', { savedState, receivedState: state });
            return NextResponse.redirect(
                new URL('/signin?error=invalid_state', req.url)
            );
        }

        if (!codeVerifier) {
            console.error('Code verifier not found');
            return NextResponse.redirect(
                new URL('/signin?error=missing_code_verifier', req.url)
            );
        }

        // Tukar authorization code dengan tokens
        const config = getKeycloakConfig();
        const tokenSet = await exchangeCodeForToken(config, code, codeVerifier);

        // Ambil user info dari Keycloak
        const userinfo = await getUserInfo(config, tokenSet.access_token);
        

        // Extract user data dari Keycloak
        // Gunakan email jika ada, atau fallback ke preferred_username@keycloak.local
        let email = userinfo.email as string || '';
        if (!email && userinfo.preferred_username) {
            // Jika tidak ada email, gunakan preferred_username sebagai email
            email = `${userinfo.preferred_username}@keycloak.local`;
        }
        
        const fullName = userinfo.name as string || userinfo.preferred_username as string || '';
        const keycloakSub = userinfo.sub as string;

        if (!email) {
            console.error('No email or username in Keycloak userinfo');
            return NextResponse.redirect(
                new URL('/signin?error=no_email_or_username', req.url)
            );
        }

        // Cek apakah user sudah ada di database
        let { rows } = await pool.query(
            `SELECT id, email, role, full_name, is_email_verified
             FROM user_anjab
             WHERE email=$1`,
            [email]
        );

        let userId: string;
        let userRole: string;
        let userName: string | null;

        if (rows.length === 0) {
            // User baru dari SSO - auto register
            // Generate placeholder password hash (user SSO tidak perlu password)
            const placeholderPasswordHash = await import('bcryptjs').then(bcrypt => 
                bcrypt.hashSync(`keycloak_sso_${keycloakSub}_${Date.now()}`, 10)
            );
            
            const insertResult = await pool.query(
                `INSERT INTO user_anjab (email, password_hash, full_name, is_email_verified, role, keycloak_sub)
                 VALUES ($1, $2, $3, true, 'user', $4)
                 RETURNING id, email, role, full_name`,
                [email, placeholderPasswordHash, fullName, keycloakSub]
            );
            
            const newUser = insertResult.rows[0];
            userId = newUser.id;
            userRole = newUser.role;
            userName = newUser.full_name;
            
        } else {
            // User sudah ada
            const user = rows[0];
            userId = user.id;
            userRole = user.role;
            userName = user.full_name;

            // Update keycloak_sub jika belum ada
            await pool.query(
                `UPDATE user_anjab 
                 SET keycloak_sub = $1, is_email_verified = true, full_name = COALESCE(NULLIF(full_name, ''), $2)
                 WHERE id = $3`,
                [keycloakSub, fullName, userId]
            );

        }

        // Generate JWT tokens untuk aplikasi
        const userAgent = req.headers.get('user-agent');
        const fp = generateUserAgentHash(userAgent);

        const accessToken = signAccessToken({ 
            sub: userId, 
            email, 
            role: userRole, 
            full_name: userName,
            fp
        });
        const refreshToken = signRefreshToken({ sub: userId, fp });

        // Simpan refresh token di database
        const refreshHash = hashRefreshToken(refreshToken);
        const expires = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30);
        await pool.query(
            `INSERT INTO user_session (user_id, refresh_token_hash, expires_at)
             VALUES ($1, $2, $3)`,
            [userId, refreshHash, expires]
        );

        // Set HTTP-only cookies
        const isProduction = process.env.NODE_ENV === 'production';
        
        cookieStore.set('access_token', accessToken, {
            httpOnly: true,
            secure: isProduction,
            sameSite: 'lax',
            maxAge: ACCESS_TOKEN_MAXAGE_SEC,
            path: '/',
        });
        
        cookieStore.set('refresh_token', refreshToken, {
            httpOnly: true,
            secure: isProduction,
            sameSite: 'lax',
            maxAge: 60 * 60 * 24 * 30, // 30 days
            path: '/',
        });

        // Simpan id_token dari Keycloak untuk logout nanti
        if (tokenSet.id_token) {
            cookieStore.set('keycloak_id_token', tokenSet.id_token, {
                httpOnly: true,
                secure: isProduction,
                sameSite: 'lax',
                maxAge: 60 * 60 * 24 * 30, // 30 days
                path: '/',
            });
        }

        // Hapus cookies Keycloak yang temporary
        cookieStore.delete('keycloak_state');
        cookieStore.delete('keycloak_code_verifier');
        cookieStore.delete('keycloak_next');

        const appUrl = process.env.APP_URL!;
        return NextResponse.redirect(new URL(next, appUrl));
        // Redirect ke halaman yang diminta atau homepage
        // return NextResponse.redirect(new URL(next, req.url));
    } catch (error) {
        console.error('Keycloak callback error:', error);
        return NextResponse.redirect(
            new URL('/signin?error=callback_failed', req.url)
        );
    }
}
