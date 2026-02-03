import { User, ModelType } from "../types";

const USERS_KEY = 'wite_ai_users';
const CURRENT_USER_KEY = 'wite_ai_current_user';

// SHA256 hash helper
export const sha256 = async (message: string): Promise<string> => {
    const msgBuffer = new TextEncoder().encode(message);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
};

// Default Admin from environment or fallback
const getDefaultAdmin = (): User => ({
    id: 'admin',
    username: import.meta.env.VITE_ADMIN_USERNAME || 'admin',
    password: import.meta.env.VITE_ADMIN_PASSWORD_HASH || '616ea71bb9c038037d25a7740b77bfe9b9f740ebaea4b4f735c70b044ad5942a', // hash of 'naumi'
    role: 'admin',
    allowedModels: ['all']
});

export const initializeUsers = async () => {
    try {
        const res = await fetch('/api/users');
        if (res.ok) {
            const users = await res.json();
            if (users.length === 0) {
                 // Initialize default admin on server if empty
                 const defaultAdmin = getDefaultAdmin();
                 await saveUser(defaultAdmin);
            } else {
                 localStorage.setItem(USERS_KEY, JSON.stringify(users));
            }
        }
    } catch (e) {
        console.error("Failed to init users from server", e);
    }
};

export const getUsers = async (): Promise<User[]> => {
    try {
        const res = await fetch('/api/users');
        if (res.ok) {
            const users = await res.json();
            localStorage.setItem(USERS_KEY, JSON.stringify(users)); // Sync cache
            return users;
        }
    } catch (e) {}
    return JSON.parse(localStorage.getItem(USERS_KEY) || '[]');
};

export const saveUser = async (user: User) => {
    // Send to server
    await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(user)
    });
    
    // Refresh cache
    await getUsers();
};

export const deleteUser = async (id: string) => {
    if (id === 'admin') throw new Error("Cannot delete root admin");
    
    await fetch(`/api/users/${id}`, {
        method: 'DELETE'
    });
    
    // Refresh cache
    await getUsers();
};

export const login = async (username: string, password: string): Promise<User | null> => {
    // Ensure users are initialized (creates default admin if needed)
    await initializeUsers();
    
    const passwordHash = await sha256(password);
    
    try {
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
                const sessionUser = data.user;
                localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(sessionUser));
                return sessionUser;
            }
        }
    } catch (e) {
        console.error("Login failed", e);
    }
    
    return null;
};

export const logout = () => {
    localStorage.removeItem(CURRENT_USER_KEY);
    window.location.reload();
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
        const res = await fetch(`/api/user-preferences/${userId}`);
        if (res.ok) {
            return await res.json();
        }
    } catch (e) {
        console.error('Failed to get user preferences', e);
    }
    return { language: 'en', theme: 'default' };
};

export const saveUserPreferences = async (userId: string, preferences: any) => {
    try {
        const res = await fetch(`/api/user-preferences/${userId}`, {
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
