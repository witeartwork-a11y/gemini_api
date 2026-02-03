
import { useState, useEffect } from 'react';
import { presetsService } from '../services/presetsService';

export interface Preset {
    name: string;
    content: string;
}

export const usePresets = (userId?: string) => {
    const [presets, setPresets] = useState<Preset[]>([]);
    const [loading, setLoading] = useState(true);

    const loadPresets = async () => {
        setLoading(true);
        try {
            const data = await presetsService.getAll();
            setPresets(data);
        } catch (error) {
            console.error('Failed to load presets:', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadPresets();
    }, []);

    const savePreset = async (name: string, content: string) => {
        if (!userId) {
            throw new Error('User ID required to save preset');
        }

        try {
            const result = await presetsService.save(name, content, userId);
            if (result.success && result.presets) {
                setPresets(result.presets);
            }
        } catch (error) {
            console.error('Failed to save preset:', error);
            throw error;
        }
    };

    const deletePreset = async (name: string) => {
        if (!userId) {
            throw new Error('User ID required to delete preset');
        }

        try {
            const result = await presetsService.delete(name, userId);
            if (result.success && result.presets) {
                setPresets(result.presets);
            }
        } catch (error) {
            console.error('Failed to delete preset:', error);
            throw error;
        }
    };

    return { presets, savePreset, deletePreset, loading, refreshPresets: loadPresets };
};
