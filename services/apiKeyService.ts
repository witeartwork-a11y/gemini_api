/**
 * Service for managing server-stored API keys.
 * 
 * Keys are stored on the server and never exposed in localStorage.
 * When a user selects a server key, the actual value is fetched 
 * and kept in sessionStorage (cleared when tab closes).
 */

import { ServerApiKey, ApiProvider } from '../types';
import { getCurrentUser } from './authService';
import { apiFetch } from './apiFetch';

const SELECTED_KEY_STORAGE = 'selected_server_key'; // sessionStorage key for selected key ID
const KEY_CACHE_PREFIX = 'server_key_cache_'; // sessionStorage prefix for cached key values

// ============= LIST / FETCH =============

/**
 * Fetch available server API keys for the current user.
 * Admin sees all keys; users see only their assigned enabled keys.
 */
export const getAvailableServerKeys = async (): Promise<ServerApiKey[]> => {
    const user = getCurrentUser();
    const userId = user?.id || '';
    try {
        const res = await apiFetch(`/api/server-keys?userId=${encodeURIComponent(userId)}`);
        if (res.ok) {
            return await res.json();
        }
    } catch (e) {
        console.error('Failed to fetch server keys', e);
    }
    return [];
};

/**
 * Get available server keys filtered by provider.
 */
export const getAvailableKeysByProvider = async (provider: ApiProvider): Promise<ServerApiKey[]> => {
    const all = await getAvailableServerKeys();
    return all.filter(k => k.provider === provider && k.enabled);
};

/**
 * Reveal the actual API key value from the server (authenticated).
 * Caches in sessionStorage.
 */
export const revealServerKey = async (keyId: string): Promise<string | null> => {
    // Check cache first
    const cached = sessionStorage.getItem(KEY_CACHE_PREFIX + keyId);
    if (cached) return cached;

    const user = getCurrentUser();
    const userId = user?.id || '';
    try {
        const res = await apiFetch(`/api/server-keys/${encodeURIComponent(keyId)}/reveal?userId=${encodeURIComponent(userId)}`);
        if (res.ok) {
            const data = await res.json();
            if (data.key) {
                sessionStorage.setItem(KEY_CACHE_PREFIX + keyId, data.key);
                return data.key;
            }
        }
    } catch (e) {
        console.error('Failed to reveal server key', e);
    }
    return null;
};

// ============= SELECTION (USER) =============

/**
 * Get the currently selected server key ID for a given provider.
 */
export const getSelectedServerKeyId = (provider: ApiProvider): string | null => {
    return sessionStorage.getItem(`${SELECTED_KEY_STORAGE}_${provider}`);
};

/**
 * Set the selected server key for a provider.
 * Fetches and caches the actual key value.
 */
export const selectServerKey = async (keyId: string, provider: ApiProvider): Promise<boolean> => {
    const keyValue = await revealServerKey(keyId);
    if (keyValue) {
        sessionStorage.setItem(`${SELECTED_KEY_STORAGE}_${provider}`, keyId);
        return true;
    }
    return false;
};

/**
 * Clear server key selection (revert to manual/own key).
 */
export const clearSelectedServerKey = (provider: ApiProvider) => {
    const oldKeyId = sessionStorage.getItem(`${SELECTED_KEY_STORAGE}_${provider}`);
    sessionStorage.removeItem(`${SELECTED_KEY_STORAGE}_${provider}`);
    if (oldKeyId) {
        sessionStorage.removeItem(KEY_CACHE_PREFIX + oldKeyId);
    }
};

/**
 * Get the resolved API key value for a provider.
 * Returns the server key if one is selected, otherwise null.
 */
export const getResolvedServerKey = (provider: ApiProvider): string | null => {
    const keyId = getSelectedServerKeyId(provider);
    if (!keyId) return null;
    const cached = sessionStorage.getItem(KEY_CACHE_PREFIX + keyId);
    return cached || null;
};

// ============= ADMIN CRUD =============

/**
 * Create or update a server API key (admin only).
 */
export const saveServerKey = async (data: {
    id?: string;
    provider: ApiProvider;
    label: string;
    key?: string; // the actual API key value (required for new, optional for update)
    enabled?: boolean;
    allowedUsers?: string[];
}): Promise<boolean> => {
    const user = getCurrentUser();
    try {
        const res = await apiFetch('/api/server-keys', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...data, userId: user?.id })
        });
        return res.ok;
    } catch (e) {
        console.error('Failed to save server key', e);
        return false;
    }
};

/**
 * Delete a server API key (admin only).
 */
export const deleteServerKey = async (keyId: string): Promise<boolean> => {
    const user = getCurrentUser();
    try {
        const res = await apiFetch(`/api/server-keys/${encodeURIComponent(keyId)}?userId=${encodeURIComponent(user?.id || '')}`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: user?.id })
        });
        return res.ok;
    } catch (e) {
        console.error('Failed to delete server key', e);
        return false;
    }
};

/**
 * Toggle a server API key enabled/disabled (admin only).
 */
export const toggleServerKey = async (keyId: string): Promise<boolean | null> => {
    const user = getCurrentUser();
    try {
        const res = await apiFetch(`/api/server-keys/${encodeURIComponent(keyId)}/toggle`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: user?.id })
        });
        if (res.ok) {
            const data = await res.json();
            return data.enabled;
        }
    } catch (e) {
        console.error('Failed to toggle server key', e);
    }
    return null;
};
