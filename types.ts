export enum ApiProvider {
    GOOGLE = 'google',
    NEUROAPI = 'neuroapi'
}

export enum ModelType {
    GEMINI_3_PRO = 'gemini-3-pro-preview',
    GEMINI_3_PRO_IMAGE = 'gemini-3-pro-image-preview',
    GEMINI_3_FLASH = 'gemini-3-flash-preview',
    GEMINI_2_5_FLASH_IMAGE = 'gemini-2.5-flash-image'
}

export enum HarmCategory {
    HARM_CATEGORY_HARASSMENT = 'HARM_CATEGORY_HARASSMENT',
    HARM_CATEGORY_HATE_SPEECH = 'HARM_CATEGORY_HATE_SPEECH',
    HARM_CATEGORY_SEXUALLY_EXPLICIT = 'HARM_CATEGORY_SEXUALLY_EXPLICIT',
    HARM_CATEGORY_DANGEROUS_CONTENT = 'HARM_CATEGORY_DANGEROUS_CONTENT',
    HARM_CATEGORY_CIVIC_INTEGRITY = 'HARM_CATEGORY_CIVIC_INTEGRITY'
}

export enum HarmBlockThreshold {
    HARM_BLOCK_THRESHOLD_UNSPECIFIED = 'HARM_BLOCK_THRESHOLD_UNSPECIFIED',
    BLOCK_LOW_AND_ABOVE = 'BLOCK_LOW_AND_ABOVE',
    BLOCK_MEDIUM_AND_ABOVE = 'BLOCK_MEDIUM_AND_ABOVE',
    BLOCK_ONLY_HIGH = 'BLOCK_ONLY_HIGH',
    BLOCK_NONE = 'BLOCK_NONE',
    OFF = 'OFF' 
}

export enum MediaResolution {
    UNSPECIFIED = 'MEDIA_RESOLUTION_UNSPECIFIED',
    LOW = 'media_resolution_low',
    MEDIUM = 'media_resolution_medium',
    HIGH = 'media_resolution_high'
}

export interface SafetySetting {
    category: HarmCategory;
    threshold: HarmBlockThreshold;
}

export interface ProcessingConfig {
    model: ModelType;
    temperature: number;
    systemPrompt: string;
    userPrompt: string;
    aspectRatio: string;
    resolution: string;
    safetySettings?: SafetySetting[];
}

export interface BatchFile {
    id: string;
    file: File;
    preview: string;
    status: 'pending' | 'processing' | 'completed' | 'failed';
    resultImage?: string; // base64
    resultText?: string;
    error?: string;
}

export interface BatchTextGroup {
    id: string;
    files: File[];
    status: 'pending' | 'processing' | 'completed' | 'failed';
    resultText?: string;
    error?: string;
}

export interface CloudBatchJob {
    id: string; // The resource name (e.g. "corpora/.../batches/...")
    displayId: string; // Short ID for UI
    status: string; // "STATE_UNSPECIFIED" | "PENDING" | "RUNNING" | "SUCCEEDED" | "FAILED" | "CANCELLED"
    createdAt: string; // Display string
    timestamp?: number; // Raw timestamp for aging logic
    updatedAt?: number; // Last local update timestamp (for merge/versioning)
    model: string;
    outputFileUri?: string;
    error?: string;
}

export interface HistoryItem {
    id: string;
    timestamp: number;
    dateStr: string; // YYYY-MM-DD for folder structure simulation
    userId: string;
    type: 'single' | 'batch' | 'cloud';
    model: string;
    prompt: string;
    image?: string; // base64 (Legacy or small previews)
    imageUrl?: string; // URL to fetch image from server
    thumbnailUrl?: string;
    resultText?: string;
    aspectRatio?: string;
    usageMetadata?: {
        promptTokenCount: number;
        candidatesTokenCount: number;
        totalTokenCount: number;
    };
    estimatedCost?: number;
    inputImageInfo?: {
        count: number;
        resolutions?: string[];
    };
    outputResolution?: string;
    provenance?: {
        schema: string;
        workId: string;
        createdAtUtc: string;
        recordedAtUtc: string;
        authorId: string;
        authorName?: string | null;
        model?: string;
        outputResolution?: string | null;
        aspectRatio?: string | null;
        inputImagesCount?: number | null;
        imageSha256?: string | null;
        promptHash?: string | null;
        app?: string;
        recordDigest?: string;
    };
}

export interface ChatMessage {
    id: string;
    role: 'user' | 'model';
    text?: string;
    images?: string[]; // base64 strings
    timestamp: number;
    isError?: boolean;
}

export interface ChatSession {
    id: string;
    title: string;
    messages: ChatMessage[];
    model: ModelType;
    lastUpdated: number;
}

export type TabId = 'single' | 'batch' | 'cloud-batch' | 'gallery' | 'admin';

export type UserRole = 'admin' | 'user';

export interface UserPreferences {
    language?: 'en' | 'ru';
    theme?: 'default' | 'raspberry' | 'green';
    apiProvider?: ApiProvider; // Google Gemini или NeuroAPI
}

export interface User {
    id: string;
    username: string;
    password?: string; // In a real app, this would be hashed. Storing plain for simulation.
    role: UserRole;
    allowedModels: string[]; // 'all' or array of ModelTypes
    preferences?: UserPreferences; // Personal user settings
}
