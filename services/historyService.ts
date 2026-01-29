
import { HistoryItem } from "../types";

// Use relative URL for both dev and production
const API_URL = '/api';

export const saveGeneration = async (
    userId: string,
    type: 'single' | 'batch' | 'cloud',
    model: string,
    prompt: string,
    image?: string,
    text?: string,
    aspectRatio?: string
): Promise<void> => {
    try {
        const payload = {
            userId,
            type,
            model,
            prompt,
            image,
            text,
            aspectRatio,
            timestamp: Date.now()
        };

        const response = await fetch(`${API_URL}/save`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
        });

        if (!response.ok) {
            throw new Error(`Server error: ${response.statusText}`);
        }
    } catch (error) {
        console.error("Failed to save generation to server:", error);
        // Fallback or silent fail - UI should probably notify, but keeping interface clean for now
    }
};

export const getUserHistory = async (userId: string, dateFilter?: string): Promise<HistoryItem[]> => {
    try {
        const response = await fetch(`${API_URL}/history/${userId}${dateFilter ? `?date=${dateFilter}` : ''}`);
        
        if (!response.ok) {
            console.warn("Server unavailable, returning empty history");
            return [];
        }

        let items: HistoryItem[] = await response.json();
        return items;
    } catch (error) {
        console.error("Failed to fetch history:", error);
        return [];
    }
};

export const deleteGeneration = async (userId: string, itemId: string): Promise<boolean> => {
    try {
        const response = await fetch(`${API_URL}/history/${userId}/${itemId}`, {
            method: 'DELETE'
        });
        return response.ok;
    } catch (error) {
        console.error("Failed to delete item:", error);
        return false;
    }
};

// Functions below kept for compatibility but effectively disabled or redirected
export const getAllHistory = async (): Promise<HistoryItem[]> => {
    return [];
};
export const getHistory = async () => [];
export const saveHistoryItem = async (item: any) => [];
export const clearHistory = async () => {};
export const deleteHistoryItem = async (id: string) => [];
