/**
 * Authenticated fetch wrapper for API calls.
 * Automatically adds Authorization header with session token.
 * Handles 401 responses by redirecting to login.
 */

const AUTH_TOKEN_KEY = 'wite_ai_auth_token';

export const getAuthToken = (): string | null => {
    return localStorage.getItem(AUTH_TOKEN_KEY);
};

export const setAuthToken = (token: string) => {
    localStorage.setItem(AUTH_TOKEN_KEY, token);
};

export const clearAuthToken = () => {
    localStorage.removeItem(AUTH_TOKEN_KEY);
};

/**
 * Fetch wrapper that automatically includes the auth token.
 * On 401, clears session and reloads to show login screen.
 */
export const apiFetch = async (url: string, options: RequestInit = {}): Promise<Response> => {
    const token = getAuthToken();
    
    const headers = new Headers(options.headers || {});
    if (token) {
        headers.set('Authorization', `Bearer ${token}`);
    }

    const response = await fetch(url, {
        ...options,
        headers
    });

    // Handle expired/invalid session or missing token
    if (response.status === 401) {
        // Don't auto-redirect for login endpoint itself
        if (!url.includes('/api/login')) {
            clearAuthToken();
            localStorage.removeItem('wite_ai_current_user');
            window.location.reload();
        }
    }

    return response;
};
