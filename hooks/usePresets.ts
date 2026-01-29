
import { useState, useEffect } from 'react';
import { PROMPT_PRESETS } from '../constants';

export interface Preset {
    name: string;
    content: string;
    // isCustom property removed as all are treated equally now
}

export const usePresets = () => {
    const [presets, setPresets] = useState<Preset[]>([]);

    useEffect(() => {
        const stored = localStorage.getItem('gemini_user_presets');
        if (stored) {
            try {
                setPresets(JSON.parse(stored));
            } catch (e) {
                // Fallback if JSON fails
                setPresets(PROMPT_PRESETS);
                localStorage.setItem('gemini_user_presets', JSON.stringify(PROMPT_PRESETS));
            }
        } else {
            // First run: load defaults into storage so they can be managed/deleted
            setPresets(PROMPT_PRESETS);
            localStorage.setItem('gemini_user_presets', JSON.stringify(PROMPT_PRESETS));
        }
    }, []);

    const savePreset = (name: string, content: string) => {
        const newPreset: Preset = { name, content };
        // Create copy
        const updatedPresets = [...presets];
        
        // Check if exists
        const existingIndex = updatedPresets.findIndex(p => p.name === name);
        if (existingIndex >= 0) {
            updatedPresets[existingIndex] = newPreset;
        } else {
            updatedPresets.push(newPreset);
        }

        setPresets(updatedPresets);
        localStorage.setItem('gemini_user_presets', JSON.stringify(updatedPresets));
    };

    const deletePreset = (name: string) => {
        const updatedPresets = presets.filter(p => p.name !== name);
        setPresets(updatedPresets);
        localStorage.setItem('gemini_user_presets', JSON.stringify(updatedPresets));
    };

    return { presets, savePreset, deletePreset };
};
