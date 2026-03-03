
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Select, TextArea } from '../components/ui/InputComponents';
import Button from '../components/ui/Button';
import FileUploader from '../components/ui/FileUploader';
import NumberStepper from '../components/ui/NumberStepper';
import { uploadFileToGemini, getBatchJobStatus, fetchBatchResultsResponse, cancelBatchJob, deleteBatchJob, listBatchJobs, createBatchJobFromRequests, fileToText } from '../services/geminiService';
import { ProcessingConfig, ModelType, CloudBatchJob } from '../types';
import { MODELS, RESOLUTIONS, ASPECT_RATIOS, getAvailableResolutions } from '../constants';
import { useLanguage } from '../contexts/LanguageContext';
import { usePresets } from '../hooks/usePresets';
import { saveGeneration } from '../services/historyService';
import { getCurrentUser } from '../services/authService';
import { getSystemSettings, SystemSettings } from '../services/settingsService';
import { apiFetch } from '../services/apiFetch';

// JSZip is loaded globally via <script> tag in index.html to avoid Vite build errors
declare var JSZip: any;

interface ImageAsset {
    id: string;
    file: File;
    preview: string;
}

interface ExtractedItem {
    id: string;
    name: string;
    type: 'image' | 'text';
    data: string; // Base64 for image, plain string for text
    mimeType?: string;
    prompt?: string; // The prompt used to generate this item
}

const BATCH_SIZE_500 = 500;
const BATCH_SIZE_1000 = 1000;
const ITEMS_PER_PAGE = 20;
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

type BatchMode = 'image' | 'text';
type BatchSizeOption = 500 | 1000;

