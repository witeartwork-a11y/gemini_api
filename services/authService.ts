import { User, ModelType } from "../types";
import { apiFetch, setAuthToken, clearAuthToken } from "./apiFetch";

const USERS_KEY = 'wite_ai_users';
const CURRENT_USER_KEY = 'wite_ai_current_user';
const SAVED_ACCOUNTS_KEY = 'wite_ai_saved_accounts';
const RETURN_ACCOUNT_KEY = 'wite_ai_return_account';

const normalizeUsersPayload = (payload: unknown): User[] => {
    if (Array.isArray(payload)) {
        return payload;
    }

    if (payload && typeof payload === 'object') {
        return [payload as User];
    }

    return [];
};

// SHA256 hash helper (used as pre-hash before server-side PBKDF2)
export const sha256 = async (message: string): Promise<string> => {
    const msgBuffer = new TextEncoder().encode(message);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
};

// 2.5: No hardcoded password — admin must be set via env var or users.json
const getDefaultAdmin = (): User => {
    const passwordHash = import.meta.env.VITE_ADMIN_PASSWORD_HASH;
    if (!passwordHash) {
        console.warn('VITE_ADMIN_PASSWORD_HASH not set. Default admin will not be created on client side.');
    }
    return {
        id: 'admin',
        username: import.meta.env.VITE_ADMIN_USERNAME || 'admin',
        password: passwordHash || '',
        role: 'admin',
        allowedModels: ['all']
    };
};

export const initializeUsers = async () => {
    // With server auth, initialization is handled server-side
    // This is kept for backward compatibility but doesn't fetch users list anymore
};

export const getUsers = async (): Promise<User[]> => {
    try {
        const res = await apiFetch('/api/users');
        if (res.ok) {
            const users = normalizeUsersPayload(await res.json());
            localStorage.setItem(USERS_KEY, JSON.stringify(users));
            return users;
        }
    } catch (e) {}
    return normalizeUsersPayload(JSON.parse(localStorage.getItem(USERS_KEY) || '[]'));
};

export const saveUser = async (user: User) => {
    await apiFetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(user)
    });
    await getUsers();
};

export const deleteUser = async (id: string) => {
    if (id === 'admin') throw new Error("Cannot delete root admin");
    
    await apiFetch(`/api/users/${id}`, {
        method: 'DELETE'
    });
    await getUsers();
};

export const login = async (username: string, password: string): Promise<User | null> => {
    const passwordHash = await sha256(password);
    
    try {
        // Login endpoint doesn't require auth token (public)
        const response = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                username, 
                password: passwordHash 
            })
        });
        
        if (response.ok) {
            const data = await response.json();
            if (data.success && data.user) {
                // 2.2: Store session token
                if (data.token) {
                    setAuthToken(data.token);
                }
                const sessionUser = data.user;
                localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(sessionUser));
                addSavedAccount(data.user);
                return sessionUser;
            }
        }
    } catch (e) {
        console.error("Login failed", e);
    }
    
    return null;
};

export const logout = () => {
    // Notify server to invalidate session
    apiFetch('/api/logout', { method: 'POST' }).catch(() => {});
    clearAuthToken();
    localStorage.removeItem(CURRENT_USER_KEY);
    localStorage.removeItem(RETURN_ACCOUNT_KEY);
    window.location.reload();
};

export const logoutForAccountSwitch = () => {
    const current = getCurrentUser();
    if (current) {
        localStorage.setItem(RETURN_ACCOUNT_KEY, current.id);
    }
    // Clear auth but don't invalidate token yet (need it for re-login)
    clearAuthToken();
    localStorage.removeItem(CURRENT_USER_KEY);
    window.location.reload();
};

export const getReturnAccountId = (): string | null => {
    return localStorage.getItem(RETURN_ACCOUNT_KEY);
};

export const clearReturnAccount = () => {
    localStorage.removeItem(RETURN_ACCOUNT_KEY);
};

// ============= MULTI-ACCOUNT SWITCHING =============

export interface SavedAccount {
    id: string;
    username: string;
    role: string;
}

export const getSavedAccounts = (): SavedAccount[] => {
    try {
        const stored = localStorage.getItem(SAVED_ACCOUNTS_KEY);
        return stored ? JSON.parse(stored) : [];
    } catch {
        return [];
    }
};

export const addSavedAccount = (user: User) => {
    const accounts = getSavedAccounts();
    const exists = accounts.find(a => a.id === user.id);
    if (!exists) {
        accounts.push({ id: user.id, username: user.username, role: user.role });
        localStorage.setItem(SAVED_ACCOUNTS_KEY, JSON.stringify(accounts));
    } else if (exists.username !== user.username || exists.role !== user.role) {
        exists.username = user.username;
        exists.role = user.role;
        localStorage.setItem(SAVED_ACCOUNTS_KEY, JSON.stringify(accounts));
    }
};

export const removeSavedAccount = (accountId: string) => {
    const accounts = getSavedAccounts().filter(a => a.id !== accountId);
    localStorage.setItem(SAVED_ACCOUNTS_KEY, JSON.stringify(accounts));
};

// 2.8: switchAccount now requires password (re-login through server)
export const switchAccount = async (accountId: string, password?: string): Promise<boolean> => {
    try {
        // Check if this is "return to admin" case
        const returnId = getReturnAccountId();
        
        if (returnId && returnId === accountId && password) {
            // Re-login as the target user
            const accounts = getSavedAccounts();
            const account = accounts.find(a => a.id === accountId);
            if (!account) {
                removeSavedAccount(accountId);
                return false;
            }
            
            const user = await login(account.username, password);
            if (user) {
                clearReturnAccount();
                return true;
            }
            return false;
        }
        
        if (!password) return false;
        
        // Normal switch: need to login as target user
        const accounts = getSavedAccounts();
        const account = accounts.find(a => a.id === accountId);
        if (!account) {
            removeSavedAccount(accountId);
            return false;
        }
        
        const user = await login(account.username, password);
        return !!user;
    } catch (e) {
        console.error('Switch account failed', e);
        return false;
    }
};

export const getCurrentUser = (): User | null => {
    const stored = localStorage.getItem(CURRENT_USER_KEY);
    return stored ? JSON.parse(stored) : null;
};

export const isModelAllowed = (user: User, model: string): boolean => {
    if (user.role === 'admin') return true;
    if (user.allowedModels.includes('all')) return true;
    return user.allowedModels.includes(model);
};

// ============= USER PREFERENCES =============

export const getUserPreferences = async (userId: string) => {
    try {
        const res = await apiFetch(`/api/user-preferences/${userId}`);
        if (res.ok) {
            return await res.json();
        }
    } catch (e) {
        console.error('Failed to get user preferences', e);
    }
    return {};
};

export const saveUserPreferences = async (userId: string, preferences: any) => {
    try {
        const res = await apiFetch(`/api/user-preferences/${userId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(preferences)
        });
        if (res.ok) {
            return await res.json();
        }
    } catch (e) {
        console.error('Failed to save user preferences', e);
    }
    return null;
};
