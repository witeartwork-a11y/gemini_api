import OpenAI from 'openai';
import { ProcessingConfig, ModelType, ChatMessage, ApiProvider } from "../types";

const NEUROAPI_BASE_URL = 'https://neuroapi.host/v1';

const getApiKey = (): string => {
    let key = localStorage.getItem("neuroapi_api_key");
    if (!key) {
        throw new Error("NeuroAPI Key is missing. Please set it in Settings.");
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

const blobToDataURI = (blob: Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(blob);
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = error => reject(error);
    });
};

/**
 * Check if model is image generation model
 */
const isImageGenerationModel = (model: string): boolean => {
    // Direct image generation models
    if (model === ModelType.GPT_IMAGE_1 || model === ModelType.DALL_E_3) {
        return true;
    }
    
    // Gemini image models (through NeuroAPI aggregator)
    // These models have 'image' in their name and generate images
    if (model.includes('image') && (model.includes('gemini') || model.includes('pro'))) {
        return true;
    }
    
    return false;
};

/**
 * Generate content using NeuroAPI
 */
export const generateContent = async (
    config: ProcessingConfig,
    imageFiles: File[],
    textFilesData?: { name: string, content: string }[],
    signal?: AbortSignal
) => {
    try {
        const apiKey = getApiKey();
        const client = new OpenAI({
            apiKey,
            baseURL: NEUROAPI_BASE_URL,
            dangerouslyAllowBrowser: true
        });

        console.log('[NeuroAPI] Starting generation, model:', config.model);

        if (signal?.aborted) {
            throw new Error("Aborted");
        }

        const isImageModel = isImageGenerationModel(config.model);
        console.log('[NeuroAPI] Is image model:', isImageModel);

        if (isImageModel) {
            // Image Generation via /v1/images/generations
            return await generateImage(client, config, signal);
        } else {
            // Chat Completion with optional images via /v1/chat/completions
            return await generateChatCompletion(client, config, imageFiles, textFilesData, signal);
        }

    } catch (error: any) {
        console.error("[NeuroAPI] Error:", JSON.stringify(error, null, 2));
        throw new Error(error.message || "Failed to generate content");
    }
};

/**
 * Generate image using /v1/images/generations
 */
async function generateImage(
    client: OpenAI,
    config: ProcessingConfig,
    signal?: AbortSignal
) {
    const prompt = config.userPrompt || 'A beautiful landscape';
    
    // Parse size/quality from config
    let size: "1024x1024" | "1792x1024" | "1024x1792" = "1024x1024";
    if (config.resolution) {
        if (config.resolution.includes('1792x1024')) size = "1792x1024";
        else if (config.resolution.includes('1024x1792')) size = "1024x1792";
    }
    
    const quality = config.resolution?.includes('hd') ? 'hd' : 'standard';

    console.log('[NeuroAPI] Generating image with params:', { model: config.model, prompt, size, quality });

    const response = await client.images.generate({
        model: config.model, // Use model as-is: gemini-3-pro-image-preview, dall-e-3, gpt-image-1
        prompt,
        n: 1,
        size,
        quality: quality as 'standard' | 'hd' | 'low' | 'medium' | 'high',
        response_format: 'b64_json'
    }, {
        signal
    } as any);

    console.log('[NeuroAPI] Response received:', {
        hasData: !!response.data,
        dataLength: response.data?.length,
        firstItem: response.data?.[0] ? {
            hasB64Json: !!response.data[0].b64_json,
            hasUrl: !!response.data[0].url,
            b64Length: response.data[0].b64_json?.length,
            url: response.data[0].url
        } : null
    });

    const imageData = response.data[0];
    let resultImage: string | undefined;

    if (imageData.b64_json) {
        // Best case: got base64 directly (no conversion needed!)
        console.log('[NeuroAPI] ✓ Got b64_json directly (length:', imageData.b64_json.length, ')');
        resultImage = `data:image/png;base64,${imageData.b64_json}`;
    } else if (imageData.url) {
        // Fallback: got URL, need to download and convert
        // Why? 1) URL is temporary, 2) Need to save to our server, 3) Avoid CORS issues
        console.log('[NeuroAPI] ⚠ Got URL instead of b64_json, fetching:', imageData.url);
        try {
            const imgRes = await fetch(imageData.url);
            console.log('[NeuroAPI] Fetch response:', imgRes.status, imgRes.statusText);
            const blob = await imgRes.blob();
            console.log('[NeuroAPI] Blob received, size:', blob.size, 'type:', blob.type);
            resultImage = await blobToDataURI(blob);
            console.log('[NeuroAPI] ✓ Converted to Data URI (length:', resultImage.length, ')');
        } catch (e) {
            console.error('[NeuroAPI] ✗ Failed to fetch image from URL:', e);
            throw new Error(`Failed to download image: ${e}`);
        }
    } else {
        console.error('[NeuroAPI] ✗ No image data received! Response:', imageData);
        throw new Error('No image data in API response');
    }

    const result = {
        image: resultImage,
        text: imageData.revised_prompt || prompt,
        usageMetadata: undefined
    };

    console.log('[NeuroAPI] Final result:', {
        hasImage: !!result.image,
        imageLength: result.image?.length,
        imagePrefix: result.image?.substring(0, 50),
        text: result.text
    });

    return result;
}

