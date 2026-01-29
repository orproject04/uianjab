// src/lib/keycloak.ts

export interface KeycloakConfig {
    url: string;
    realm: string;
    clientId: string;
    clientSecret: string;
    redirectUri: string;
}

export function getKeycloakConfig(): KeycloakConfig {
    return {
        url: process.env.KEYCLOAK_URL || 'https://ssoaws.duckdns.org',
        realm: process.env.KEYCLOAK_REALM || 'master',
        clientId: process.env.KEYCLOAK_CLIENT_ID || 'pandawa',
        clientSecret: process.env.KEYCLOAK_CLIENT_SECRET || '',
        redirectUri: process.env.KEYCLOAK_REDIRECT_URI || 
            `${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/auth/callback`,
    };
}

/**
 * Retry fetch dengan exponential backoff untuk handle DNS intermittent issues
 */
async function fetchWithRetry(
    url: string, 
    options: RequestInit, 
    maxRetries: number = 3
): Promise<Response> {
    let lastError: Error | null = null;
    
    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            const response = await fetch(url, options);
            return response;
        } catch (error) {
            lastError = error as Error;
            console.warn(`Fetch attempt ${attempt + 1}/${maxRetries} failed:`, error);
            
            // Jika bukan retry terakhir, tunggu sebelum retry
            if (attempt < maxRetries - 1) {
                // Exponential backoff: 500ms, 1000ms, 2000ms
                const delay = 500 * Math.pow(2, attempt);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
    }
    
    throw lastError || new Error('Fetch failed after retries');
}

export function getKeycloakAuthUrl(config: KeycloakConfig, state: string, codeChallenge: string): string {
    const params = new URLSearchParams({
        client_id: config.clientId,
        redirect_uri: config.redirectUri,
        response_type: 'code',
        scope: 'openid email profile',
        state: state,
        code_challenge: codeChallenge,
        code_challenge_method: 'S256',
    });

    return `${config.url}/realms/${config.realm}/protocol/openid-connect/auth?${params.toString()}`;
}

export async function exchangeCodeForToken(
    config: KeycloakConfig,
    code: string,
    codeVerifier: string
): Promise<any> {
    const tokenUrl = `${config.url}/realms/${config.realm}/protocol/openid-connect/token`;
    
    const body = new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: config.clientId,
        client_secret: config.clientSecret,
        code: code,
        redirect_uri: config.redirectUri,
        code_verifier: codeVerifier,
    });

    const response = await fetchWithRetry(tokenUrl, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: body.toString(),
    });

    if (!response.ok) {
        const error = await response.text();
        console.error('Token exchange failed:', error);
        throw new Error(`Token exchange failed: ${response.status}`);
    }

    return response.json();
}

export async function getUserInfo(config: KeycloakConfig, accessToken: string): Promise<any> {
    const userInfoUrl = `${config.url}/realms/${config.realm}/protocol/openid-connect/userinfo`;
    
    const response = await fetchWithRetry(userInfoUrl, {
        headers: {
            'Authorization': `Bearer ${accessToken}`,
        },
    });

    if (!response.ok) {
        const error = await response.text();
        console.error('Get user info failed:', error);
        throw new Error(`Get user info failed: ${response.status}`);
    }

    return response.json();
}
