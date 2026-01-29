
import { HarmBlockThreshold, HarmCategory, SafetySetting, MediaResolution } from "../types";

export type AppTheme = 'default' | 'raspberry' | 'green';

export interface SystemSettings {
    showCreativity: boolean;
    showRepeats: boolean;
    theme: AppTheme;
    newYearMode: boolean;
    safetySettings: SafetySetting[];
    mediaResolution: MediaResolution;
}

const SETTINGS_KEY = 'wite_ai_system_settings';

const DEFAULT_SAFETY: SafetySetting[] = [
    { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.OFF },
    { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.OFF },
    { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.OFF },
    { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.OFF },
    { category: HarmCategory.HARM_CATEGORY_CIVIC_INTEGRITY, threshold: HarmBlockThreshold.OFF },
];

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
                newYearMode: false,
                safetySettings: DEFAULT_SAFETY,
                mediaResolution: MediaResolution.HIGH, // Default to High
                ...parsed
            };
        } catch (e) {
            console.error("Failed to parse settings", e);
        }
    }
    // Defaults
    return { 
        showCreativity: true, 
        showRepeats: true,
        theme: 'default',
        newYearMode: false,
        safetySettings: DEFAULT_SAFETY,
        mediaResolution: MediaResolution.HIGH // Default to High
    };
};

export const saveSystemSettings = (settings: SystemSettings) => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    // Dispatch event so components can react immediately if needed (optional optimization)
    window.dispatchEvent(new Event('system-settings-changed'));
};
