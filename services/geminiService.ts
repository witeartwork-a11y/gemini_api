
import { GoogleGenAI } from "@google/genai";
import { ProcessingConfig, ModelType, ChatMessage, ApiProvider } from "../types";
import * as neuroApiService from "./neuroApiService";
import { getApiProvider } from "./settingsService";
import { getCurrentUser } from "./authService";

export interface ImageProofMetadata {
    prompt?: string;
    model?: string;
    resolution?: string;
    aspectRatio?: string;
    inputImagesCount?: number;
    createdAt?: number | string;
    authorId?: string;
    authorName?: string;
    copyrightNotice?: string;
}

const getApiKey = (): string => {
    let key = localStorage.getItem("gemini_api_key");
    if (!key) {
        try {
            key = process.env.API_KEY;
        } catch (e) {}
    }
    if (!key) {
        throw new Error("API Key is missing. Please set it in Settings.");
    }
    return key.replace(/[^\x20-\x7E]/g, '').trim();
};

export const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => {
            const result = reader.result as string;
            const base64Data = result.split(',')[1];
            resolve(base64Data);
        };
        reader.onerror = error => reject(error);
    });
};

export const fileToText = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsText(file);
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = error => reject(error);
    });
};

export const downloadTextFile = (text: string, filename: string) => {
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
};

export const generateContent = async (
    config: ProcessingConfig,
    imageFiles: File[],
    textFilesData?: { name: string, content: string }[],
    signal?: AbortSignal
) => {
    // Route to appropriate provider
    const provider = getApiProvider();
    
    if (provider === ApiProvider.NEUROAPI) {
        return await neuroApiService.generateContent(config, imageFiles, textFilesData, signal);
    }
    
    // Default: Google Gemini
    return await generateContentGoogle(config, imageFiles, textFilesData, signal);
};

