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
    const users = await getUsers();
    const existingIndex = users.findIndex(u => u.id === user.id);
    
    if (existingIndex >= 0) {
        users[existingIndex] = user;
    } else {
        users.push(user);
    }
    
    // Optimistic update
    localStorage.setItem(USERS_KEY, JSON.stringify(users));
    
    await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(users)
    });
};

export const deleteUser = async (id: string) => {
    if (id === 'admin') throw new Error("Cannot delete root admin");
    const users = (await getUsers()).filter(u => u.id !== id);
    
    localStorage.setItem(USERS_KEY, JSON.stringify(users));
    
    await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(users)
    });
};

export const login = async (username: string, password: string): Promise<User | null> => {
    // Ensure users are initialized
    await initializeUsers();
    
    let users = await getUsers();
    
    // If no users exist, create default admin
    if (users.length === 0) {
        const defaultAdmin = getDefaultAdmin();
        await saveUser(defaultAdmin);
        users = [defaultAdmin];
    }
    
    const passwordHash = await sha256(password);
    // Case-insensitive username comparison
    const user = users.find(u => u.username.toLowerCase() === username.toLowerCase() && u.password === passwordHash);
    if (user) {
        // Store session 
        const sessionUser = { ...user };
        delete sessionUser.password;
        localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(sessionUser));
        return sessionUser;
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
