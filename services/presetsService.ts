
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
            // Use query param for name AND userId (some servers strip body on DELETE)
            const params = new URLSearchParams({
                name: name,
                userId: userId
            });
            
            const response = await fetch(`${API_BASE}/presets?${params.toString()}`, {
                method: 'DELETE',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ userId }), // Keep body for standard compliance
            });
            
            if (!response.ok) {
                // Try to parse JSON, but handle HTML errors (404/500) gracefully
                let errorMessage = 'Failed to delete preset';
                try {
                    const error = await response.json();
                    errorMessage = error.error || errorMessage;
                } catch (e) {
                    const text = await response.text();
                    console.error('Server returned non-JSON error:', text);
                    errorMessage = `Server Error (${response.status}): Check console for details`;
                }
                throw new Error(errorMessage);
            }
            
            return await response.json();
        } catch (error) {
            console.error('Error deleting preset:', error);
            throw error;
        }
    }
};