const generateContentGoogle = async (
    config: ProcessingConfig,
    imageFiles: File[],
    textFilesData?: { name: string, content: string }[],
    signal?: AbortSignal
) => {
    try {
        const apiKey = getApiKey();
        const ai = new GoogleGenAI({ apiKey });
        
        // ... (check abort)
        if (signal?.aborted) {
            throw new Error("Aborted");
        }
        
        const parts: any[] = [];
        const isProImageModel = config.model === ModelType.GEMINI_3_PRO_IMAGE;
        const isImageModel = config.model.includes('image');

        // Prompt Logic
        let finalPrompt = config.userPrompt || '';
        if (isImageModel && config.systemPrompt) {
            finalPrompt = `${config.systemPrompt}\n\n${finalPrompt}`.trim();
        }

        if (finalPrompt) {
            parts.push({ text: finalPrompt });
        }

        // Process Input Text Files (CSV/TXT etc)
        if (textFilesData && textFilesData.length > 0) {
            for (const textFile of textFilesData) {
                // Formatting the text file context for the model
                parts.push({
                    text: `\n--- START OF FILE: ${textFile.name} ---\n${textFile.content}\n--- END OF FILE ---\n`
                });
            }
        }

        // Process all input images
        if (imageFiles && imageFiles.length > 0) {
            for (const file of imageFiles) {
                const base64Data = await fileToBase64(file);
                parts.push({
                    inlineData: {
                        mimeType: file.type,
                        data: base64Data
                    }
                });
            }
        }

        // Configuration
        const generateConfig: any = {};

        if (isImageModel) {
            generateConfig.imageConfig = {};
            
            if (config.aspectRatio && config.aspectRatio !== 'Auto') {
                 generateConfig.imageConfig.aspectRatio = config.aspectRatio;
            }
             
            if (isProImageModel && config.resolution) {
                 generateConfig.imageConfig.imageSize = config.resolution;
            }
            
            if (isProImageModel) {
                 // Try enabling image modalities for Pro model too
                 generateConfig.responseModalities = ['TEXT', 'IMAGE'];
                 // Some versions might need explicit imagen tool or just the modality
                 // generateConfig.tools = [{ googleSearch: {} }]; 
            } else {
                 // ONLY set this for Image models, not generic text models
                 generateConfig.responseModalities = ['TEXT', 'IMAGE'];
                 if (config.temperature !== undefined) {
                    generateConfig.temperature = config.temperature;
                 }
            }
        } else {
            if (config.temperature !== undefined) {
                generateConfig.temperature = config.temperature;
            }
            if (config.systemPrompt) {
                generateConfig.systemInstruction = config.systemPrompt;
            }
        }

        if (signal?.aborted) throw new Error("Aborted");

        const response = await ai.models.generateContent({
            model: config.model,
            contents: [{ parts: parts }], 
            config: generateConfig
        }, { 
            // @ts-ignore - SDK might support signal in RequestOptions
            signal 
        });

        const usageMetadata = (response as any).usageMetadata;

        let resultImage: string | undefined;
        let resultText: string | undefined;

        if (response.candidates?.[0]?.content?.parts) {
            for (const part of response.candidates[0].content.parts) {
                if (part.inlineData) {
                    resultImage = `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
                } else if (part.text) {
                    resultText = (resultText || '') + part.text;
                }
            }
        }

        return {
            image: resultImage,
            text: resultText,
            usageMetadata: usageMetadata ? {
                promptTokenCount: usageMetadata.promptTokenCount,
                candidatesTokenCount: usageMetadata.candidatesTokenCount,
                totalTokenCount: usageMetadata.totalTokenCount
            } : undefined
        };

    } catch (error: any) {
        console.error("Gemini API Error:", JSON.stringify(error, null, 2));
        throw new Error(error.message || "Failed to generate content");
    }
};

/**
 * Handles Chat Requests using the official Chat API
 */
export const sendChatMessage = async (
    model: string,
    history: ChatMessage[],
    newMessage: string,
    newImages: string[], // Base64 strings
    isImageGenerationMode: boolean
) => {
    // Route to appropriate provider
    const provider = getApiProvider();
    
    if (provider === ApiProvider.NEUROAPI) {
        return await neuroApiService.sendChatMessage(model, history, newMessage, newImages, isImageGenerationMode);
    }
    
    // Default: Google Gemini
    return await sendChatMessageGoogle(model, history, newMessage, newImages, isImageGenerationMode);
};

const sendChatMessageGoogle = async (
    model: string,
    history: ChatMessage[],
    newMessage: string,
    newImages: string[], // Base64 strings
    isImageGenerationMode: boolean
) => {
    const apiKey = getApiKey();
    const ai = new GoogleGenAI({ apiKey });

    // 1. Determine Effective Model
    let effectiveModel = model;
    if (isImageGenerationMode && !model.includes('image')) {
        effectiveModel = ModelType.GEMINI_2_5_FLASH_IMAGE;
    }

    const isImageModel = effectiveModel.includes('image');

    // 2. Prepare History for SDK
    const sdkHistory = history.map(msg => {
        const parts: any[] = [];
        if (msg.text) parts.push({ text: msg.text });
        
        if (msg.images && msg.images.length > 0) {
            msg.images.forEach(img => {
                parts.push({
                    inlineData: {
                        mimeType: 'image/png', // Simplified assumption for base64
                        data: img.split(',')[1]
                    }
                });
            });
        }
        
        return {
            role: msg.role,
            parts: parts
        };
    });

    // 3. Configure Chat
    const chatConfig: any = {};
    if (isImageModel) {
        chatConfig.responseModalities = ['TEXT', 'IMAGE'];
        if (effectiveModel === ModelType.GEMINI_3_PRO_IMAGE) {
            chatConfig.tools = [{ googleSearch: {} }];
        }
    }

    try {
        const chat = ai.chats.create({
            model: effectiveModel,
            history: sdkHistory,
            config: chatConfig
        });

        const messageParts: any[] = [];
        if (newMessage) {
            messageParts.push({ text: newMessage });
        }
        newImages.forEach(b64 => {
             messageParts.push({
                inlineData: {
                    mimeType: 'image/png',
                    data: b64.split(',')[1]
                }
            });
        });

        const response = await chat.sendMessage({
            message: messageParts
        });

        if (!response.candidates || response.candidates.length === 0) {
            const feedback = (response as any).promptFeedback;
            if (feedback && feedback.blockReason) {
                return { text: `⚠️ Content blocked. Reason: ${feedback.blockReason}`, images: [] };
            }
            return { 
                text: "⚠️ The model returned no content. This might be due to safety filters.", 
                images: [] 
            };
        }

        const resParts = response.candidates[0].content?.parts || [];
        const resultImages: string[] = [];
        let resultText = '';

        resParts.forEach(p => {
             if (p.inlineData) {
                 resultImages.push(`data:${p.inlineData.mimeType};base64,${p.inlineData.data}`);
             }
             if (p.text) resultText += p.text;
        });

        return { text: resultText, images: resultImages };

    } catch (error: any) {
        console.error("Chat API Error:", error);
        let errorMsg = error.message || "Failed to get response.";
        if (errorMsg.includes("400")) errorMsg += " (Bad Request - Check parameters)";
        if (errorMsg.includes("503")) errorMsg += " (Service Unavailable)";
        throw new Error(errorMsg);
    }
};

// --- Cloud Batch ---

// Helper to normalize upload response
const normalizeFileResponse = (res: any) => {
    if (res.file) return res.file;
    return res;
};

// Transliteration Map for Cyrillic
const cyrillicToLatinMap: { [key: string]: string } = {
    'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd', 'е': 'e', 'ё': 'yo', 'ж': 'zh',
    'з': 'z', 'и': 'i', 'й': 'y', 'к': 'k', 'л': 'l', 'м': 'm', 'н': 'n', 'о': 'o',
    'п': 'p', 'р': 'r', 'с': 's', 'т': 't', 'у': 'u', 'ф': 'f', 'х': 'kh', 'ц': 'ts',
    'ч': 'ch', 'ш': 'sh', 'щ': 'shch', 'ъ': '', 'ы': 'y', 'ь': '', 'э': 'e', 'ю': 'yu',
    'я': 'ya',
    'А': 'A', 'Б': 'B', 'В': 'V', 'Г': 'G', 'Д': 'D', 'Е': 'E', 'Ё': 'Yo', 'Ж': 'Zh',
    'З': 'Z', 'И': 'I', 'Й': 'Y', 'К': 'K', 'Л': 'L', 'М': 'M', 'Н': 'N', 'О': 'O',
    'П': 'P', 'Р': 'R', 'С': 'S', 'Т': 'T', 'У': 'U', 'Ф': 'F', 'Х': 'Kh', 'Ц': 'Ts',
    'Ч': 'Ch', 'Ш': 'Sh', 'Щ': 'Shch', 'Ъ': '', 'Ы': 'Y', 'Ь': '', 'Э': 'E', 'Ю': 'Yu',
    'Я': 'Ya'
};

const transliterate = (text: string): string => {
    return text.split('').map(char => cyrillicToLatinMap[char] || char).join('');
};

// Helper to sanitize filename (Transliterate, replace spaces with _, safe chars)
const sanitizeAndTransliterate = (originalName: string): string => {
    // 1. Split extension
    const parts = originalName.split('.');
    const ext = parts.length > 1 ? parts.pop() : 'bin';
    const nameWithoutExt = parts.join('.');

    // 2. Transliterate Cyrillic to Latin
    const latinName = transliterate(nameWithoutExt);

    // 3. Sanitize: Replace spaces with underscore (to prevent path issues), allow safe chars
    let cleanName = latinName
        .replace(/\s+/g, '_')
        .replace(/[^a-zA-Z0-9_\-.]/g, '');

    // 4. Fallback if empty
    if (cleanName.length === 0) {
        cleanName = `file_${Date.now()}`;
    }

    return `${cleanName}.${ext}`;
};

export const uploadFileToGemini = async (file: File, index: number = 0) => {
    const apiKey = getApiKey();
    const ai = new GoogleGenAI({ apiKey });
    const aiAny = ai as any;
    
    if (!aiAny.files || !aiAny.files.upload) throw new Error("File API not supported in this SDK version.");
    
    // 1. Sanitize and Transliterate the name
    const safeName = sanitizeAndTransliterate(file.name);
    
    // Create a new file object with the safe name, but same content
    const renamedFile = new File([file], safeName, { type: file.type });
    
    console.log(`[Upload] Processing: ${file.name} -> Safe API Name: ${safeName}`);

    // 2. Upload
    try {
        const response = await aiAny.files.upload({ 
            file: renamedFile, 
            config: { displayName: safeName } 
        });
        
        const normalized = normalizeFileResponse(response);
        // Include safeName/displayName for Cloud Batch filename preservation
        return { ...normalized, displayName: safeName };
        
    } catch (e: any) {
        console.error(`[Upload] Failed for ${safeName}:`, e);
        throw e;
    }
};

/**
 * Generic Batch Creator that accepts pre-formed requests.
 * Use this for Text batches or complex mixed batches.
 */
export const createBatchJobFromRequests = async (
    requests: { custom_id: string, request: any }[],
    config: { model: string, displayName?: string }
) => {
    const apiKey = getApiKey();
    const ai = new GoogleGenAI({ apiKey });
    const aiAny = ai as any;

    console.log(`[Batch] Creating generic job with ${requests.length} requests`);

    // Create JSONL content
    const jsonlContent = requests.map(r => JSON.stringify(r)).join('\n');
    const jsonlFile = new File([jsonlContent], 'batch_manifest.jsonl', { type: 'application/json' });
    
    const uploadResWrapper = await aiAny.files.upload({ 
        file: jsonlFile, 
        config: { displayName: `manifest_${Date.now()}.jsonl` } 
    });
    const uploadRes = normalizeFileResponse(uploadResWrapper);
    
    console.log(`[Batch] Manifest uploaded: ${uploadRes.name}`);

    return await aiAny.batches.create({ 
        model: config.model, 
        src: uploadRes.name, 
        config: { displayName: config.displayName || `Batch_${Date.now()}` } 
    });
};

/**
 * Creates a batch job for images via File API.
 */
export const createCloudBatchJob = async (fileResources: { uri: string, mimeType: string, originalName: string }[], config: ProcessingConfig) => {
    // Reuse the generic creator by building requests
    const isProImageModel = config.model === ModelType.GEMINI_3_PRO_IMAGE;
    const isImageModel = config.model.includes('image');

    const requests = fileResources.map(resource => {
         const parts: any[] = [];
         
         let textPrompt = config.userPrompt || '';
         if (config.systemPrompt) {
             textPrompt = `${config.systemPrompt}\n\n${textPrompt}`.trim();
         }
         
         if (textPrompt) parts.push({ text: textPrompt });
         
         parts.push({ 
             fileData: { 
                 fileUri: resource.uri, 
                 mimeType: resource.mimeType 
             } 
         });
         
         const generationConfig: any = {
             temperature: config.temperature,
         };

         if (isImageModel) {
            generationConfig.imageConfig = {};
            if (config.aspectRatio && config.aspectRatio !== 'Auto') {
                 generationConfig.imageConfig.aspectRatio = config.aspectRatio;
            }
            if (isProImageModel && config.resolution) {
                 generationConfig.imageConfig.imageSize = config.resolution;
            }
            if (!isProImageModel) {
                 generationConfig.responseModalities = ['TEXT', 'IMAGE'];
            }
         }

         const requestBody: any = { 
             contents: [{ parts }],
             generationConfig: generationConfig
         };

         if (isProImageModel) {
            requestBody.tools = [{ googleSearch: {} }];
         }

         const customId = resource.originalName.replace(/\./g, '_DOT_');

         return { 
             custom_id: customId,
             request: requestBody 
         };
    });

    return await createBatchJobFromRequests(requests, {
        model: config.model,
        displayName: `Batch_${Date.now()}`
    });
};

export const cancelBatchJob = async (jobName: string) => {
    const apiKey = getApiKey();
    const ai = new GoogleGenAI({ apiKey });
    const aiAny = ai as any;
    
    let name = jobName;
    if (!name.includes('batches/')) {
        name = `batches/${name}`;
    }
    
    console.log(`[Batch] Cancelling job: ${name}`);
    return await aiAny.batches.cancel({ name: name });
};

export const getBatchJobStatus = async (jobName: string) => {
    const apiKey = getApiKey();
    const ai = new GoogleGenAI({ apiKey });
    const aiAny = ai as any;
    
    let name = jobName;
    if (!name.includes('batches/')) {
        name = `batches/${name}`;
    }
    
    return await aiAny.batches.get({ name: name });
};

/**
 * Downloads the batch result JSONL content.
 */
export const downloadBatchResults = async (jobNameOrFileUri: string) => {
    const apiKey = getApiKey();
    const ai = new GoogleGenAI({ apiKey });
    const aiAny = ai as any;

    let fileName = jobNameOrFileUri;
    let preferDownloadSuffix = false;

    if (jobNameOrFileUri.includes('batches/')) {
        const job = await aiAny.batches.get({ name: jobNameOrFileUri });
        
        if (job.state !== 'JOB_STATE_SUCCEEDED') {
            throw new Error(`Job is not ready yet. Current state: ${job.state}`);
        }

        if (job.dest && (job.dest.fileName || job.dest.file_name)) {
            fileName = job.dest.fileName || job.dest.file_name;
        } else if (job.outputUri) {
             fileName = job.outputUri;
        } else {
            const id = jobNameOrFileUri.split('/').pop();
            fileName = `files/batch-${id}`;
            preferDownloadSuffix = true; 
        }
    } else {
        const match = jobNameOrFileUri.match(/(files\/[a-zA-Z0-9\-_]+)/);
        if (match) {
            fileName = match[1];
        }
        if (fileName.includes('files/batch-')) {
            preferDownloadSuffix = true;
        }
    }

    const baseUrl = `https://generativelanguage.googleapis.com/v1beta/${fileName}`;
    let url = `${baseUrl}?key=${apiKey}&alt=media`;
    
    if (preferDownloadSuffix) {
        url = `${baseUrl}:download?key=${apiKey}&alt=media`;
    }
    
    try {
        let response = await fetch(url);
        
        if (!response.ok) {
            if (preferDownloadSuffix) {
                url = `${baseUrl}?key=${apiKey}&alt=media`;
            } else {
                url = `${baseUrl}:download?key=${apiKey}&alt=media`;
            }
            response = await fetch(url);
        }

        if (!response.ok) {
            const errText = await response.text();
            throw new Error(`Download failed (${response.status}): ${errText}`);
        }
        
        return await response.text();
    } catch (error: any) {
        console.error("Download failed:", error);
        throw new Error(`Failed to download results: ${error.message}`);
    }
};

const PNG_SIGNATURE = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);

const crcTable = (() => {
    const table = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
        let c = i;
        for (let j = 0; j < 8; j++) {
            c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
        }
        table[i] = c >>> 0;
    }
    return table;
})();

const computeCrc32 = (data: Uint8Array): number => {
    let crc = 0xffffffff;
    for (let i = 0; i < data.length; i++) {
        crc = (crc >>> 8) ^ crcTable[(crc ^ data[i]) & 0xff];
    }
    return (crc ^ 0xffffffff) >>> 0;
};

const writeUint32BE = (value: number): Uint8Array => {
    const out = new Uint8Array(4);
    out[0] = (value >>> 24) & 0xff;
    out[1] = (value >>> 16) & 0xff;
    out[2] = (value >>> 8) & 0xff;
    out[3] = value & 0xff;
    return out;
};

const readUint32BE = (arr: Uint8Array, offset: number): number => {
    return ((arr[offset] << 24) >>> 0) + ((arr[offset + 1] << 16) >>> 0) + ((arr[offset + 2] << 8) >>> 0) + (arr[offset + 3] >>> 0);
};

const concatUint8Arrays = (chunks: Uint8Array[]): Uint8Array => {
    const total = chunks.reduce((sum, part) => sum + part.length, 0);
    const out = new Uint8Array(total);
    let cursor = 0;
    for (const part of chunks) {
        out.set(part, cursor);
        cursor += part.length;
    }
    return out;
};

const createPngChunk = (chunkType: string, data: Uint8Array): Uint8Array => {
    const typeBytes = new TextEncoder().encode(chunkType);
    const crcInput = concatUint8Arrays([typeBytes, data]);
    const crc = computeCrc32(crcInput);
    return concatUint8Arrays([
        writeUint32BE(data.length),
        typeBytes,
        data,
        writeUint32BE(crc)
    ]);
};

const dataUrlToBytes = (dataUrl: string): { mimeType: string; bytes: Uint8Array } => {
    const match = dataUrl.match(/^data:([^;]+);base64,(.*)$/);
    if (!match) {
        throw new Error('Invalid base64 image data URL format.');
    }
    const mimeType = match[1].toLowerCase();
    const base64 = match[2];
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return { mimeType, bytes };
};

const looksLikePng = (bytes: Uint8Array): boolean => {
    if (bytes.length < PNG_SIGNATURE.length) return false;
    for (let i = 0; i < PNG_SIGNATURE.length; i++) {
        if (bytes[i] !== PNG_SIGNATURE[i]) return false;
    }
    return true;
};

const embedPngMetadata = (pngBytes: Uint8Array, keyword: string, text: string): Uint8Array | null => {
    try {
        if (!looksLikePng(pngBytes)) return null;

        let iendOffset = -1;
        let offset = 8;

        while (offset + 12 <= pngBytes.length) {
            const length = readUint32BE(pngBytes, offset);
            const typeStart = offset + 4;
            const type = String.fromCharCode(
                pngBytes[typeStart],
                pngBytes[typeStart + 1],
                pngBytes[typeStart + 2],
                pngBytes[typeStart + 3]
            );

            if (type === 'IEND') {
                iendOffset = offset;
                break;
            }

            const nextOffset = offset + 12 + length;
            if (nextOffset <= offset || nextOffset > pngBytes.length) {
                return null;
            }
            offset = nextOffset;
        }

        if (iendOffset < 0) return null;

        const keywordBytes = new TextEncoder().encode(keyword);
        const textBytes = new TextEncoder().encode(text);

        const iTXtData = concatUint8Arrays([
            keywordBytes,
            new Uint8Array([0]),
            new Uint8Array([0]),
            new Uint8Array([0]),
            new Uint8Array([0]),
            textBytes
        ]);

        const chunk = createPngChunk('iTXt', iTXtData);
        const before = pngBytes.slice(0, iendOffset);
        const after = pngBytes.slice(iendOffset);
        return concatUint8Arrays([before, chunk, after]);
    } catch {
        return null;
    }
};

const bufferToHex = (buffer: ArrayBuffer): string => {
    const arr = new Uint8Array(buffer);
    return Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('');
};

const sha256Hex = async (bytes: Uint8Array): Promise<string> => {
    const hash = await crypto.subtle.digest('SHA-256', bytes);
    return bufferToHex(hash);
};

const getOrCreateLocalProofSecret = (): string => {
    const key = 'wite_ai_local_proof_secret';
    const existing = localStorage.getItem(key);
    if (existing) return existing;

    const random = new Uint8Array(32);
    crypto.getRandomValues(random);
    const secret = Array.from(random).map(b => b.toString(16).padStart(2, '0')).join('');
    localStorage.setItem(key, secret);
    return secret;
};

const signLocalProof = async (secret: string, payload: string): Promise<string> => {
    const key = await crypto.subtle.importKey(
        'raw',
        new TextEncoder().encode(secret),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign']
    );
    const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
    return bufferToHex(signature);
};

const triggerDownloadFromBlob = (blob: Blob, filename: string) => {
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
};

const toIsoUtc = (value?: number | string): string => {
    if (typeof value === 'number') return new Date(value).toISOString();
    if (typeof value === 'string') {
        const parsed = Date.parse(value);
        if (!Number.isNaN(parsed)) return new Date(parsed).toISOString();
    }
    return new Date().toISOString();
};

export const downloadBase64Image = async (base64Data: string, filename: string, metadata?: ImageProofMetadata) => {
    try {
        const { mimeType, bytes } = dataUrlToBytes(base64Data);

        if (mimeType !== 'image/png' || !looksLikePng(bytes)) {
            const link = document.createElement('a');
            link.href = base64Data;
            link.download = filename;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            return;
        }

        const user = getCurrentUser();
        const createdAtUtc = toIsoUtc(metadata?.createdAt);
        const workId = typeof crypto.randomUUID === 'function'
            ? crypto.randomUUID()
            : `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

        const imageSha256 = await sha256Hex(bytes);
        const promptHash = metadata?.prompt ? await sha256Hex(new TextEncoder().encode(metadata.prompt)) : undefined;

        const provenance: Record<string, any> = {
            schema: 'wite.provenance.v1',
            workId,
            createdAtUtc,
            downloadedAtUtc: new Date().toISOString(),
            imageSha256,
            promptHash: promptHash || null,
            model: metadata?.model || null,
            resolution: metadata?.resolution || null,
            aspectRatio: metadata?.aspectRatio || null,
            inputImagesCount: metadata?.inputImagesCount ?? null,
            authorId: metadata?.authorId || user?.id || null,
            authorName: metadata?.authorName || user?.username || null,
            copyrightNotice: metadata?.copyrightNotice || null,
            app: 'gemini_api',
            fileName: filename
        };

        const canonical = JSON.stringify(provenance);
        const localSecret = getOrCreateLocalProofSecret();
        provenance.localProofSignature = await signLocalProof(localSecret, canonical);

        const enriched = embedPngMetadata(bytes, 'wite.provenance', JSON.stringify(provenance));
        const finalBytes = enriched || bytes;
        triggerDownloadFromBlob(new Blob([finalBytes], { type: 'image/png' }), filename);
    } catch (error) {
        console.warn('Failed to embed PNG metadata, downloading original image:', error);
        const link = document.createElement('a');
        link.href = base64Data;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }
};