/**
 * Generate chat completion using /v1/chat/completions
 */
async function generateChatCompletion(
    client: OpenAI,
    config: ProcessingConfig,
    imageFiles: File[],
    textFilesData?: { name: string, content: string }[],
    signal?: AbortSignal
) {
    console.log('[NeuroAPI] Chat completion request, model:', config.model);
    
    const messages: any[] = [];

    // System prompt
    if (config.systemPrompt) {
        messages.push({
            role: 'system',
            content: config.systemPrompt
        });
    }

    // User message with text + images
    const userContent: any[] = [];

    // Add user prompt
    let finalPrompt = config.userPrompt || '';
    
    // Add text files context
    if (textFilesData && textFilesData.length > 0) {
        for (const textFile of textFilesData) {
            finalPrompt += `\n--- START OF FILE: ${textFile.name} ---\n${textFile.content}\n--- END OF FILE ---\n`;
        }
    }

    if (finalPrompt) {
        userContent.push({
            type: 'text',
            text: finalPrompt
        });
    }

    // Add images (if model supports vision)
    if (imageFiles && imageFiles.length > 0) {
        console.log('[NeuroAPI] Adding', imageFiles.length, 'images to request');
        for (const file of imageFiles) {
            const base64Data = await fileToBase64(file);
            userContent.push({
                type: 'image_url',
                image_url: {
                    url: `data:${file.type};base64,${base64Data}`
                }
            });
        }
    }

    messages.push({
        role: 'user',
        content: userContent
    });

    console.log('[NeuroAPI] Sending chat request with', messages.length, 'messages');

    // Generate completion
    const response = await client.chat.completions.create({
        model: config.model,
        messages,
        temperature: config.temperature,
        max_tokens: 4096
    }, {
        signal
    } as any);

    const choice = response.choices[0];
    const resultText = choice?.message?.content || '';
    let resultImage: string | undefined;
    
    // Log FULL response to see what NeuroAPI actually returns
    console.log('[NeuroAPI] Full API response:', JSON.stringify(response, null, 2));
    
    console.log('[NeuroAPI] Chat response:', {
        hasChoices: !!response.choices?.length,
        textLength: resultText.length,
        usage: response.usage,
        message: choice?.message,
        fullChoice: choice
    });
    
    // Check if response contains image data (for multimodal models like Gemini image)
    // NeuroAPI might return images in different formats
    const message = choice?.message as any;
    
    console.log('[NeuroAPI] Checking for images in message...');
    console.log('[NeuroAPI] Message keys:', message ? Object.keys(message) : 'no message');
    console.log('[NeuroAPI] Full message:', message);
    
    if (message) {
        // Check for image in content array (OpenAI format)
        if (Array.isArray(message.content)) {
            console.log('[NeuroAPI] Content is array, length:', message.content.length);
            for (const part of message.content) {
                console.log('[NeuroAPI] Content part:', part);
                if (part.type === 'image_url' && part.image_url?.url) {
                    console.log('[NeuroAPI] ✓ Found image in content array');
                    resultImage = part.image_url.url;
                    break;
                }
            }
        }
        
        // Check for image_url field directly
        if (!resultImage && message.image_url) {
            console.log('[NeuroAPI] ✓ Found image_url field:', message.image_url);
            resultImage = message.image_url;
        }
        
        // Check for base64 image data
        if (!resultImage && message.image) {
            console.log('[NeuroAPI] ✓ Found image field');
            resultImage = typeof message.image === 'string' 
                ? message.image 
                : `data:image/png;base64,${message.image}`;
        }
        
        // Check in choice level (not message level)
        const choiceData = choice as any;
        if (!resultImage && choiceData.image) {
            console.log('[NeuroAPI] ✓ Found image in choice:', choiceData.image);
            resultImage = choiceData.image;
        }
        
        // Check in response root level
        const responseData = response as any;
        if (!resultImage && responseData.image) {
            console.log('[NeuroAPI] ✓ Found image in response root:', responseData.image);
            resultImage = responseData.image;
        }
        
        if (!resultImage && responseData.data && Array.isArray(responseData.data)) {
            console.log('[NeuroAPI] ✓ Found data array, checking for images...');
            for (const item of responseData.data) {
                if (item.url || item.b64_json) {
                    console.log('[NeuroAPI] ✓ Found image in data array');
                    resultImage = item.b64_json 
                        ? `data:image/png;base64,${item.b64_json}`
                        : item.url;
                    break;
                }
            }
        }
        
        // If we got a URL, convert it to base64
        if (resultImage && resultImage.startsWith('http')) {
            console.log('[NeuroAPI] Converting URL to base64:', resultImage);
            try {
                const imgRes = await fetch(resultImage);
                const blob = await imgRes.blob();
                resultImage = await blobToDataURI(blob);
                console.log('[NeuroAPI] ✓ Converted to Data URI');
            } catch (e) {
                console.error('[NeuroAPI] Failed to fetch image:', e);
            }
        }
    }
    
    console.log('[NeuroAPI] Final result:', {
        hasImage: !!resultImage,
        hasText: !!resultText
    });
    
    return {
        image: resultImage,
        text: resultText,
        usageMetadata: response.usage ? {
            promptTokenCount: response.usage.prompt_tokens,
            candidatesTokenCount: response.usage.completion_tokens,
            totalTokenCount: response.usage.total_tokens
        } : undefined
    };
}

