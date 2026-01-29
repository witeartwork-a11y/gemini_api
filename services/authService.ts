import { User, ModelType } from "../types";

const USERS_KEY = 'wite_ai_users';
const CURRENT_USER_KEY = 'wite_ai_current_user';

// Default Admin
const DEFAULT_ADMIN: User = {
    id: 'admin',
    username: 'admin',
    password: '123',
    role: 'admin',
    allowedModels: ['all']
};

export const initializeUsers = () => {
    const stored = localStorage.getItem(USERS_KEY);
    if (!stored) {
        localStorage.setItem(USERS_KEY, JSON.stringify([DEFAULT_ADMIN]));
    }
};

export const getUsers = (): User[] => {
    initializeUsers();
    return JSON.parse(localStorage.getItem(USERS_KEY) || '[]');
};

export const saveUser = (user: User) => {
    const users = getUsers();
    const existing = users.findIndex(u => u.id === user.id);
    if (existing >= 0) {
        users[existing] = user;
    } else {
        users.push(user);
    }
    localStorage.setItem(USERS_KEY, JSON.stringify(users));
};

export const deleteUser = (id: string) => {
    if (id === 'admin') throw new Error("Cannot delete root admin");
    const users = getUsers().filter(u => u.id !== id);
    localStorage.setItem(USERS_KEY, JSON.stringify(users));
};

export const login = (username: string, password: string): User | null => {
    const users = getUsers();
    const user = users.find(u => u.username === username && u.password === password);
    if (user) {
        // Store session (exclude password from session storage)
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
