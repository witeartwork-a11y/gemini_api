
import { GoogleGenAI } from "@google/genai";
import { ProcessingConfig, ModelType, ChatMessage, ApiProvider } from "../types";
import * as neuroApiService from "./neuroApiService";
import { getApiProvider } from "./settingsService";

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

export const downloadBase64Image = (base64Data: string, filename: string) => {
    const link = document.createElement('a');
    link.href = base64Data;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
};
