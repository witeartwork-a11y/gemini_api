
import { HarmBlockThreshold, HarmCategory, SafetySetting, MediaResolution, ApiProvider } from "../types";

export type AppTheme = 'default' | 'raspberry' | 'green';

export interface SystemSettings {
    showCreativity: boolean;
    showRepeats: boolean;
    theme: AppTheme;
    language?: 'en' | 'ru';
    newYearMode: boolean;
    safetySettings: SafetySetting[];
    mediaResolution: MediaResolution;
    apiProvider?: ApiProvider; // Google or NeuroAPI
    externalGalleryHiddenUsers: string[];
}

const SETTINGS_KEY = 'wite_ai_system_settings';

const DEFAULT_SAFETY: SafetySetting[] = [
    { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.OFF },
    { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.OFF },
    { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.OFF },
    { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.OFF },
    { category: HarmCategory.HARM_CATEGORY_CIVIC_INTEGRITY, threshold: HarmBlockThreshold.OFF },
];

export const syncSystemSettings = async (): Promise<SystemSettings | null> => {
    try {
        const res = await fetch('/api/system-settings');
        if (res.ok) {
            const remoteSettings = await res.json();
            if (remoteSettings) {
                localStorage.setItem(SETTINGS_KEY, JSON.stringify(remoteSettings));
                // Also save critical settings to cookies for persistence after hard reload
                if (remoteSettings.language) {
                    document.cookie = `app_language=${remoteSettings.language}; max-age=31536000; path=/`;
                }
                if (remoteSettings.theme) {
                    document.cookie = `app_theme=${remoteSettings.theme}; max-age=31536000; path=/`;
                }
                window.dispatchEvent(new Event('system-settings-changed'));
                return remoteSettings;
            }
        }
    } catch (e) {
        console.error("Sync settings failed", e);
    }
    return null;
};

export const getSystemSettings = (): SystemSettings => {
    const stored = localStorage.getItem(SETTINGS_KEY);
    if (stored) {
        try {
            const parsed = JSON.parse(stored);
            // Migration for older settings that might miss new fields
            return {
                showCreativity: true,
                showRepeats: true,
                theme: 'default',
                language: 'en',
                newYearMode: false,
                safetySettings: DEFAULT_SAFETY,
                mediaResolution: MediaResolution.HIGH, // Default to High
                externalGalleryHiddenUsers: [],
                ...parsed
            };
        } catch (e) {
            console.error("Failed to parse settings", e);
        }
    }
    
    // If localStorage is empty (e.g., after hard reload), try to restore from cookies
    const defaults: SystemSettings = { 
        showCreativity: true, 
        showRepeats: true,
        theme: 'default',
        language: 'en',
        newYearMode: false,
        safetySettings: DEFAULT_SAFETY,
        mediaResolution: MediaResolution.HIGH,
        apiProvider: ApiProvider.GOOGLE, // Default to Google
        externalGalleryHiddenUsers: []
    };
    
    // Check cookies for language and theme
    const languageCookie = document.cookie.match(/app_language=(\w+)/);
    if (languageCookie && (languageCookie[1] === 'en' || languageCookie[1] === 'ru')) {
        defaults.language = languageCookie[1] as 'en' | 'ru';
    }
    
    const themeCookie = document.cookie.match(/app_theme=(\w+)/);
    if (themeCookie) {
        defaults.theme = themeCookie[1] as AppTheme;
    }
    
    return defaults;
};

export const saveSystemSettings = async (settings: SystemSettings) => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    // Also save critical settings to cookies for persistence after hard reload
    if (settings.language) {
        document.cookie = `app_language=${settings.language}; max-age=31536000; path=/`;
    }
    if (settings.theme) {
        document.cookie = `app_theme=${settings.theme}; max-age=31536000; path=/`;
    }
    // Dispatch event so components can react immediately if needed (optional optimization)
    window.dispatchEvent(new Event('system-settings-changed'));
    
    try {
        await fetch('/api/system-settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(settings)
        });
    } catch (e) {
        console.error("Failed to save settings to server", e);
    }
};

/**
 * Get current API provider
 */
export const getApiProvider = (): ApiProvider => {
    const settings = getSystemSettings();
    return settings.apiProvider || ApiProvider.GOOGLE;
};

/**
 * Set API provider
 */
export const setApiProvider = async (provider: ApiProvider) => {
    const settings = getSystemSettings();
    settings.apiProvider = provider;
    await saveSystemSettings(settings);
};
