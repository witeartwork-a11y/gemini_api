
import { GoogleGenAI } from "@google/genai";
import { ProcessingConfig, ModelType, ChatMessage, ApiProvider } from "../types";
import * as neuroApiService from "./neuroApiService";
import { getApiProvider } from "./settingsService";
import { downloadBase64ImageWithProof, type ImageProofMetadata } from "./imageProofService";

export type { ImageProofMetadata } from "./imageProofService";

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

const getGeminiClient = () => {
    const apiKey = getApiKey();
    const ai = new GoogleGenAI({ apiKey });
    return { apiKey, ai, aiAny: ai as any };
};

const getModelFlags = (model: string) => {
    return {
        isImageModel: model.includes('image'),
        isProImageModel: model === ModelType.GEMINI_3_PRO_IMAGE,
    };
};

const combinePrompts = (systemPrompt?: string, userPrompt?: string): string => {
    const safeUserPrompt = userPrompt || '';
    if (!systemPrompt) return safeUserPrompt;
    return `${systemPrompt}\n\n${safeUserPrompt}`.trim();
};

const applyImageConfig = (
    targetConfig: any,
    config: Pick<ProcessingConfig, 'aspectRatio' | 'resolution'>,
    isProImageModel: boolean
) => {
    targetConfig.imageConfig = {};

    if (config.aspectRatio && config.aspectRatio !== 'Auto') {
        targetConfig.imageConfig.aspectRatio = config.aspectRatio;
    }

    if (isProImageModel && config.resolution) {
        targetConfig.imageConfig.imageSize = config.resolution;
    }
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
        const { ai } = getGeminiClient();
        
        // ... (check abort)
        if (signal?.aborted) {
            throw new Error("Aborted");
        }
        
        const parts: any[] = [];
        const { isProImageModel, isImageModel } = getModelFlags(config.model);

        // Prompt Logic
        let finalPrompt = config.userPrompt || '';
        if (isImageModel) {
            finalPrompt = combinePrompts(config.systemPrompt, config.userPrompt);
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
              applyImageConfig(generateConfig, config, isProImageModel);
            
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
    const { ai } = getGeminiClient();

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

const uploadToGeminiFilesApi = async (aiAny: any, file: File, preferredDisplayName?: string) => {
    const uploadAttempts: Array<() => Promise<any>> = [];

    if (preferredDisplayName) {
        uploadAttempts.push(() => aiAny.files.upload({
            file,
            config: { displayName: preferredDisplayName }
        }));
    }

    uploadAttempts.push(() => aiAny.files.upload({ file }));

    const fallbackSafeName = sanitizeAndTransliterate(file.name || `file_${Date.now()}.bin`);
    const fallbackFile = new File([file], fallbackSafeName, {
        type: file.type || 'application/octet-stream'
    });
    uploadAttempts.push(() => aiAny.files.upload({ file: fallbackFile }));

    let lastError: any;
    for (const attempt of uploadAttempts) {
        try {
            return await attempt();
        } catch (error: any) {
            lastError = error;
        }
    }

    throw lastError;
};

export const uploadFileToGemini = async (file: File, index: number = 0) => {
    const { aiAny } = getGeminiClient();
    
    if (!aiAny.files || !aiAny.files.upload) throw new Error("File API not supported in this SDK version.");
    
    // 1. Sanitize and Transliterate the name
    const safeName = sanitizeAndTransliterate(file.name);
    
    // Create a new file object with the safe name, but same content
    const renamedFile = new File([file], safeName, { type: file.type });
    
    console.log(`[Upload] Processing: ${file.name} -> Safe API Name: ${safeName}`);

    // 2. Upload
    try {
        const response = await uploadToGeminiFilesApi(aiAny, renamedFile, safeName);
        
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
    const { aiAny } = getGeminiClient();

    console.log(`[Batch] Creating generic job with ${requests.length} requests`);

    // Create JSONL content
    const jsonlContent = requests.map(r => JSON.stringify(r)).join('\n');
    const manifestName = `manifest_${Date.now()}.jsonl`;
    const jsonlFile = new File([jsonlContent], manifestName, { type: 'application/jsonl' });
    
    const uploadResWrapper = await uploadToGeminiFilesApi(aiAny, jsonlFile, manifestName);
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
    const { isProImageModel, isImageModel } = getModelFlags(config.model);

    const requests = fileResources.map(resource => {
         const parts: any[] = [];
         
         let textPrompt = combinePrompts(config.systemPrompt, config.userPrompt);
         
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
              applyImageConfig(generationConfig, config, isProImageModel);
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
    const { aiAny } = getGeminiClient();
    
    let name = jobName;
    if (!name.includes('batches/')) {
        name = `batches/${name}`;
    }
    
    console.log(`[Batch] Cancelling job: ${name}`);
    return await aiAny.batches.cancel({ name: name });
};

export const getBatchJobStatus = async (jobName: string) => {
    const { aiAny } = getGeminiClient();
    
    let name = jobName;
    if (!name.includes('batches/')) {
        name = `batches/${name}`;
    }
    
    return await aiAny.batches.get({ name: name });
};

export const fetchBatchResultsResponse = async (jobNameOrFileUri: string): Promise<Response> => {
    const { apiKey, aiAny } = getGeminiClient();

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

    return response;
};

/**
 * Downloads the batch result JSONL content.
 */
export const downloadBatchResults = async (jobNameOrFileUri: string) => {
    try {
        const response = await fetchBatchResultsResponse(jobNameOrFileUri);
        return await response.text();
    } catch (error: any) {
        console.error("Download failed:", error);
        throw new Error(`Failed to download results: ${error.message}`);
    }
};

export const downloadBase64Image = async (base64Data: string, filename: string, metadata?: ImageProofMetadata) => {
    await downloadBase64ImageWithProof(base64Data, filename, metadata);
};
