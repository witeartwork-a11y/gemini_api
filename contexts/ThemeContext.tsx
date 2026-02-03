
import React, { createContext, useContext, useEffect, useState } from 'react';
import { AppTheme, getSystemSettings, saveSystemSettings, syncSystemSettings } from '../services/settingsService';
import { getCurrentUser, getUserPreferences, saveUserPreferences } from '../services/authService';

interface ThemeColors {
    primary: string;
    secondary: string;
    glow: string;
}

const THEMES: Record<AppTheme, ThemeColors> = {
    default: {
        primary: '#2563eb', // blue-600
        secondary: '#9333ea', // purple-600
        glow: 'rgba(37, 99, 235, 0.5)'
    },
    raspberry: {
        primary: '#db2777', // pink-600
        secondary: '#e11d48', // rose-600
        glow: 'rgba(219, 39, 119, 0.5)'
    },
    green: {
        primary: '#059669', // emerald-600
        secondary: '#0d9488', // teal-600
        glow: 'rgba(5, 150, 105, 0.5)'
    }
};

interface ThemeContextType {
    theme: AppTheme;
    setTheme: (theme: AppTheme) => void;
    newYearMode: boolean;
    setNewYearMode: (enabled: boolean) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [settings, setSettings] = useState(getSystemSettings());
    const [theme, setThemeState] = useState<AppTheme>(settings.theme || 'default');
    const [newYearMode, setNewYearModeState] = useState<boolean>(settings.newYearMode || false);

    // Load settings from user preferences or system settings
    useEffect(() => {
        const loadSettings = async () => {
            const currentUser = getCurrentUser();
            
            // If user is logged in, load their personal preferences
            if (currentUser) {
                try {
                    const prefs = await getUserPreferences(currentUser.id);
                    if (prefs.theme) {
                        setThemeState(prefs.theme);
                        applyTheme(prefs.theme);
                    }
                } catch (e) {
                    console.error('Failed to load user theme preference', e);
                }
            }
            
            // Also sync system settings
            const remoteSettings = await syncSystemSettings();
            if (remoteSettings && !currentUser) {
                // Only use system settings if user is not logged in
                setSettings(remoteSettings);
            }
        };
        loadSettings();
    }, []);

    // Sync state with settings file logic
    useEffect(() => {
        setThemeState(settings.theme || 'default');
        setNewYearModeState(settings.newYearMode || false);
    }, [settings]);

    const setTheme = (newTheme: AppTheme) => {
        setThemeState(newTheme);
        const currentUser = getCurrentUser();
        
        // Save to user preferences if logged in
        if (currentUser) {
            saveUserPreferences(currentUser.id, { theme: newTheme })
                .catch(e => console.error('Failed to save user theme preference', e));
        }
        
        // Also save to system settings
        const newSettings = { ...getSystemSettings(), theme: newTheme };
        saveSystemSettings(newSettings);
        applyTheme(newTheme);
    };

    const setNewYearMode = (enabled: boolean) => {
        setNewYearModeState(enabled);
        const newSettings = { ...getSystemSettings(), newYearMode: enabled };
        saveSystemSettings(newSettings);
    };

    const applyTheme = (currentTheme: AppTheme) => {
        const colors = THEMES[currentTheme];
        const root = document.documentElement;
        root.style.setProperty('--theme-primary', colors.primary);
        root.style.setProperty('--theme-secondary', colors.secondary);
        root.style.setProperty('--theme-glow', colors.glow);
    };

    // Apply classes to Body
    useEffect(() => {
        applyTheme(theme);
        
        if (newYearMode) {
            document.body.classList.add('new-year-mode');
        } else {
            document.body.classList.remove('new-year-mode');
        }
    }, [theme, newYearMode]);

    return (
        <ThemeContext.Provider value={{ theme, setTheme, newYearMode, setNewYearMode }}>
            {children}
            {newYearMode && <Snowfall />}
        </ThemeContext.Provider>
    );
};

const Snowfall: React.FC = () => {
    return (
        <div className="fixed inset-0 pointer-events-none z-[1]" aria-hidden="true">
            {[...Array(50)].map((_, i) => (
                <div key={i} className="snowflake">
                    ❅
                </div>
            ))}
        </div>
    );
};

export const useTheme = () => {
    const context = useContext(ThemeContext);
    if (!context) {
        throw new Error('useTheme must be used within a ThemeProvider');
    }
    return context;
};
