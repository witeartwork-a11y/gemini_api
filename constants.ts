
import { ModelType, HarmCategory, HarmBlockThreshold, MediaResolution } from "./types";

export const MODELS = [
    // Google Gemini Models
    { value: ModelType.GEMINI_3_PRO, label: '3 Pro', provider: 'google' },
    { value: ModelType.GEMINI_3_PRO_IMAGE, label: '3 Pro image', provider: 'google' },
    { value: ModelType.GEMINI_3_FLASH, label: '3 Flash', provider: 'google' },
    { value: ModelType.GEMINI_2_5_FLASH, label: '2.5 Flash', provider: 'google' },
    { value: ModelType.GEMINI_2_5_FLASH_IMAGE, label: '2.5 Flash image', provider: 'google' },
    
    // NeuroAPI Models
    { value: ModelType.GPT_5_MINI, label: 'GPT-5 Mini', provider: 'neuroapi' },
    { value: ModelType.GPT_5, label: 'GPT-5', provider: 'neuroapi' },
    { value: ModelType.GPT_4O, label: 'GPT-4o', provider: 'neuroapi' },
    { value: ModelType.CLAUDE_3_5_SONNET, label: 'Claude 3.5 Sonnet', provider: 'neuroapi' },
    { value: ModelType.GPT_IMAGE_1, label: 'GPT Image-1', provider: 'neuroapi' },
    { value: ModelType.DALL_E_3, label: 'DALL-E 3', provider: 'neuroapi' },
];

export const MODEL_PRICING: {[key: string]: { input: number, output: number, perImage?: number }} = {
    // Pricing per 1 token
    // Gemini 3 Pro: $2 (Input) / $12 (Output) per 1M tokens (< 200k context)
    [ModelType.GEMINI_3_PRO]: { input: 0.000002, output: 0.000012 }, 
    
    // Gemini 3 Pro Image: $2 (Text Input) / $0.134 per Image
    [ModelType.GEMINI_3_PRO_IMAGE]: { input: 0.000002, output: 0.000012, perImage: 0.134 }, 
    
    // Gemini 3 Flash: $0.50 (Input) / $3 (Output) per 1M tokens
    [ModelType.GEMINI_3_FLASH]: { input: 0.0000005, output: 0.000003 },
    
    // Gemini 2.5: Count tokens only (Cost = 0)
    [ModelType.GEMINI_2_5_FLASH]: { input: 0, output: 0 },
    [ModelType.GEMINI_2_5_FLASH_IMAGE]: { input: 0, output: 0, perImage: 0 },
    
    // NeuroAPI models (pricing may vary, using approximate values)
    [ModelType.GPT_5_MINI]: { input: 0.0000001, output: 0.0000005 },
    [ModelType.GPT_5]: { input: 0.000002, output: 0.00001 },
    [ModelType.GPT_4O]: { input: 0.000005, output: 0.000015 },
    [ModelType.CLAUDE_3_5_SONNET]: { input: 0.000003, output: 0.000015 },
    [ModelType.GPT_IMAGE_1]: { input: 0, output: 0, perImage: 0.04 },
    [ModelType.DALL_E_3]: { input: 0, output: 0, perImage: 0.08 },
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
];

export const RESOLUTIONS = [
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

export const MEDIA_RESOLUTIONS_OPTIONS = [
    { value: MediaResolution.UNSPECIFIED, label: 'Auto (Default)' },
    { value: MediaResolution.LOW, label: 'Low (Faster)' },
    { value: MediaResolution.MEDIUM, label: 'Medium' },
    { value: MediaResolution.HIGH, label: 'High (Best Quality)' },
];