/**
 * Send chat message using NeuroAPI
 */
export const sendChatMessage = async (
    model: string,
    history: ChatMessage[],
    newMessage: string,
    newImages: string[], // Base64 strings
    isImageGenerationMode: boolean
) => {
    const apiKey = getApiKey();
    const client = new OpenAI({
        apiKey,
        baseURL: NEUROAPI_BASE_URL,
        dangerouslyAllowBrowser: true
    });

    // Determine effective model
    let effectiveModel = model;
    if (isImageGenerationMode) {
        // Switch to image model if in image mode
        effectiveModel = ModelType.GPT_IMAGE_1;
    }

    const isImageModel = isImageGenerationModel(effectiveModel);

    if (isImageModel) {
        // Image generation request
        console.log('[NeuroAPI Chat] Generating image via chat endpoint, model:', effectiveModel);
        
        const response = await client.images.generate({
            model: effectiveModel,
            prompt: newMessage,
            n: 1,
            size: "1024x1024",
            response_format: 'b64_json'
        });

        console.log('[NeuroAPI Chat] Image response:', {
            hasData: !!response.data,
            dataLength: response.data?.length,
            firstItem: response.data?.[0] ? {
                hasB64Json: !!response.data[0].b64_json,
                hasUrl: !!response.data[0].url
            } : null
        });

        const imageData = response.data[0];
        let resultImage: string | undefined;

        if (imageData.b64_json) {
            console.log('[NeuroAPI Chat] ✓ Got b64_json');
            resultImage = `data:image/png;base64,${imageData.b64_json}`;
        } else if (imageData.url) {
            console.log('[NeuroAPI Chat] ⚠ Got URL, fetching:', imageData.url);
            try {
                const imgRes = await fetch(imageData.url);
                const blob = await imgRes.blob();
                resultImage = await blobToDataURI(blob);
                console.log('[NeuroAPI Chat] ✓ Converted to Data URI');
            } catch (e) {
                console.error('[NeuroAPI Chat] ✗ Failed to fetch:', e);
                resultImage = imageData.url;
            }
        } else {
            console.error('[NeuroAPI Chat] ✗ No image data!');
        }
        
        return {
            text: imageData.revised_prompt || '',
            images: resultImage ? [resultImage] : []
        };
    } else {
        // Chat completion
        const messages: any[] = [];

        // Add history
        for (const msg of history) {
            const content: any[] = [];
            
            if (msg.text) {
                content.push({ type: 'text', text: msg.text });
            }
            
            if (msg.images && msg.images.length > 0) {
                for (const img of msg.images) {
                    content.push({
                        type: 'image_url',
                        image_url: { url: img }
                    });
                }
            }

            messages.push({
                role: msg.role === 'model' ? 'assistant' : 'user',
                content: content.length === 1 && content[0].type === 'text' 
                    ? content[0].text 
                    : content
            });
        }

        // Add new message
        const newContent: any[] = [];
        if (newMessage) {
            newContent.push({ type: 'text', text: newMessage });
        }
        if (newImages && newImages.length > 0) {
            for (const img of newImages) {
                newContent.push({
                    type: 'image_url',
                    image_url: { url: img }
                });
            }
        }

        messages.push({
            role: 'user',
            content: newContent.length === 1 && newContent[0].type === 'text'
                ? newContent[0].text
                : newContent
        });

        const response = await client.chat.completions.create({
            model: effectiveModel,
            messages,
            temperature: 0.7,
            max_tokens: 4096
        });

        const resultText = response.choices[0]?.message?.content || '';

        return {
            text: resultText,
            images: []
        };
    }
};
