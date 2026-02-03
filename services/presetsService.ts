
import { Preset } from '../hooks/usePresets';

const API_BASE = '/api';

export const presetsService = {
    // Get all presets (public)
    async getAll(): Promise<Preset[]> {
        try {
            const response = await fetch(`${API_BASE}/presets`);
            if (!response.ok) {
                throw new Error('Failed to fetch presets');
            }
            return await response.json();
        } catch (error) {
            console.error('Error fetching presets:', error);
            return [];
        }
    },

    // Save preset (admin only)
    async save(name: string, content: string, userId: string): Promise<{ success: boolean; presets?: Preset[] }> {
        try {
            const response = await fetch(`${API_BASE}/presets`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ name, content, userId }),
            });
            
            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'Failed to save preset');
            }
            
            return await response.json();
        } catch (error) {
            console.error('Error saving preset:', error);
            throw error;
        }
    },

    // Delete preset (admin only)
    async delete(name: string, userId: string): Promise<{ success: boolean; presets?: Preset[] }> {
        try {
            const response = await fetch(`${API_BASE}/presets/${encodeURIComponent(name)}`, {
                method: 'DELETE',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ userId }),
            });
            
            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'Failed to delete preset');
            }
            
            return await response.json();
        } catch (error) {
            console.error('Error deleting preset:', error);
            throw error;
        }
    }
};
