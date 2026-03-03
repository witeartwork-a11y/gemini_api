
import { ModelType, HarmCategory, HarmBlockThreshold, MediaResolution } from "./types";

export const MODELS = [
    { value: ModelType.GEMINI_3_PRO, label: '3 Pro ⚠️ deprecated', provider: 'google' },
    { value: ModelType.GEMINI_3_PRO_IMAGE, label: '3 Pro Image (Nano Banana Pro)', provider: 'google' },
    { value: ModelType.GEMINI_3_1_FLASH_IMAGE, label: '3.1 Flash Image (Nano Banana 2)', provider: 'google' },
    { value: ModelType.GEMINI_3_FLASH, label: '3 Flash', provider: 'google' },
    { value: ModelType.GEMINI_2_5_FLASH_IMAGE, label: '2.5 Flash Image (Nano Banana)', provider: 'google' },
];

export const MODEL_PRICING: {[key: string]: { input: number, output: number, perImage?: number, perImageByResolution?: {[res: string]: number} }} = {
    // Pricing per 1 token (Standard API)
    // Gemini 3 Pro: $2 / $12 per 1M tokens — DEPRECATED Mar 9 2026
    [ModelType.GEMINI_3_PRO]: { input: 0.000002, output: 0.000012 }, 
    
    // Gemini 3 Pro Image (Nano Banana Pro): $2 input, $12 text output, $120/1M image output tokens
    // 1K/2K = 1120 tokens = $0.134, 4K = 2000 tokens = $0.24
    [ModelType.GEMINI_3_PRO_IMAGE]: { input: 0.000002, output: 0.000012, perImage: 0.134,
        perImageByResolution: { '1K': 0.134, '2K': 0.134, '4K': 0.24 }
    }, 
    
    // Gemini 3.1 Flash Image (Nano Banana 2): $0.50 input, $3 text output, $60/1M image output tokens
    // 512px = 747 tokens = $0.045, 1K = 1120 = $0.067, 2K = 1680 = $0.101, 4K = 2520 = $0.151
    [ModelType.GEMINI_3_1_FLASH_IMAGE]: { input: 0.0000005, output: 0.000003, perImage: 0.067,
        perImageByResolution: { '512px': 0.045, '1K': 0.067, '2K': 0.101, '4K': 0.151 }
    },
    
    // Gemini 3 Flash: $0.50 (Input) / $3 (Output) per 1M tokens
    [ModelType.GEMINI_3_FLASH]: { input: 0.0000005, output: 0.000003 },
    
    // Gemini 2.5 Flash Image (Nano Banana): $0.30 input, $30/1M image output = $0.039/image (1290 tokens)
    [ModelType.GEMINI_2_5_FLASH_IMAGE]: { input: 0.0000003, output: 0.000003, perImage: 0.039 },
};

export const ASPECT_RATIOS = [
    { value: 'Auto', label: 'Auto' },
    { value: '1:1', label: '1:1 (Square)' },
    { value: '9:16', label: '9:16 (Portrait Mobile)' },
    { value: '16:9', label: '16:9 (Landscape)' },
    { value: '3:4', label: '3:4 (Portrait Standard)' },
    { value: '4:3', label: '4:3 (Landscape Standard)' },
    { value: '3:2', label: '3:2 (Classic Photo)' },
    { value: '2:3', label: '2:3 (Portrait Photo)' },
    { value: '5:4', label: '5:4 (Print)' },
    { value: '4:5', label: '4:5 (Instagram)' },
    { value: '21:9', label: '21:9 (Cinematic)' },
    { value: '1:4', label: '1:4 (Tall Vertical)' },
    { value: '4:1', label: '4:1 (Wide Horizontal)' },
    { value: '1:8', label: '1:8 (Ultra Tall)' },
    { value: '8:1', label: '8:1 (Ultra Wide)' },
];

export const RESOLUTIONS = [
    { value: '512px', label: '512px (0.5K)' },
    { value: '1K', label: '1K (1024x1024)' },
    { value: '2K', label: '2K (2048x2048)' },
    { value: '4K', label: '4K (4096x4096)' },
];

export const SAFETY_CATEGORIES = [
    { value: HarmCategory.HARM_CATEGORY_HARASSMENT, label: 'Harassment' },
    { value: HarmCategory.HARM_CATEGORY_HATE_SPEECH, label: 'Hate Speech' },
    { value: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, label: 'Sexually Explicit' },
    { value: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, label: 'Dangerous Content' },
    { value: HarmCategory.HARM_CATEGORY_CIVIC_INTEGRITY, label: 'Civic Integrity' },
];

export const SAFETY_THRESHOLDS = [
    { value: HarmBlockThreshold.OFF, label: 'Off (Allowed)' },
    { value: HarmBlockThreshold.BLOCK_NONE, label: 'Block None' },
    { value: HarmBlockThreshold.BLOCK_ONLY_HIGH, label: 'Block Few' },
    { value: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE, label: 'Block Some' },
    { value: HarmBlockThreshold.BLOCK_LOW_AND_ABOVE, label: 'Block Most' },
    { value: HarmBlockThreshold.HARM_BLOCK_THRESHOLD_UNSPECIFIED, label: 'Default' },
];

// Batch API is priced at 50% of the standard interactive API cost
export const BATCH_PRICING_MULTIPLIER = 0.5;

// Model-specific capabilities (aspect ratios & resolutions)
// Extended ratios 1:4, 4:1, 1:8, 8:1 only supported by 3.1 Flash Image
// 512px resolution only supported by 3.1 Flash Image
// 2.5 Flash Image only supports 1K resolution
const FLASH_31_ONLY_RATIOS = ['1:4', '4:1', '1:8', '8:1'];

export const getAvailableResolutions = (model: ModelType) => {
    if (model === ModelType.GEMINI_2_5_FLASH_IMAGE) {
        return RESOLUTIONS.filter(r => r.value === '1K');
    }
    if (model === ModelType.GEMINI_3_1_FLASH_IMAGE) {
        return RESOLUTIONS; // all including 512px
    }
    // Pro Image: 1K, 2K, 4K (no 512px)
    return RESOLUTIONS.filter(r => r.value !== '512px');
};

export const getAvailableAspectRatios = (model: ModelType) => {
    if (model === ModelType.GEMINI_3_1_FLASH_IMAGE) {
        return ASPECT_RATIOS; // all ratios
    }
    // Other models: exclude 1:4, 4:1, 1:8, 8:1
    return ASPECT_RATIOS.filter(r => !FLASH_31_ONLY_RATIOS.includes(r.value));
};

export const MEDIA_RESOLUTIONS_OPTIONS = [
    { value: MediaResolution.UNSPECIFIED, label: 'Auto (Default)' },
    { value: MediaResolution.LOW, label: 'Low (Faster)' },
    { value: MediaResolution.MEDIUM, label: 'Medium' },
    { value: MediaResolution.HIGH, label: 'High (Best Quality)' },
];