const CloudBatchProcessor: React.FC = () => {
    const { t } = useLanguage();

    const formatText = (template: string, params: Record<string, string | number>) => {
        return Object.entries(params).reduce((acc, [key, value]) => {
            return acc.replaceAll(`{${key}}`, String(value));
        }, template);
    };

    const getLocalizedJobStatus = (status: string) => {
        const normalized = (status || '').replace('JOB_STATE_', '').toUpperCase();
        switch (normalized) {
            case 'PENDING':
                return t('cloud_status_pending');
            case 'RUNNING':
                return t('cloud_status_running');
            case 'SUCCEEDED':
                return t('cloud_status_succeeded');
            case 'FAILED':
                return t('cloud_status_failed');
            case 'CANCELLED':
                return t('cloud_status_cancelled');
            case 'EXPIRED':
                return t('cloud_status_expired');
            case 'STATE_UNSPECIFIED':
            case 'UNSPECIFIED':
            default:
                return t('cloud_status_unspecified');
        }
    };

    const { presets } = usePresets();
    const user = getCurrentUser();

    const [mode, setMode] = useState<BatchMode>('image');
    const [batchSize, setBatchSize] = useState<BatchSizeOption>(500);

    const [config, setConfig] = useState<ProcessingConfig>({
        model: ModelType.GEMINI_3_PRO_IMAGE, 
        temperature: 1.0,
        systemPrompt: presets.length > 0 ? presets[0].content : '',
        userPrompt: '',
        aspectRatio: 'Auto',
        resolution: '4K'
    });

    const translatedAspectRatios = useMemo(() => [
        { value: 'Auto', label: t('ar_auto') },
        { value: '1:1', label: t('ar_square') },
        { value: '9:16', label: t('ar_portrait_mobile') },
        { value: '16:9', label: t('ar_landscape') },
        { value: '3:4', label: t('ar_portrait_standard') },
        { value: '4:3', label: t('ar_landscape_standard') },
        { value: '3:2', label: t('ar_classic_photo') },
        { value: '2:3', label: t('ar_portrait_photo') },
        { value: '5:4', label: t('ar_print') },
        { value: '4:5', label: t('ar_instagram') },
        { value: '21:9', label: t('ar_cinematic') },
        { value: '1:4', label: t('ar_tall_vertical') },
        { value: '4:1', label: t('ar_wide_horizontal') },
        { value: '1:8', label: t('ar_ultra_tall') },
        { value: '8:1', label: t('ar_ultra_wide') },
    ].filter(ar => {
        const flashOnly = ['1:4', '4:1', '1:8', '8:1'];
        if (flashOnly.includes(ar.value)) return config.model === ModelType.GEMINI_3_1_FLASH_IMAGE;
        return true;
    }), [config.model, t]);

    const [images, setImages] = useState<ImageAsset[]>([]);
    const [textFiles, setTextFiles] = useState<File[]>([]);
    const [filesPerRequest, setFilesPerRequest] = useState<number>(1);
    const [generationsPerPrompt, setGenerationsPerPrompt] = useState<number>(1);

    const [customJobName, setCustomJobName] = useState<string>('');
    const [selectedPresetName, setSelectedPresetName] = useState<string>(presets.length > 0 ? presets[0].name : '');
    const [isUploading, setIsUploading] = useState(false);
    const [isDownloading, setIsDownloading] = useState(false);
    const [jobs, setJobs] = useState<CloudBatchJob[]>([]);
    const [isJobsLoaded, setIsJobsLoaded] = useState(false);
    
    // Pagination State
    const [currentPage, setCurrentPage] = useState(1);

    // Status Loading State (Map of jobId -> boolean)
    const [statusLoadingMap, setStatusLoadingMap] = useState<Record<string, boolean>>({});

    const [isDraggingOverGallery, setIsDraggingOverGallery] = useState(false);
    const [uiSettings, setUiSettings] = useState<SystemSettings>(getSystemSettings());
    const [downloadProgress, setDownloadProgress] = useState<string>("");
    
    // Preview Modal State
    const [isPreviewOpen, setIsPreviewOpen] = useState(false);
    const [previewItems, setPreviewItems] = useState<ExtractedItem[] | null>(null);
    const [activePreviewJob, setActivePreviewJob] = useState<CloudBatchJob | null>(null);
    const [previewTotalItems, setPreviewTotalItems] = useState(0);
    const [isPreviewStreaming, setIsPreviewStreaming] = useState(false);
    const [previewSourceUri, setPreviewSourceUri] = useState<string | null>(null);
    const [previewError, setPreviewError] = useState<string | null>(null);
    const [excludedPreviewItemIds, setExcludedPreviewItemIds] = useState<Set<string>>(new Set());
    const streamedItemsRef = useRef<ExtractedItem[]>([]);
    const [isSavingToGallery, setIsSavingToGallery] = useState(false);
    const [isSyncing, setIsSyncing] = useState(false);

    // Debug/Log Modal State
    const [isDebugModalOpen, setIsDebugModalOpen] = useState(false);
    const [debugModalData, setDebugModalData] = useState<any>(null);
    const [debugModalLoading, setDebugModalLoading] = useState(false);
    const [debugModalError, setDebugModalError] = useState<string | null>(null);

    // Helper: extract prompt index from batch result key
    const getPromptIndexFromKey = (key: string): number => {
        // Format: prompt_${promptIndex+1}_g${copy}_${ts}
        if (key.startsWith('prompt_')) {
            const parts = key.split('_');
            const idx = parseInt(parts[1]);
            if (!isNaN(idx)) return idx - 1;
        }
        // Format: ..._{pN}_g{copy}_... (multi-prompt with files)
        const pMatch = key.match(/_p(\d+)_/);
        if (pMatch) {
            return parseInt(pMatch[1]) - 1;
        }
        return 0; // single prompt, default
    };

    // Helper: get prompt text for an extracted item based on the active job
    const getPromptForItem = (item: ExtractedItem, job: CloudBatchJob | null): string => {
        if (!job?.prompts || job.prompts.length === 0) {
            return formatText(t('cloud_history_result_image_prompt'), { jobId: job?.displayId || '' });
        }
        // Extract key (before __img__ or __txt suffix)
        const rawKey = item.id.split('__')[0];
        const promptIndex = getPromptIndexFromKey(rawKey);
        const prompt = job.prompts[Math.min(promptIndex, job.prompts.length - 1)] || '';
        return prompt;
    };

    const extractItemsFromResponseLine = (line: string, index: number): ExtractedItem[] => {
        if (!line.trim()) return [];

        try {
            const json = JSON.parse(line);
            const candidates = json.response?.candidates || [];

            let idName = `result_${index + 1}`;
            // Support both Gemini 'key' format and legacy 'custom_id' format
            if (json.key) {
                idName = json.key.replace(/_DOT_/g, '.');
            } else if (json.custom_id) {
                idName = json.custom_id.replace(/_DOT_/g, '.');
            }

            if (candidates.length === 0) return [];

            const parts = candidates[0].content?.parts || [];
            const parsedItems: ExtractedItem[] = [];
            let hasImage = false;

            for (const part of parts) {
                const inlineData = part.inlineData || part.inline_data;
                if (inlineData && inlineData.data) {
                    hasImage = true;
                    const data = inlineData.data;
                    const mimeType = inlineData.mimeType || inlineData.mime_type || 'image/png';

                    let ext = 'png';
                    if (mimeType.includes('jpeg') || mimeType.includes('jpg')) ext = 'jpg';

                    let fileName = idName;
                    if (!fileName.toLowerCase().endsWith(`.${ext}`)) {
                        fileName = `${fileName}.${ext}`;
                    }

                    parsedItems.push({
                        id: `${idName}__img__${parsedItems.length}`,
                        name: fileName,
                        type: 'image',
                        data,
                        mimeType
                    });
                }
            }

            if (!hasImage) {
                let textContent = '';
                for (const part of parts) {
                    if (part.text) textContent += part.text;
                }

                if (textContent) {
                    let fileName = idName;
                    if (!fileName.toLowerCase().endsWith('.txt')) {
                        fileName = `${fileName}.txt`;
                    }

                    parsedItems.push({
                        id: `${idName}__txt`,
                        name: fileName,
                        type: 'text',
                        data: textContent
                    });
                }
            }

            return parsedItems;
        } catch (error) {
            console.error("Error parsing response line", error);
            return [];
        }
    };

    const closePreviewModal = () => {
        setIsPreviewOpen(false);
        setPreviewItems(null);
        setActivePreviewJob(null);
        setPreviewTotalItems(0);
        setPreviewSourceUri(null);
        setPreviewError(null);
        setIsPreviewStreaming(false);
        setExcludedPreviewItemIds(new Set());
        streamedItemsRef.current = [];
    };

    const toggleExcludePreviewItem = (itemId: string) => {
        setExcludedPreviewItemIds(prev => {
            const next = new Set(prev);
            if (next.has(itemId)) {
                next.delete(itemId);
            } else {
                next.add(itemId);
            }
            return next;
        });
    };

    const iterateBatchResultItems = async (
        sourceUri: string,
        onItems?: (items: ExtractedItem[], parsedCount: number) => Promise<void> | void,
    ): Promise<ExtractedItem[]> => {
        const response = await fetchBatchResultsResponse(sourceUri);
        const contentType = (response.headers.get('content-type') || '').toLowerCase();
        if (contentType.includes('text/html')) {
            throw new Error(t('cloud_html_instead_json'));
        }

        const allItems: ExtractedItem[] = [];
        const reader = response.body?.getReader();

        if (!reader) {
            const textContent = await response.text();
            const lines = textContent.split('\n');
            for (let index = 0; index < lines.length; index++) {
                const line = lines[index];
                const parsedItems = extractItemsFromResponseLine(line, index);
                if (parsedItems.length > 0) {
                    allItems.push(...parsedItems);
                    await onItems?.(parsedItems, allItems.length);
                }
            }
            return allItems;
        }

        const decoder = new TextDecoder();
        let buffer = '';
        let lineIndex = 0;

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
                const parsedItems = extractItemsFromResponseLine(line, lineIndex);
                lineIndex++;

                if (parsedItems.length > 0) {
                    allItems.push(...parsedItems);
                    await onItems?.(parsedItems, allItems.length);
                }
            }
        }

        if (buffer.trim()) {
            const parsedItems = extractItemsFromResponseLine(buffer, lineIndex);
            if (parsedItems.length > 0) {
                allItems.push(...parsedItems);
                await onItems?.(parsedItems, allItems.length);
            }
        }

        return allItems;
    };

    const loadPreviewItemsStreamed = async (sourceUri: string) => {
        if (!sourceUri) return;

        setIsPreviewStreaming(true);
        setPreviewError(null);
        streamedItemsRef.current = [];
        setPreviewItems([]);
        setPreviewTotalItems(0);
        setDownloadProgress(t('cloud_fetching_data'));

        try {
            await iterateBatchResultItems(sourceUri, (parsedItems, parsedCount) => {
                streamedItemsRef.current = [...streamedItemsRef.current, ...parsedItems];
                setPreviewItems([...streamedItemsRef.current]);
                setPreviewTotalItems(parsedCount);
                setDownloadProgress(formatText(t('cloud_parsing_items'), { count: parsedCount }));
            });

            setDownloadProgress('');
        } catch (error: any) {
            setPreviewError(error.message || 'Failed to load preview page');
            setDownloadProgress('');
        } finally {
            setIsPreviewStreaming(false);
        }
    };

    useEffect(() => {
        const handleSettingsChange = () => setUiSettings(getSystemSettings());
        window.addEventListener('system-settings-changed', handleSettingsChange);
        return () => window.removeEventListener('system-settings-changed', handleSettingsChange);
    }, []);

    useEffect(() => {
        if (!user) return;
        
        const loadJobs = async () => {
            try {
                const res = await apiFetch(`/api/cloud-jobs/${user.id}`);
                if (res.ok) {
                    const parsedJobs: CloudBatchJob[] = await res.json();
                    
                    // Filter out jobs older than 7 days
                    const now = Date.now();
                    const validJobs = parsedJobs.filter(job => {
                        // Keep jobs without timestamp (legacy) or within 7 days
                        if (!job.timestamp) return true;
                        return (now - job.timestamp) < SEVEN_DAYS_MS;
                    });
                    
                    setJobs(validJobs);
                    setIsJobsLoaded(true);
                }
            } catch (e) {
                console.error("Failed to load cloud jobs from server", e);
            }
        };

        loadJobs();
    }, [user?.id]);

    // Save state to server
    useEffect(() => {
        if (!user || (!isJobsLoaded && jobs.length === 0)) return;
        
        const saveJobs = async () => {
            try {
                await apiFetch(`/api/cloud-jobs/${user.id}`, {
                     method: 'POST',
                     headers: { 'Content-Type': 'application/json' },
                     body: JSON.stringify(jobs)
                });
            } catch (e) {
                console.error("Failed to save cloud jobs to server", e);
            }
        };

        const timeout = setTimeout(saveJobs, 1000); // Debounce save
        return () => clearTimeout(timeout);
    }, [jobs, user?.id]);

    // --- AUTO-POLLING LOGIC ---
    useEffect(() => {
        const intervalId = setInterval(() => {
            const activeJobs = jobs.filter(j => 
                j.status === 'STATE_UNSPECIFIED' || 
                j.status === 'PENDING' || 
                j.status === 'RUNNING' ||
                j.status === 'JOB_STATE_PENDING' || 
                j.status === 'JOB_STATE_RUNNING'
            );

            if (activeJobs.length > 0) {
                // Poll active jobs silently
                activeJobs.forEach(job => {
                    checkStatus(job, true); 
                });
            }
        }, 30000); // Check every 30 seconds (per FAQ recommendation)

        return () => clearInterval(intervalId);
    }, [jobs]);

    const saveJobs = (newJobs: CloudBatchJob[]) => {
        setJobs(newJobs);
    };

    const mergeJobsById = (baseJobs: CloudBatchJob[], incomingJobs: CloudBatchJob[]): CloudBatchJob[] => {
        const mergedMap = new Map<string, CloudBatchJob>();

        baseJobs.forEach(job => {
            mergedMap.set(job.id, job);
        });

        incomingJobs.forEach(job => {
            const prev = mergedMap.get(job.id);
            mergedMap.set(job.id, prev ? { ...prev, ...job } : job);
        });

        return Array.from(mergedMap.values()).sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    };

    const handleClearHistory = () => {
        if (confirm(t('cloud_clear_history_confirm'))) {
            saveJobs([]);
            setCurrentPage(1);
        }
    };

    const handleFilesSelect = (files: File[]) => {
        if (mode === 'image') {
            const newAssets: ImageAsset[] = files.map(f => ({
                id: Math.random().toString(36).substring(2, 9),
                file: f,
                preview: URL.createObjectURL(f)
            }));
            setImages(prev => [...prev, ...newAssets]);
        } else {
            setTextFiles(prev => [...prev, ...files]);
        }
    };

    const removeImage = (id: string) => {
        setImages(prev => prev.filter(img => img.id !== id));
    };

    const removeTextFile = (index: number) => {
        setTextFiles(prev => prev.filter((_, i) => i !== index));
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDraggingOverGallery(true);
    };

    const handleDragLeave = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDraggingOverGallery(false);
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDraggingOverGallery(false);
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            handleFilesSelect(Array.from(e.dataTransfer.files));
        }
    };

    const parseBatchPrompts = (rawPrompts: string): string[] => {
        const trimmedRaw = rawPrompts.trim();

        if (trimmedRaw) {
            const separatorRegex = /^\s*---\s*$/m;

            if (separatorRegex.test(trimmedRaw)) {
                const fromBlocks = trimmedRaw
                    .split(/\n\s*---\s*\n/g)
                    .map(prompt => prompt.trim())
                    .filter(Boolean);

                if (fromBlocks.length > 0) {
                    return fromBlocks;
                }
            }

            const fromLines = trimmedRaw
                .split('\n')
                .map(prompt => prompt.trim())
                .filter(Boolean);

            if (fromLines.length > 0) {
                return fromLines;
            }
        }

        return [];
    };

    const handleCreateBatch = async () => {
        const parsedPrompts = parseBatchPrompts(config.userPrompt);

        if (mode === 'image' && images.length === 0 && parsedPrompts.length === 0) return;
        if (mode === 'text' && textFiles.length === 0) return;

        setIsUploading(true);

        try {
            const newCreatedJobs: CloudBatchJob[] = [];
            const timestamp = Date.now();

            if (mode === 'image') {
                const promptsForBatch = parsedPrompts.length > 0 ? parsedPrompts : [''];
                const copiesPerPrompt = Math.max(1, generationsPerPrompt || 1);
                const isProImageModel = config.model === ModelType.GEMINI_3_PRO_IMAGE || config.model === ModelType.GEMINI_3_1_FLASH_IMAGE;
                const isImageModel = config.model.includes('image');
                const uploadedResources: { uri: string, mimeType: string, originalName: string }[] = [];

                for (let i = 0; i < images.length; i++) {
                    const img = images[i];
                    const res = await uploadFileToGemini(img.file, i);
                    uploadedResources.push({
                        uri: res.uri,
                        mimeType: img.file.type,
                        originalName: res.displayName || res.name.replace('files/', '')
                    });
                }

                // Get safety settings from system settings
                const currentSafetySettings = uiSettings.safetySettings || [];
                const safetySerialized = currentSafetySettings.length > 0
                    ? currentSafetySettings.map((s: any) => ({ category: s.category, threshold: s.threshold }))
                    : undefined;

                const imageRequests: { key: string; request: any }[] = [];

                // Helper to build image generation config
                const buildImageGenConfig = () => {
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
                        // All image models need responseModalities for batch
                        generationConfig.responseModalities = ['TEXT', 'IMAGE'];
                    }
                    return generationConfig;
                };

                if (uploadedResources.length === 0) {
                    promptsForBatch.forEach((prompt, promptIndex) => {
                        for (let copyIndex = 0; copyIndex < copiesPerPrompt; copyIndex++) {
                            let textPrompt = prompt;
                            if (config.systemPrompt) {
                                textPrompt = `${config.systemPrompt}\n\n${textPrompt}`.trim();
                            }

                            const parts: any[] = [];
                            if (textPrompt) {
                                parts.push({ text: textPrompt });
                            }

                            const requestBody: any = {
                                contents: [{ parts }],
                                generationConfig: buildImageGenConfig(),
                            };

                            // NOTE: tools (Google Search / Image Search) are NOT supported in Batch API for image generation
                            if (safetySerialized) requestBody.safetySettings = safetySerialized;

                            imageRequests.push({
                                key: `prompt_${promptIndex + 1}_g${copyIndex + 1}_${timestamp}`,
                                request: requestBody,
                            });
                        }
                    });
                } else {
                    uploadedResources.forEach((resource, resourceIndex) => {
                        promptsForBatch.forEach((prompt, promptIndex) => {
                            for (let copyIndex = 0; copyIndex < copiesPerPrompt; copyIndex++) {
                                const parts: any[] = [];

                                let textPrompt = prompt;
                                if (config.systemPrompt) {
                                    textPrompt = `${config.systemPrompt}\n\n${textPrompt}`.trim();
                                }

                                if (textPrompt) {
                                    parts.push({ text: textPrompt });
                                }

                                parts.push({
                                    fileData: {
                                        fileUri: resource.uri,
                                        mimeType: resource.mimeType,
                                    }
                                });

                                const requestBody: any = {
                                    contents: [{ parts }],
                                    generationConfig: buildImageGenConfig(),
                                };

                                // NOTE: tools (Google Search / Image Search) are NOT supported in Batch API for image generation
                                if (safetySerialized) requestBody.safetySettings = safetySerialized;

                                const baseKey = resource.originalName.replace(/\./g, '_DOT_');
                                const promptSuffix = promptsForBatch.length > 1 ? `_p${promptIndex + 1}` : '';

                                imageRequests.push({
                                    key: `${baseKey}${promptSuffix}_g${copyIndex + 1}_${resourceIndex + 1}`,
                                    request: requestBody,
                                });
                            }
                        });
                    });
                }

                for (let i = 0; i < imageRequests.length; i += batchSize) {
                    const reqChunk = imageRequests.slice(i, i + batchSize);
                    const chunkIndex = Math.floor(i / batchSize) + 1;
                    const startIndex = i + 1;
                    const endIndex = i + reqChunk.length;

                    const autoName = generateAutoJobName();
                    const displayJobName = customJobName
                        ? `${customJobName} (${startIndex}-${endIndex})`
                        : imageRequests.length > batchSize
                            ? `${autoName} (${startIndex}-${endIndex})`
                            : autoName;

                    const batchJob: any = await createBatchJobFromRequests(reqChunk, {
                        model: config.model,
                        displayName: displayJobName,
                    });

                    newCreatedJobs.push({
                        id: batchJob.name,
                        displayId: displayJobName,
                        status: batchJob.state || 'PENDING',
                        createdAt: new Date().toLocaleTimeString(),
                        timestamp: timestamp,
                        updatedAt: Date.now(),
                        model: config.model,
                        prompts: promptsForBatch,
                        systemPrompt: config.systemPrompt || undefined,
                    });
                }

                setImages([]);
            } else {
                // Text Batch Logic
                const currentSafetySettings = uiSettings.safetySettings || [];
                const safetySerialized = currentSafetySettings.length > 0
                    ? currentSafetySettings.map((s: any) => ({ category: s.category, threshold: s.threshold }))
                    : undefined;

                // 1. Group files
                const chunks: File[][] = [];
                for (let i = 0; i < textFiles.length; i += filesPerRequest) {
                    chunks.push(textFiles.slice(i, i + filesPerRequest));
                }

                // 2. Prepare Requests
                const requests: any[] = [];
                
                const promptsForBatch = parsedPrompts.length > 0 ? parsedPrompts : [''];

                for (const chunk of chunks) {
                    // Combine text contents
                    let combinedText = "";
                    const filenames = [];
                    for (const file of chunk) {
                        const content = await fileToText(file);
                        combinedText += `\n--- START OF FILE: ${file.name} ---\n${content}\n--- END OF FILE ---\n`;
                        filenames.push(file.name);
                    }

                    promptsForBatch.forEach((basePrompt, promptIndex) => {
                        let textPrompt = basePrompt || '';
                        if (combinedText) {
                            textPrompt = `${textPrompt}\n${combinedText}`.trim();
                        }

                        const generationConfig: any = {
                            temperature: config.temperature,
                        };

                        const requestBody: any = {
                            contents: [{ parts: [{ text: textPrompt }] }],
                            generationConfig
                        };

                        // systemInstruction must be at request body level, not inside generationConfig
                        if (config.systemPrompt) {
                            requestBody.systemInstruction = { parts: [{ text: config.systemPrompt }] };
                        }
                        if (safetySerialized) {
                            requestBody.safetySettings = safetySerialized;
                        }

                        const safeName = filenames.join('_').substring(0, 50).replace(/[^a-zA-Z0-9_\-.]/g, '_') || 'text';
                        const promptSuffix = promptsForBatch.length > 1 ? `_p${promptIndex + 1}` : '';
                        const keyId = `${safeName}${promptSuffix}_${Date.now()}`;

                        requests.push({
                            key: keyId,
                            request: requestBody
                        });
                    });
                }

                // 3. Create batch jobs in chunks based on selected batch size
                for (let i = 0; i < requests.length; i += batchSize) {
                    const reqChunk = requests.slice(i, i + batchSize);
                    const chunkIndex = Math.floor(i / batchSize) + 1;
                    
                    const autoName = generateAutoJobName();
                    let displayJobName = customJobName 
                        ? `${customJobName} (Text P${chunkIndex})`
                        : requests.length > batchSize
                            ? `${autoName} (P${chunkIndex})`
                            : autoName;

                    const batchJob: any = await createBatchJobFromRequests(reqChunk, {
                        model: config.model,
                        displayName: displayJobName
                    });

                    newCreatedJobs.push({
                        id: batchJob.name,
                        displayId: displayJobName,
                        status: batchJob.state || 'PENDING',
                        createdAt: new Date().toLocaleTimeString(),
                        timestamp: timestamp,
                        updatedAt: Date.now(),
                        model: config.model,
                        prompts: promptsForBatch,
                        systemPrompt: config.systemPrompt || undefined,
                    });
                }
                setTextFiles([]);
            }

            setJobs(prevJobs => mergeJobsById(prevJobs, newCreatedJobs));
            setCustomJobName('');
            setCurrentPage(1);
            
        } catch (error: any) {
            alert(`${t('cloud_batch_creation_failed')} ${error.message}`);
        } finally {
            setIsUploading(false);
        }
    };

    const handleCancelJob = async (jobId: string) => {
        if (!confirm(t('confirm_cancel'))) return;
        try {
            await cancelBatchJob(jobId);
            const newJobs = jobs.map(j => j.id === jobId ? { ...j, status: 'JOB_STATE_CANCELLED', updatedAt: Date.now() } : j);
            saveJobs(newJobs);
            setTimeout(() => {
                const job = newJobs.find(j => j.id === jobId);
                if (job) checkStatus(job);
            }, 2000);
        } catch (error: any) {
            alert(`${t('cloud_cancel_failed')} ${error.message}`);
        }
    };

    const extractOutputFile = (statusRes: any): string | undefined => {
        if (statusRes.dest) {
            if (statusRes.dest.fileName) return statusRes.dest.fileName;
            if (statusRes.dest.file_name) return statusRes.dest.file_name;
            if (statusRes.dest.file?.name) return statusRes.dest.file.name;
        }
        if (statusRes.outputUri) return statusRes.outputUri;
        if (statusRes.state === 'JOB_STATE_SUCCEEDED' && statusRes.name) {
             const id = statusRes.name.split('/').pop();
             return `files/batch-${id}`;
        }
        return undefined;
    };

    const checkStatus = async (job: CloudBatchJob, isSilent: boolean = false) => {
        if (!isSilent) {
            setStatusLoadingMap(prev => ({ ...prev, [job.id]: true }));
        }

        try {
            const statusRes: any = await getBatchJobStatus(job.id);
            const outputFile = extractOutputFile(statusRes);
            
            // Extract batchStats if available
            const stats = statusRes.batchStats || statusRes.batch_stats;
            const batchStats = stats ? {
                totalRequestCount: stats.totalRequestCount || stats.total_request_count || 0,
                succeededRequestCount: stats.succeededRequestCount || stats.succeeded_request_count || 0,
                failedRequestCount: stats.failedRequestCount || stats.failed_request_count || 0,
            } : undefined;

            const updatedJob: CloudBatchJob = { 
                ...job, 
                status: statusRes.state, 
                outputFileUri: outputFile || job.outputFileUri,
                error: statusRes.error?.message || statusRes.error || undefined,
                batchStats,
                updatedAt: Date.now()
            };
            
            setJobs(prevJobs => prevJobs.map(j => j.id === job.id ? updatedJob : j));
            
            return updatedJob;
        } catch (error: any) {
            console.error("Failed to check status", error);
            const errMsg = error?.message || String(error);
            // If 404 — job was removed from the server
            if (errMsg.includes('404') || errMsg.includes('NOT_FOUND') || errMsg.includes('not found')) {
                const updatedJob: CloudBatchJob = {
                    ...job,
                    status: 'JOB_STATE_EXPIRED',
                    error: t('cloud_job_not_found'),
                    updatedAt: Date.now()
                };
                setJobs(prevJobs => prevJobs.map(j => j.id === job.id ? updatedJob : j));
                return updatedJob;
            }
            return job;
        } finally {
            if (!isSilent) {
                setStatusLoadingMap(prev => ({ ...prev, [job.id]: false }));
            }
        }
    };

    const handleFetchResults = async (job: CloudBatchJob) => {
        setIsDownloading(true);
        setDownloadProgress(t('cloud_fetching_data'));
        try {
            const currentJob = await checkStatus(job);
            if (!currentJob.outputFileUri) {
                alert(formatText(t('cloud_output_not_found'), { jobId: job.displayId }));
                setIsDownloading(false);
                setDownloadProgress("");
                return;
            }

            setActivePreviewJob(job);
            setIsPreviewOpen(true);
            setPreviewError(null);
            setExcludedPreviewItemIds(new Set());

            setPreviewSourceUri(currentJob.outputFileUri);
            streamedItemsRef.current = [];
            setPreviewTotalItems(0);
            setPreviewItems([]);
            await loadPreviewItemsStreamed(currentJob.outputFileUri);

        } catch (error: any) {
            alert(`${t('cloud_download_failed')} ${error.message}`);
            setIsPreviewOpen(false);
            setDownloadProgress("");
        } finally {
            setIsDownloading(false);
        }
    };

    const handleSaveToGallery = async () => {
        if (!previewItems || !user) return;
        const itemsToSave = previewItems.filter(item => !excludedPreviewItemIds.has(item.id));
        if (itemsToSave.length === 0) {
            alert(t('cloud_download_empty'));
            return;
        }
        setIsSavingToGallery(true);
        
        try {
            let savedCount = 0;
            for (const item of itemsToSave) {
                const itemPrompt = getPromptForItem(item, activePreviewJob);
                if (item.type === 'image') {
                    await saveGeneration(
                        user.id,
                        'cloud',
                        activePreviewJob?.model || 'unknown',
                        itemPrompt,
                        `data:${item.mimeType};base64,${item.data}`,
                        undefined,
                        undefined
                    );
                } else {
                     await saveGeneration(
                        user.id,
                        'cloud',
                        activePreviewJob?.model || 'unknown',
                        itemPrompt || formatText(t('cloud_history_result_text_prompt'), { name: item.name }),
                        undefined,
                        item.data,
                        undefined
                    );
                }
                savedCount++;
            }
            alert(formatText(t('cloud_saved_gallery_success'), { count: savedCount }));
        } catch (e: any) {
            alert(`${t('cloud_save_gallery_failed')} ${e.message}`);
        } finally {
            setIsSavingToGallery(false);
        }
    };

    const handleZipDownload = async () => {
        if (!previewItems || !activePreviewJob) return;
        const itemsToZip = previewItems.filter(item => !excludedPreviewItemIds.has(item.id));
        if (itemsToZip.length === 0) {
            alert(t('cloud_download_empty'));
            return;
        }
        
        try {
            const safeDisplayName = activePreviewJob.displayId.replace(/\s+/g, '_').replace(/[\(\)]/g, '');
            // @ts-ignore
            const zip = new JSZip();
            
            itemsToZip.forEach((item) => {
                if (item.type === 'image') {
                    zip.file(item.name, item.data, {base64: true});
                } else {
                    zip.file(item.name, item.data);
                }
            });

            const content = await zip.generateAsync({type: "blob"});
            const url = window.URL.createObjectURL(content);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${safeDisplayName}.zip`;
            document.body.appendChild(a);
            a.click();
            setTimeout(() => {
                window.URL.revokeObjectURL(url);
                document.body.removeChild(a);
            }, 1000);
        } catch (e: any) {
            alert(`${t('cloud_zip_failed')} ${e.message}`);
        }
    };

    const handleDebug = async (job: CloudBatchJob) => {
        setDebugModalData(null);
        setDebugModalError(null);
        setDebugModalLoading(true);
        setIsDebugModalOpen(true);

        try {
            const statusRes: any = await getBatchJobStatus(job.id);
            const outputFile = extractOutputFile(statusRes);
            const stats = statusRes.batchStats || statusRes.batch_stats;
            setDebugModalData({
                jobId: job.id,
                displayName: job.displayId,
                model: statusRes.model || job.model || '—',
                status: statusRes.state || job.status,
                createTime: statusRes.createTime || statusRes.create_time || null,
                updateTime: statusRes.updateTime || statusRes.update_time || null,
                outputFileUri: outputFile || null,
                batchStats: stats ? {
                    total: stats.totalRequestCount || stats.total_request_count || 0,
                    succeeded: stats.succeededRequestCount || stats.succeeded_request_count || 0,
                    failed: stats.failedRequestCount || stats.failed_request_count || 0,
                } : null,
                error: statusRes.error || null,
                fullApiResponse: statusRes,
            });
        } catch (error: any) {
            const errMsg = error?.message || String(error);
            if (errMsg.includes('404') || errMsg.includes('NOT_FOUND') || errMsg.includes('not found')) {
                setDebugModalError(t('cloud_job_not_found'));
                // Show cached local data
                setDebugModalData({
                    jobId: job.id,
                    displayName: job.displayId,
                    model: job.model || '—',
                    status: 'NOT_FOUND (deleted from server)',
                    createTime: null,
                    updateTime: null,
                    outputFileUri: job.outputFileUri || null,
                    batchStats: job.batchStats ? {
                        total: job.batchStats.totalRequestCount || 0,
                        succeeded: job.batchStats.succeededRequestCount || 0,
                        failed: job.batchStats.failedRequestCount || 0,
                    } : null,
                    error: errMsg,
                    fullApiResponse: null,
                    cachedOnly: true,
                });
            } else {
                setDebugModalError(errMsg);
            }
        } finally {
            setDebugModalLoading(false);
        }
    };

    const handleCopyDebugJson = async () => {
        if (!debugModalData) return;
        try {
            const text = JSON.stringify(debugModalData, null, 2);
            await navigator.clipboard.writeText(text);
        } catch (e) {
            console.error('Copy failed', e);
        }
    };

    const handleDeleteJob = async (job: CloudBatchJob) => {
        if (!confirm(t('cloud_delete_confirm'))) return;
        try {
            await deleteBatchJob(job.id);
            setJobs(prevJobs => prevJobs.filter(j => j.id !== job.id));
        } catch (error: any) {
            alert(`${t('cloud_delete_failed')} ${error.message}`);
        }
    };

    const handleSyncJobs = async () => {
        setIsSyncing(true);
        try {
            const apiJobs = await listBatchJobs();
            const synced: CloudBatchJob[] = apiJobs.map((j: any) => {
                const outputFile = extractOutputFile(j);
                const stats = j.batchStats || j.batch_stats;
                return {
                    id: j.name,
                    displayId: j.displayName || j.display_name || j.name?.split('/').pop() || 'Unknown',
                    status: j.state || 'STATE_UNSPECIFIED',
                    createdAt: j.createTime ? new Date(j.createTime).toLocaleString() : 'N/A',
                    timestamp: j.createTime ? new Date(j.createTime).getTime() : Date.now(),
                    updatedAt: Date.now(),
                    model: j.model || 'unknown',
                    outputFileUri: outputFile,
                    batchStats: stats ? {
                        totalRequestCount: stats.totalRequestCount || stats.total_request_count || 0,
                        succeededRequestCount: stats.succeededRequestCount || stats.succeeded_request_count || 0,
                        failedRequestCount: stats.failedRequestCount || stats.failed_request_count || 0,
                    } : undefined,
                };
            });
            setJobs(prevJobs => mergeJobsById(prevJobs, synced));
            alert(formatText(t('cloud_sync_success'), { count: synced.length }));
        } catch (error: any) {
            alert(`${t('cloud_sync_failed')} ${error.message}`);
        } finally {
            setIsSyncing(false);
        }
    };

    const handlePresetChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const preset = presets.find(p => p.name === e.target.value);
        if (preset) {
            setConfig(prev => ({ ...prev, systemPrompt: preset.content }));
            setSelectedPresetName(preset.name);
        } else {
            setConfig(prev => ({ ...prev, systemPrompt: '' }));
            setSelectedPresetName('');
        }
    };

    // Auto-generate job name from config when customJobName is empty
    const generateAutoJobName = (): string => {
        const parts: string[] = [];

        // Model short name
        const modelInfo = MODELS.find(m => m.value === config.model);
        if (modelInfo) {
            parts.push(modelInfo.label.replace(/\s+/g, ''));
        }

        // Resolution (for image mode with pro models)
        if (mode === 'image') {
            const isProImageModel = config.model === ModelType.GEMINI_3_PRO_IMAGE || config.model === ModelType.GEMINI_3_1_FLASH_IMAGE;
            if (isProImageModel && config.resolution) {
                parts.push(config.resolution);
            }
        }

        // Aspect ratio (only if not Auto, image mode)
        if (mode === 'image' && config.aspectRatio && config.aspectRatio !== 'Auto') {
            parts.push(config.aspectRatio);
        }

        // Preset name
        if (selectedPresetName) {
            parts.push(selectedPresetName);
        }

        return parts.join('_') || 'Batch';
    };

    // --- Pagination Logic ---
    const indexOfLastItem = currentPage * ITEMS_PER_PAGE;
    const indexOfFirstItem = indexOfLastItem - ITEMS_PER_PAGE;
    const currentJobs = jobs.slice(indexOfFirstItem, indexOfLastItem);
    const totalPages = Math.ceil(jobs.length / ITEMS_PER_PAGE);
    const parsedPromptsCount = parseBatchPrompts(config.userPrompt).length;
    const hasPromptForImageBatch = parsedPromptsCount > 0;
    const totalImageRequestsEstimate = parsedPromptsCount > 0 ? parsedPromptsCount * Math.max(1, generationsPerPrompt || 1) : Math.max(1, generationsPerPrompt || 1);
    const queuedFilesCount = mode === 'image' ? images.length : textFiles.length;
    const isCreateDisabled = (mode === 'image' && images.length === 0 && !hasPromptForImageBatch) || (mode === 'text' && textFiles.length === 0);
    const promptCountForSummary = parsedPromptsCount > 0 ? parsedPromptsCount : 1;
    const summaryRequestEstimate = mode === 'image'
        ? Math.max(1, images.length || 1) * promptCountForSummary * Math.max(1, generationsPerPrompt || 1)
        : Math.max(1, Math.ceil(textFiles.length / Math.max(1, filesPerRequest || 1)));
    const visiblePreviewItems = (previewItems || []).filter(item => !excludedPreviewItemIds.has(item.id));

    const paginate = (pageNumber: number) => setCurrentPage(pageNumber);

    return (
        <div className="space-y-8">
            {/* --- PREVIEW MODAL --- */}
            {isPreviewOpen && activePreviewJob && (
                <div className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
                    <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-6xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
                        <div className="p-6 border-b border-slate-700 flex justify-between items-center bg-slate-800/50">
                            <div>
                                <h2 className="text-xl font-bold text-white flex items-center gap-3">
                                    <i className="fas fa-check-double text-blue-500"></i>
                                    {t('cloud_preview_title')}
                                </h2>
                                <p className="text-sm text-slate-400 mt-1">
                                    {activePreviewJob.displayId} — {visiblePreviewItems.length} / {previewTotalItems} {t('items_count')}
                                </p>
                            </div>
                            <button 
                                onClick={closePreviewModal}
                                className="w-10 h-10 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition-all"
                            >
                                <i className="fas fa-times text-xl"></i>
                            </button>
                        </div>

                        <div className="flex-1 overflow-y-auto p-6 bg-slate-950/50 custom-scrollbar">
                            {previewError && (
                                <div className="mb-4 p-3 rounded-lg border border-red-500/40 bg-red-900/20 text-red-300 text-sm">
                                    {previewError}
                                </div>
                            )}
                            {isPreviewStreaming && (
                                <div className="mb-4 text-xs text-slate-400 flex items-center gap-2">
                                    <i className="fas fa-spinner fa-spin"></i>
                                    {downloadProgress || t('cloud_fetching_data')}
                                </div>
                            )}

                            {!isPreviewStreaming && visiblePreviewItems.length === 0 && !previewError ? (
                                <div className="text-sm text-slate-500 text-center py-10">{t('cloud_download_empty')}</div>
                            ) : (
                            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                                {visiblePreviewItems.map((item, idx) => (
                                    <div key={item.id} className="aspect-square rounded-xl overflow-hidden border border-slate-700 bg-slate-800 relative group flex flex-col">
                                        <button
                                            type="button"
                                            onClick={() => toggleExcludePreviewItem(item.id)}
                                            className="absolute top-2 right-2 z-20 w-7 h-7 rounded-full bg-red-600/85 hover:bg-red-500 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                                            title={t('cloud_exclude_item')}
                                            aria-label={t('cloud_exclude_item')}
                                        >
                                            <i className="fas fa-times text-xs"></i>
                                        </button>

                                        {item.type === 'image' ? (
                                            <img 
                                                src={`data:${item.mimeType};base64,${item.data}`} 
                                                className="w-full h-full object-cover" 
                                                alt={item.name} 
                                            />
                                        ) : (
                                            <div className="w-full h-full p-3 text-[10px] text-slate-300 font-mono overflow-auto whitespace-pre-wrap bg-slate-900/50">
                                                {item.data}
                                            </div>
                                        )}
                                        
                                        <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center p-2 text-center pointer-events-none">
                                            <span className="text-[10px] text-white font-mono bg-black/70 px-2 py-1 rounded mb-2 break-all">
                                                {item.name}
                                            </span>
                                            <span className="text-[9px] uppercase tracking-wide text-slate-300 bg-blue-900/50 px-1.5 py-0.5 rounded border border-blue-500/30">
                                                {item.type}
                                            </span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                            )}
                        </div>

                        <div className="p-6 border-t border-slate-700 bg-slate-800/50 flex flex-col gap-4">
                            <div className="flex flex-col sm:flex-row justify-end gap-4">
                            <div className="mr-auto text-xs text-slate-400 flex items-center">
                                {t('cloud_streamed_page_actions_hint')}
                            </div>
                            
                            <Button
                                variant="secondary"
                                onClick={handleZipDownload}
                                icon="fa-file-zipper"
                                disabled={isPreviewStreaming || visiblePreviewItems.length === 0}
                            >
                                {t('download_zip')}
                            </Button>
                            
                            <Button
                                variant="success"
                                onClick={handleSaveToGallery}
                                isLoading={isSavingToGallery}
                                icon="fa-save"
                                disabled={isPreviewStreaming || visiblePreviewItems.length === 0}
                            >
                                {t('cloud_save_to_gallery')}
                            </Button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* --- DEBUG/LOG MODAL --- */}
            {isDebugModalOpen && (
                <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in" onClick={() => setIsDebugModalOpen(false)}>
                    <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
                        {/* Header */}
                        <div className="flex items-center justify-between p-5 border-b border-slate-700">
                            <div className="flex items-center gap-3">
                                <div className="bg-blue-600/20 p-2 rounded-lg">
                                    <i className="fas fa-info-circle text-blue-400 text-lg"></i>
                                </div>
                                <div>
                                    <h3 className="text-lg font-bold text-white">{t('cloud_debug_title')}</h3>
                                    {debugModalData?.displayName && (
                                        <p className="text-xs text-slate-400 mt-0.5 truncate max-w-[400px]">{debugModalData.displayName}</p>
                                    )}
                                </div>
                            </div>
                            <button onClick={() => setIsDebugModalOpen(false)} className="text-slate-400 hover:text-white transition-colors p-2 rounded-lg hover:bg-slate-800">
                                <i className="fas fa-times text-lg"></i>
                            </button>
                        </div>

                        {/* Body */}
                        <div className="flex-1 overflow-y-auto p-5 space-y-4">
                            {debugModalLoading && (
                                <div className="flex items-center justify-center py-12">
                                    <i className="fas fa-spinner fa-spin text-blue-400 text-2xl"></i>
                                </div>
                            )}

                            {debugModalError && (
                                <div className="bg-red-900/30 border border-red-700/50 rounded-xl p-4 flex items-start gap-3">
                                    <i className="fas fa-exclamation-triangle text-red-400 mt-0.5"></i>
                                    <p className="text-sm text-red-300">{debugModalError}</p>
                                </div>
                            )}

                            {debugModalData?.cachedOnly && (
                                <div className="bg-amber-900/30 border border-amber-700/50 rounded-xl p-4 flex items-start gap-3">
                                    <i className="fas fa-exclamation-circle text-amber-400 mt-0.5"></i>
                                    <p className="text-sm text-amber-300">{t('cloud_debug_cached')}</p>
                                </div>
                            )}

                            {debugModalData && (
                                <>
                                    {/* Main Info Grid */}
                                    <div className="grid grid-cols-2 gap-3">
                                        <div className="bg-slate-800/60 rounded-xl p-3 border border-slate-700/50">
                                            <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">{t('cloud_debug_status')}</div>
                                            <div className={`text-sm font-semibold ${
                                                debugModalData.status?.includes('SUCCEEDED') ? 'text-emerald-400' :
                                                debugModalData.status?.includes('RUNNING') || debugModalData.status?.includes('PENDING') ? 'text-blue-400' :
                                                debugModalData.status?.includes('FAILED') || debugModalData.status?.includes('NOT_FOUND') ? 'text-red-400' :
                                                debugModalData.status?.includes('EXPIRED') ? 'text-amber-400' :
                                                'text-slate-300'
                                            }`}>
                                                {getLocalizedJobStatus(debugModalData.status || '')}
                                            </div>
                                        </div>
                                        <div className="bg-slate-800/60 rounded-xl p-3 border border-slate-700/50">
                                            <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">{t('cloud_debug_model')}</div>
                                            <div className="text-sm text-slate-200 truncate" title={debugModalData.model}>{debugModalData.model?.replace('models/', '')}</div>
                                        </div>
                                        <div className="bg-slate-800/60 rounded-xl p-3 border border-slate-700/50">
                                            <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">{t('cloud_debug_created')}</div>
                                            <div className="text-sm text-slate-200">{debugModalData.createTime ? new Date(debugModalData.createTime).toLocaleString() : '—'}</div>
                                        </div>
                                        <div className="bg-slate-800/60 rounded-xl p-3 border border-slate-700/50">
                                            <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">{t('cloud_debug_updated')}</div>
                                            <div className="text-sm text-slate-200">{debugModalData.updateTime ? new Date(debugModalData.updateTime).toLocaleString() : '—'}</div>
                                        </div>
                                    </div>

                                    {/* Batch Stats */}
                                    {debugModalData.batchStats && (
                                        <div className="bg-slate-800/60 rounded-xl p-4 border border-slate-700/50">
                                            <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-3">{t('cloud_debug_stats')}</div>
                                            <div className="grid grid-cols-3 gap-3">
                                                <div className="text-center">
                                                    <div className="text-2xl font-bold text-slate-200">{debugModalData.batchStats.total}</div>
                                                    <div className="text-[10px] text-slate-500 mt-1">{t('cloud_debug_stats_total')}</div>
                                                </div>
                                                <div className="text-center">
                                                    <div className="text-2xl font-bold text-emerald-400">{debugModalData.batchStats.succeeded}</div>
                                                    <div className="text-[10px] text-slate-500 mt-1">{t('cloud_debug_stats_ok')}</div>
                                                </div>
                                                <div className="text-center">
                                                    <div className={`text-2xl font-bold ${debugModalData.batchStats.failed > 0 ? 'text-red-400' : 'text-slate-500'}`}>{debugModalData.batchStats.failed}</div>
                                                    <div className="text-[10px] text-slate-500 mt-1">{t('cloud_debug_stats_fail')}</div>
                                                </div>
                                            </div>
                                            {debugModalData.batchStats.total > 0 && (
                                                <div className="mt-3 bg-slate-700/50 rounded-full h-2 overflow-hidden">
                                                    <div className="h-full bg-gradient-to-r from-emerald-500 to-emerald-400 rounded-full transition-all" style={{ width: `${(debugModalData.batchStats.succeeded / debugModalData.batchStats.total) * 100}%` }}></div>
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {/* Output File */}
                                    {debugModalData.outputFileUri && (
                                        <div className="bg-slate-800/60 rounded-xl p-3 border border-slate-700/50">
                                            <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">{t('cloud_debug_output')}</div>
                                            <div className="text-xs text-blue-400 font-mono break-all">{debugModalData.outputFileUri}</div>
                                        </div>
                                    )}

                                    {/* Error */}
                                    {debugModalData.error && (
                                        <div className="bg-red-900/20 rounded-xl p-3 border border-red-700/30">
                                            <div className="text-[10px] text-red-500 uppercase tracking-wider mb-1">{t('cloud_debug_error')}</div>
                                            <div className="text-xs text-red-300 font-mono break-all">{typeof debugModalData.error === 'string' ? debugModalData.error : JSON.stringify(debugModalData.error, null, 2)}</div>
                                        </div>
                                    )}

                                    {/* Job ID */}
                                    <div className="bg-slate-800/60 rounded-xl p-3 border border-slate-700/50">
                                        <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Job ID</div>
                                        <div className="text-xs text-slate-400 font-mono break-all select-all">{debugModalData.jobId}</div>
                                    </div>

                                    {/* Raw Response (collapsible) */}
                                    {debugModalData.fullApiResponse && (
                                        <details className="bg-slate-800/60 rounded-xl border border-slate-700/50 overflow-hidden">
                                            <summary className="p-3 cursor-pointer text-[10px] text-slate-500 uppercase tracking-wider hover:text-slate-300 transition-colors select-none">
                                                {t('cloud_debug_raw')}
                                            </summary>
                                            <pre className="p-3 pt-0 text-[11px] text-slate-400 font-mono overflow-x-auto max-h-60 whitespace-pre-wrap break-all">
                                                {JSON.stringify(debugModalData.fullApiResponse, null, 2)}
                                            </pre>
                                        </details>
                                    )}
                                </>
                            )}
                        </div>

                        {/* Footer */}
                        <div className="p-4 border-t border-slate-700 flex justify-end gap-3">
                            <button
                                onClick={handleCopyDebugJson}
                                disabled={!debugModalData}
                                className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold bg-slate-800 text-slate-300 border border-slate-600 hover:bg-slate-700 hover:text-white transition-all disabled:opacity-40"
                            >
                                <i className="fas fa-copy"></i> {t('cloud_debug_copy')}
                            </button>
                            <button
                                onClick={() => setIsDebugModalOpen(false)}
                                className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold bg-blue-600 text-white hover:bg-blue-500 transition-all"
                            >
                                OK
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <div className="bg-slate-800/50 backdrop-blur-sm p-6 lg:p-7 rounded-2xl border border-slate-700">
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-7">
                    <div className="flex items-center gap-4">
                        <div className="bg-blue-600/20 p-2 rounded-lg">
                             <i className="fas fa-cloud text-blue-500"></i>
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-white">{t('cloud_setup_title')}</h2>
                            <p className="text-xs text-slate-400 mt-1">
                                {mode === 'image' ? t('cloud_mode_image_desc') : t('cloud_mode_text_desc')}
                            </p>
                        </div>
                    </div>

                    <div className="flex flex-col sm:flex-row gap-3 self-start lg:self-auto">
                    <div className="flex bg-slate-800 rounded-lg p-1 border border-slate-700">
                        <button 
                            onClick={() => setMode('image')}
                            className={`px-4 py-2 rounded-md text-sm font-bold transition-all flex items-center gap-2 ${mode === 'image' ? 'bg-theme-primary text-white shadow-lg' : 'text-slate-400 hover:text-white'}`}
                        >
                            <i className="fas fa-image"></i> {t('mode_images')}
                        </button>
                        <button 
                            onClick={() => setMode('text')}
                            className={`px-4 py-2 rounded-md text-sm font-bold transition-all flex items-center gap-2 ${mode === 'text' ? 'bg-theme-primary text-white shadow-lg' : 'text-slate-400 hover:text-white'}`}
                        >
                            <i className="fas fa-file-alt"></i> {t('mode_text_csv')}
                        </button>
                    </div>

                        <div className="flex bg-slate-800 rounded-lg p-1 border border-slate-700">
                            <button
                                onClick={() => setBatchSize(500)}
                                className={`px-3 py-2 rounded-md text-xs font-bold transition-all ${batchSize === 500 ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'}`}
                                title={t('cloud_batch_500_desc')}
                            >
                                {t('cloud_batch_500')}
                            </button>
                            <button
                                onClick={() => setBatchSize(1000)}
                                className={`px-3 py-2 rounded-md text-xs font-bold transition-all ${batchSize === 1000 ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'}`}
                                title={t('cloud_batch_1000_desc')}
                            >
                                {t('cloud_batch_1000')}
                            </button>
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-1 xl:grid-cols-12 gap-7 mb-7">
                    <div className="xl:col-span-5 bg-slate-900/40 border border-slate-700 rounded-2xl p-5">
                        <h3 className="text-base font-semibold text-white mb-4 flex items-center gap-2">
                            <i className="fas fa-sliders-h text-blue-400"></i>
                            {t('cloud_section_model')}
                        </h3>

                        <div className="space-y-5">
                            <Select label={t('model_label')} options={MODELS} value={config.model} onChange={e => setConfig({ ...config, model: e.target.value as ModelType })} />

                            {mode === 'image' && (
                                <>
                                    <Select label={t('resolution_label')} options={getAvailableResolutions(config.model)} value={config.resolution} onChange={e => setConfig({ ...config, resolution: e.target.value })} />
                                    <Select label={t('ar_label')} options={translatedAspectRatios} value={config.aspectRatio} onChange={e => setConfig({ ...config, aspectRatio: e.target.value })} />
                                    <div>
                                        <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 ml-1">{t('generations_per_prompt_label')}</label>
                                        <NumberStepper
                                            value={generationsPerPrompt}
                                            onChange={setGenerationsPerPrompt}
                                            min={1}
                                            max={50}
                                            className="max-w-[280px]"
                                            decreaseAriaLabel="Decrease generations per prompt"
                                            increaseAriaLabel="Increase generations per prompt"
                                        />
                                        <p className="text-[10px] text-slate-500 mt-1 ml-1">
                                            {formatText(t('generations_per_prompt_hint'), { count: generationsPerPrompt })}
                                        </p>
                                    </div>
                                    {/* Google Search & Image Search are NOT supported in Batch API for image generation */}
                                </>
                            )}

                            {mode === 'text' && (
                                <div>
                                    <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 ml-1">{t('files_per_request_label')}</label>
                                    <NumberStepper
                                        value={filesPerRequest}
                                        onChange={setFilesPerRequest}
                                        min={1}
                                        max={50}
                                        className="max-w-[280px]"
                                        decreaseAriaLabel="Decrease files per request"
                                        increaseAriaLabel="Increase files per request"
                                    />
                                    <p className="text-[10px] text-slate-500 mt-1 ml-1">{t('files_per_request_hint')}</p>
                                </div>
                            )}

                            <div>
                                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 ml-1">{t('job_name_optional')}</label>
                                <input type="text" className="w-full bg-slate-800 border border-slate-700 text-slate-100 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500/50 placeholder-slate-600" placeholder={t('job_name_placeholder')} value={customJobName} onChange={(e) => setCustomJobName(e.target.value)} />
                            </div>
                        </div>
                    </div>

                    <div className="xl:col-span-7 bg-slate-900/40 border border-slate-700 rounded-2xl p-5">
                        <h3 className="text-base font-semibold text-white mb-4 flex items-center gap-2">
                            <i className="fas fa-pen-ruler text-violet-400"></i>
                            {t('cloud_section_prompts')}
                        </h3>

                        <div className="space-y-5">
                            <div>
                                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 ml-1">{t('preset_label')}</label>
                                <select className="w-full bg-slate-800 border border-slate-700 text-slate-100 rounded-lg px-4 py-3 appearance-none focus:outline-none focus:ring-2 focus:ring-blue-500" onChange={handlePresetChange} defaultValue="">
                                    <option value="">{t('load_preset_placeholder')}</option>
                                    {presets.map(p => ( <option key={p.name} value={p.name}>{p.name}</option> ))}
                                </select>
                            </div>

                            <TextArea label={t('system_instr_label')} value={config.systemPrompt} onChange={e => setConfig({ ...config, systemPrompt: e.target.value })} className="flex-1" />
                            <TextArea
                                label={t('user_prompt_label')}
                                value={config.userPrompt}
                                onChange={e => setConfig({ ...config, userPrompt: e.target.value })}
                                className="flex-1"
                                placeholder={t('batch_prompts_placeholder')}
                            />
                            <p className="text-[11px] text-slate-500 -mt-3 ml-1">
                                {parsedPromptsCount > 0
                                    ? mode === 'image'
                                        ? formatText(t('batch_prompts_hint_image'), {
                                            prompts: parsedPromptsCount,
                                            generations: Math.max(1, generationsPerPrompt || 1),
                                            requests: totalImageRequestsEstimate,
                                        })
                                        : formatText(t('batch_prompts_hint_text'), {
                                            prompts: parsedPromptsCount,
                                        })
                                    : t('batch_prompts_hint_empty')}
                            </p>
                        </div>
                    </div>
                </div>

                <div className={`bg-slate-800/50 backdrop-blur-sm p-6 rounded-2xl border transition-colors mb-7 ${isDraggingOverGallery ? 'border-blue-500 bg-blue-500/10' : 'border-slate-700'}`} onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}>
                    <div className="mb-4">
                        <h3 className="text-sm font-semibold text-white mb-1 flex items-center gap-2">
                            <i className="fas fa-inbox text-emerald-400"></i>
                            {t('cloud_section_input_launch')}
                        </h3>
                    </div>

                    <div className="flex justify-between items-center mb-4">
                        <h2 className="text-lg font-medium text-white flex items-center gap-2">
                             <i className={`fas ${mode === 'image' ? 'fa-images' : 'fa-file-alt'} text-slate-400`}></i>
                             {t('input_files')}
                        </h2>
                        <span className="text-xs text-slate-400">{mode === 'image' ? images.length : textFiles.length} {t('files_queued')}</span>
                    </div>

                    {mode === 'image' ? (
                        images.length === 0 ? (
                            <FileUploader onFilesSelected={handleFilesSelect} multiple={true} />
                        ) : (
                            <div className="space-y-4">
                                <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 gap-2 max-h-64 overflow-y-auto p-1 custom-scrollbar">
                                    {images.map((img) => (
                                        <div key={img.id} className="relative group aspect-square">
                                            <img src={img.preview} className="w-full h-full object-cover rounded-lg border border-slate-600" alt="Input" />
                                            <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg flex items-center justify-center">
                                                 <button onClick={() => removeImage(img.id)} className="bg-red-600 text-white rounded-full w-8 h-8 flex items-center justify-center hover:bg-red-500">
                                                    <i className="fas fa-trash-alt"></i>
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                                <Button variant="danger" onClick={() => setImages([])} className="w-full py-2 text-sm" icon="fa-trash">
                                    {t('remove_btn')}
                                </Button>
                            </div>
                        )
                    ) : (
                        textFiles.length === 0 ? (
                            <FileUploader 
                                onFilesSelected={handleFilesSelect} 
                                multiple 
                                accept=".csv,.txt,.json,.md,.xml,.js,.ts,.py" 
                                label={t('cloud_drag_drop_text_files')} 
                                className="border-blue-500/30"
                            />
                        ) : (
                            <div className="space-y-4">
                                <div className="flex flex-wrap gap-2 max-h-64 overflow-y-auto p-1 custom-scrollbar">
                                    {textFiles.map((file, i) => (
                                        <div key={i} className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 flex items-center gap-2 text-xs text-slate-300">
                                            <i className="fas fa-file-alt text-slate-500"></i>
                                            <span className="truncate max-w-[150px]">{file.name}</span>
                                            <button onClick={() => removeTextFile(i)} className="text-slate-500 hover:text-red-400 ml-1"><i className="fas fa-times"></i></button>
                                        </div>
                                    ))}
                                </div>
                                <Button variant="danger" onClick={() => setTextFiles([])} className="w-full py-2 text-sm" icon="fa-trash">
                                    {t('remove_btn')}
                                </Button>
                            </div>
                        )
                    )}
                </div>

                <div className="bg-slate-900/40 border border-slate-700 rounded-2xl p-5">
                    <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-5">
                        <div>
                            <h3 className="text-sm font-semibold text-white mb-2">{t('cloud_summary_title')}</h3>
                            <div className="flex flex-wrap gap-2 text-xs">
                                <span className="px-2 py-1 rounded-md border border-slate-700 bg-slate-800/80 text-slate-300">
                                    {t('cloud_summary_files')}: <strong className="text-white">{queuedFilesCount}</strong>
                                </span>
                                <span className="px-2 py-1 rounded-md border border-slate-700 bg-slate-800/80 text-slate-300">
                                    {t('cloud_summary_prompts')}: <strong className="text-white">{promptCountForSummary}</strong>
                                </span>
                                <span className="px-2 py-1 rounded-md border border-slate-700 bg-slate-800/80 text-slate-300">
                                    {t('cloud_summary_requests')}: <strong className="text-white">{summaryRequestEstimate}</strong>
                                </span>
                                <span className={`px-2 py-1 rounded-md border ${isCreateDisabled ? 'border-amber-700/50 bg-amber-900/20 text-amber-300' : 'border-emerald-700/50 bg-emerald-900/20 text-emerald-300'}`}>
                                    {isCreateDisabled ? t('cloud_not_ready_badge') : t('cloud_ready_badge')}
                                </span>
                            </div>

                            {mode === 'image' && isCreateDisabled && (
                                <p className="text-xs text-amber-300 mt-2">
                                    {t('cloud_requirement_image')}
                                </p>
                            )}
                            {mode === 'text' && isCreateDisabled && (
                                <p className="text-xs text-amber-300 mt-2">
                                    {t('cloud_requirement_text')}
                                </p>
                            )}
                        </div>

                        <Button 
                            variant="success" 
                            onClick={handleCreateBatch} 
                            isLoading={isUploading} 
                            disabled={isCreateDisabled}
                            className="min-w-[180px]"
                            icon="fa-cloud-upload-alt"
                        >
                            {t('upload_create_btn')}
                        </Button>
                    </div>
                </div>
            </div>

            <div className="bg-slate-800/50 backdrop-blur-sm p-6 rounded-2xl border border-slate-700">
                <div className="flex justify-between items-center mb-6">
                    <h2 className="text-xl font-semibold text-white">{t('batch_jobs_title')}</h2>
                    <div className="flex gap-3 items-center">
                        <button onClick={handleSyncJobs} disabled={isSyncing} className="text-xs text-blue-400 hover:text-blue-300 disabled:opacity-50 flex items-center gap-1">
                            <i className={`fas fa-cloud-download-alt ${isSyncing ? 'animate-spin' : ''}`}></i> {t('cloud_sync_btn')}
                        </button>
                        <button onClick={handleClearHistory} className="text-xs text-red-400 hover:text-red-300">{t('clear_history')}</button>
                    </div>
                </div>

                <div className="space-y-3">
                    {currentJobs.length === 0 ? (
                        <div className="text-center py-8 text-slate-500">{t('no_jobs')}</div>
                    ) : (
                        currentJobs.map(job => {
                            const isSucceeded = job.status.includes('SUCCEEDED');
                            const isPending = job.status.includes('PENDING') || job.status.includes('RUNNING');
                            const isExpired = job.status.includes('EXPIRED');
                            const isFailed = job.status.includes('FAILED');
                            const isCancelled = job.status.includes('CANCELL');
                            const isFinished = isSucceeded || isFailed || isCancelled || isExpired;
                            const statusColor = isSucceeded
                                ? 'bg-emerald-900 text-emerald-300'
                                : isExpired
                                    ? 'bg-amber-900/70 text-amber-300'
                                    : isFailed
                                        ? 'bg-red-900/70 text-red-300'
                                        : 'bg-slate-700 text-slate-300';
                            return (
                                <div key={job.id} className="bg-slate-800 border border-slate-700 p-4 rounded-xl flex flex-col md:flex-row items-center justify-between gap-4">
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-3">
                                            <span className="font-bold text-white truncate" title={job.displayId}>{job.displayId}</span>
                                            <span className={`text-xs px-2 py-0.5 rounded shrink-0 ${statusColor}`}>
                                                {getLocalizedJobStatus(job.status)}
                                            </span>
                                        </div>
                                        <div className="text-[10px] text-slate-500 mt-1">{job.createdAt} • {job.id.split('/').pop()}</div>
                                        {job.batchStats && job.batchStats.totalRequestCount > 0 && (() => {
                                            const total = job.batchStats!.totalRequestCount ?? 0;
                                            const succeeded = job.batchStats!.succeededRequestCount ?? 0;
                                            const failed = job.batchStats!.failedRequestCount ?? 0;
                                            const processed = succeeded + failed;
                                            const progressPercent = total > 0 ? Math.round((processed / total) * 100) : 0;
                                            const successPercent = total > 0 ? (succeeded / total) * 100 : 0;
                                            const failPercent = total > 0 ? (failed / total) * 100 : 0;
                                            return (
                                                <div className="flex items-center gap-2.5 mt-1.5">
                                                    <div className="flex-1 bg-slate-700/40 rounded-full h-1 overflow-hidden max-w-[180px]">
                                                        <div className="h-full flex">
                                                            <div className="bg-emerald-400 transition-all duration-500" style={{ width: `${successPercent}%` }}></div>
                                                            {failed > 0 && <div className="bg-red-400 transition-all duration-500" style={{ width: `${failPercent}%` }}></div>}
                                                        </div>
                                                    </div>
                                                    <span className="text-[10px] text-slate-500 tabular-nums shrink-0">
                                                        {succeeded}{failed > 0 && <span className="text-red-400">+{failed}</span>}/{total}
                                                    </span>
                                                </div>
                                            );
                                        })()}
                                        {isPending && !job.batchStats && (
                                            <div className="flex items-center gap-2.5 mt-1.5">
                                                <div className="flex-1 bg-slate-700/40 rounded-full h-1 overflow-hidden max-w-[180px]">
                                                    <div className="h-full bg-blue-500/30 rounded-full animate-pulse" style={{ width: '100%' }}></div>
                                                </div>
                                                <span className="text-[10px] text-slate-500">{t('cloud_waiting_progress')}</span>
                                            </div>
                                        )}
                                        {isExpired && <div className="text-[10px] text-amber-400 mt-1"><i className="fas fa-exclamation-triangle mr-1"></i>{t('cloud_expired_hint')}</div>}
                                        {job.error && <div className="text-[10px] text-red-400 mt-1 truncate" title={job.error}><i className="fas fa-exclamation-circle mr-1"></i>{job.error}</div>}
                                    </div>

                                    <div className="flex gap-2 items-center shrink-0">
                                        {isPending && <Button variant="danger" className="py-1 px-3 text-xs h-8" onClick={() => handleCancelJob(job.id)} icon="fa-stop">{t('cancel')}</Button>}
                                        <Button variant="secondary" className="py-1 px-3 text-xs h-8" onClick={() => checkStatus(job)} icon="fa-sync" isLoading={statusLoadingMap[job.id]} />
                                        <Button variant="secondary" className="py-1 px-3 text-xs h-8" onClick={() => handleDebug(job)} icon="fa-info-circle" />
                                        {isSucceeded && <Button variant="primary" className="py-1 px-3 text-xs h-8" onClick={() => handleFetchResults(job)} isLoading={isDownloading} icon="fa-download">{t('cloud_preview_btn')}</Button>}
                                        {isFinished && <Button variant="danger" className="py-1 px-3 text-xs h-8" onClick={() => handleDeleteJob(job)} icon="fa-trash" />}
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>
                
                {totalPages > 1 && (
                    <div className="flex justify-center items-center gap-4 mt-6">
                        <Button variant="secondary" disabled={currentPage === 1} onClick={() => paginate(currentPage - 1)} className="w-10 h-10 p-0 rounded-full"><i className="fas fa-chevron-left"></i></Button>
                        <span className="text-sm text-slate-400">{t('page')} {currentPage} {t('of')} {totalPages}</span>
                        <Button variant="secondary" disabled={currentPage === totalPages} onClick={() => paginate(currentPage + 1)} className="w-10 h-10 p-0 rounded-full"><i className="fas fa-chevron-right"></i></Button>
                    </div>
                )}
            </div>
        </div>
    );
};

export default CloudBatchProcessor;
