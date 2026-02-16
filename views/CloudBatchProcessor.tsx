
import React, { useState, useEffect } from 'react';
import { Select, TextArea } from '../components/ui/InputComponents';
import Button from '../components/ui/Button';
import FileUploader from '../components/ui/FileUploader';
import { uploadFileToGemini, getBatchJobStatus, downloadBatchResults, cancelBatchJob, createBatchJobFromRequests, fileToText } from '../services/geminiService';
import { ProcessingConfig, ModelType, CloudBatchJob } from '../types';
import { MODELS, RESOLUTIONS, ASPECT_RATIOS } from '../constants';
import { useLanguage } from '../contexts/LanguageContext';
import { usePresets } from '../hooks/usePresets';
import { saveGeneration } from '../services/historyService';
import { getCurrentUser } from '../services/authService';

// JSZip is loaded globally via <script> tag in index.html to avoid Vite build errors
declare var JSZip: any;

interface ImageAsset {
    id: string;
    file: File;
    preview: string;
}

interface ExtractedItem {
    name: string;
    type: 'image' | 'text';
    data: string; // Base64 for image, plain string for text
    mimeType?: string;
}

const BATCH_SIZE_LIMIT = 20;
const ITEMS_PER_PAGE = 20;
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

type BatchMode = 'image' | 'text';

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
            case 'STATE_UNSPECIFIED':
            case 'UNSPECIFIED':
            default:
                return t('cloud_status_unspecified');
        }
    };

    const translatedAspectRatios = [
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
    ];

    const { presets } = usePresets();
    const user = getCurrentUser();

    const [mode, setMode] = useState<BatchMode>('image');

    const [config, setConfig] = useState<ProcessingConfig>({
        model: ModelType.GEMINI_3_PRO_IMAGE, 
        temperature: 1.0,
        systemPrompt: presets.length > 0 ? presets[0].content : '',
        userPrompt: '',
        aspectRatio: 'Auto',
        resolution: '4K'
    });

    const [images, setImages] = useState<ImageAsset[]>([]);
    const [textFiles, setTextFiles] = useState<File[]>([]);
    const [filesPerRequest, setFilesPerRequest] = useState<number>(1);
    const [generationsPerPrompt, setGenerationsPerPrompt] = useState<number>(1);
    const [batchPromptsRaw, setBatchPromptsRaw] = useState<string>('');

    const [customJobName, setCustomJobName] = useState<string>('');
    const [isUploading, setIsUploading] = useState(false);
    const [isDownloading, setIsDownloading] = useState(false);
    const [jobs, setJobs] = useState<CloudBatchJob[]>([]);
    const [isJobsLoaded, setIsJobsLoaded] = useState(false);
    
    // Pagination State
    const [currentPage, setCurrentPage] = useState(1);

    // Status Loading State (Map of jobId -> boolean)
    const [statusLoadingMap, setStatusLoadingMap] = useState<Record<string, boolean>>({});

    const [isDraggingOverGallery, setIsDraggingOverGallery] = useState(false);
    const [downloadProgress, setDownloadProgress] = useState<string>("");
    
    // Preview Modal State
    const [previewItems, setPreviewItems] = useState<ExtractedItem[] | null>(null);
    const [activePreviewJob, setActivePreviewJob] = useState<CloudBatchJob | null>(null);
    const [isSavingToGallery, setIsSavingToGallery] = useState(false);

    useEffect(() => {
        if (!user) return;
        
        const loadJobs = async () => {
            try {
                const res = await fetch(`/api/cloud-jobs/${user.id}`);
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
                await fetch(`/api/cloud-jobs/${user.id}`, {
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
                j.status === 'JOB_STATE_PENDING' || 
                j.status === 'JOB_STATE_RUNNING'
            );

            if (activeJobs.length > 0) {
                // Poll active jobs silently
                activeJobs.forEach(job => {
                    checkStatus(job, true); 
                });
            }
        }, 10000); // Check every 10 seconds

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

    const parseBatchPrompts = (rawPrompts: string, fallbackPrompt: string): string[] => {
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

        const singlePrompt = fallbackPrompt.trim();
        return singlePrompt ? [singlePrompt] : [];
    };

    const handleCreateBatch = async () => {
        const parsedPrompts = parseBatchPrompts(batchPromptsRaw, config.userPrompt);

        if (mode === 'image' && images.length === 0 && parsedPrompts.length === 0) return;
        if (mode === 'text' && textFiles.length === 0) return;

        setIsUploading(true);

        try {
            const newCreatedJobs: CloudBatchJob[] = [];
            const timestamp = Date.now();

            if (mode === 'image') {
                const promptsForBatch = parsedPrompts.length > 0 ? parsedPrompts : [''];
                const copiesPerPrompt = Math.max(1, generationsPerPrompt || 1);
                const isProImageModel = config.model === ModelType.GEMINI_3_PRO_IMAGE;
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

                const imageRequests: { custom_id: string; request: any }[] = [];

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
                                generationConfig,
                            };

                            if (isProImageModel) {
                                requestBody.tools = [{ googleSearch: {} }];
                            }

                            imageRequests.push({
                                custom_id: `prompt_${promptIndex + 1}_g${copyIndex + 1}_${timestamp}`,
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
                                    generationConfig,
                                };

                                if (isProImageModel) {
                                    requestBody.tools = [{ googleSearch: {} }];
                                }

                                const baseCustomId = resource.originalName.replace(/\./g, '_DOT_');
                                const promptSuffix = promptsForBatch.length > 1 ? `_p${promptIndex + 1}` : '';

                                imageRequests.push({
                                    custom_id: `${baseCustomId}${promptSuffix}_g${copyIndex + 1}_${resourceIndex + 1}`,
                                    request: requestBody,
                                });
                            }
                        });
                    });
                }

                for (let i = 0; i < imageRequests.length; i += BATCH_SIZE_LIMIT) {
                    const reqChunk = imageRequests.slice(i, i + BATCH_SIZE_LIMIT);
                    const chunkIndex = Math.floor(i / BATCH_SIZE_LIMIT) + 1;
                    const startIndex = i + 1;
                    const endIndex = i + reqChunk.length;

                    const displayJobName = customJobName
                        ? `${customJobName} (${startIndex}-${endIndex})`
                        : formatText(t('cloud_default_image_job_name'), { timestamp, page: chunkIndex });

                    const batchJob = await createBatchJobFromRequests(reqChunk, {
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
                        model: config.model
                    });
                }

                setImages([]);
            } else {
                // Text Batch Logic
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
                        if (config.systemPrompt) {
                            generationConfig.systemInstruction = config.systemPrompt;
                        }

                        const requestBody = {
                            contents: [{ parts: [{ text: textPrompt }] }],
                            generationConfig
                        };

                        const safeName = filenames.join('_').substring(0, 50).replace(/[^a-zA-Z0-9_\-.]/g, '_') || 'text';
                        const promptSuffix = promptsForBatch.length > 1 ? `_p${promptIndex + 1}` : '';
                        const customId = `${safeName}${promptSuffix}_${Date.now()}`;

                        requests.push({
                            custom_id: customId,
                            request: requestBody
                        });
                    });
                }

                // 3. Create generic batch job (assume one batch for all text files unless massive)
                // We'll split requests into chunks if too many, just in case (e.g. 500 requests per batch)
                const REQ_CHUNK_SIZE = 500;
                for (let i = 0; i < requests.length; i += REQ_CHUNK_SIZE) {
                    const reqChunk = requests.slice(i, i + REQ_CHUNK_SIZE);
                    const chunkIndex = Math.floor(i / REQ_CHUNK_SIZE) + 1;
                    
                    let displayJobName = customJobName 
                        ? `${customJobName} (Text P${chunkIndex})`
                        : formatText(t('cloud_default_text_job_name'), { timestamp, page: chunkIndex });

                    const batchJob = await createBatchJobFromRequests(reqChunk, {
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
                        model: config.model
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
            const statusRes = await getBatchJobStatus(job.id);
            const outputFile = extractOutputFile(statusRes);
            
            const updatedJob = { 
                ...job, 
                status: statusRes.state, 
                outputFileUri: outputFile || job.outputFileUri,
                updatedAt: Date.now()
            };
            
            setJobs(prevJobs => prevJobs.map(j => j.id === job.id ? updatedJob : j));
            
            return updatedJob;
        } catch (error) {
            console.error("Failed to check status", error);
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
            
            const textContent = await downloadBatchResults(currentJob.outputFileUri);
            
            if (textContent.trim().startsWith('<')) {
                throw new Error(t('cloud_html_instead_json'));
            }

            const lines = textContent.split('\n');
            setDownloadProgress(formatText(t('cloud_parsing_items'), { count: lines.length }));
            
            const extractedItems: ExtractedItem[] = [];
            
            lines.forEach((line: string, index: number) => {
                if (!line.trim()) return;
                try {
                    const json = JSON.parse(line);
                    const candidates = json.response?.candidates || [];
                    
                    // Base ID extraction
                    let idName = `result_${index + 1}`;
                    if (json.custom_id) {
                         // Decoded dot
                         const decodedId = json.custom_id.replace(/_DOT_/g, '.');
                         idName = decodedId;
                    }

                    if (candidates.length > 0) {
                        const parts = candidates[0].content?.parts || [];
                        let hasImage = false;
                        
                        // Check for Images
                        for (const part of parts) {
                            const inlineData = part.inlineData || part.inline_data;
                            if (inlineData && inlineData.data) {
                                hasImage = true;
                                const data = inlineData.data;
                                const mimeType = inlineData.mimeType || inlineData.mime_type || 'image/png';
                                
                                let ext = 'png';
                                if (mimeType.includes('jpeg') || mimeType.includes('jpg')) ext = 'jpg';
                                
                                // Ensure filename has extension
                                let fileName = idName;
                                if (!fileName.toLowerCase().endsWith(`.${ext}`)) {
                                     fileName = `${fileName}.${ext}`;
                                }

                                extractedItems.push({
                                    name: fileName,
                                    type: 'image',
                                    data: data,
                                    mimeType: mimeType
                                });
                            }
                        }

                        // Check for Text if no images found (or even if found, but usually distinct)
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
                                extractedItems.push({
                                    name: fileName,
                                    type: 'text',
                                    data: textContent
                                });
                            }
                        }
                    }
                } catch (e) {
                    console.error("Error parsing line " + index, e);
                }
            });

            if (extractedItems.length === 0) {
                alert(t('cloud_download_empty'));
                setIsDownloading(false);
                setDownloadProgress("");
                return;
            }

            setActivePreviewJob(job);
            setPreviewItems(extractedItems);
            setDownloadProgress("");

        } catch (error: any) {
            alert(`${t('cloud_download_failed')} ${error.message}`);
            setDownloadProgress("");
        } finally {
            setIsDownloading(false);
        }
    };

    const handleSaveToGallery = async () => {
        if (!previewItems || !user) return;
        setIsSavingToGallery(true);
        
        try {
            let savedCount = 0;
            for (const item of previewItems) {
                if (item.type === 'image') {
                    await saveGeneration(
                        user.id,
                        'cloud',
                        activePreviewJob?.model || 'unknown',
                        formatText(t('cloud_history_result_image_prompt'), { jobId: activePreviewJob?.displayId || '' }),
                        `data:${item.mimeType};base64,${item.data}`,
                        undefined,
                        undefined
                    );
                } else {
                     await saveGeneration(
                        user.id,
                        'cloud',
                        activePreviewJob?.model || 'unknown',
                        formatText(t('cloud_history_result_text_prompt'), { name: item.name }),
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
        
        try {
            const safeDisplayName = activePreviewJob.displayId.replace(/\s+/g, '_').replace(/[\(\)]/g, '');
            // @ts-ignore
            const zip = new JSZip();
            
            previewItems.forEach((item) => {
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
        try {
            const statusRes = await getBatchJobStatus(job.id);
            const outputFile = extractOutputFile(statusRes);
            const debugInfo = {
                appVersion: "1.2.0-cloud-text",
                jobId: job.id,
                uiStatus: job.status,
                extractedOutputFileUri: outputFile,
                fullApiResponse: statusRes
            };
            const text = JSON.stringify(debugInfo, null, 2);
            await navigator.clipboard.writeText(text);
            alert(t('cloud_debug_copied'));
        } catch (error: any) {
            alert(`${t('cloud_debug_failed')} ${error.message}`);
        }
    };

    const handlePresetChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const preset = presets.find(p => p.name === e.target.value);
        if (preset) {
            setConfig(prev => ({ ...prev, systemPrompt: preset.content }));
        } else {
            setConfig(prev => ({ ...prev, systemPrompt: '' }));
        }
    };

    // --- Pagination Logic ---
    const indexOfLastItem = currentPage * ITEMS_PER_PAGE;
    const indexOfFirstItem = indexOfLastItem - ITEMS_PER_PAGE;
    const currentJobs = jobs.slice(indexOfFirstItem, indexOfLastItem);
    const totalPages = Math.ceil(jobs.length / ITEMS_PER_PAGE);
    const parsedPromptsCount = parseBatchPrompts(batchPromptsRaw, config.userPrompt).length;
    const hasPromptForImageBatch = parsedPromptsCount > 0;
    const totalImageRequestsEstimate = parsedPromptsCount > 0 ? parsedPromptsCount * Math.max(1, generationsPerPrompt || 1) : Math.max(1, generationsPerPrompt || 1);

    const paginate = (pageNumber: number) => setCurrentPage(pageNumber);

    return (
        <div className="space-y-8">
            {/* --- PREVIEW MODAL --- */}
            {previewItems && activePreviewJob && (
                <div className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
                    <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-6xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
                        <div className="p-6 border-b border-slate-700 flex justify-between items-center bg-slate-800/50">
                            <div>
                                <h2 className="text-xl font-bold text-white flex items-center gap-3">
                                    <i className="fas fa-check-double text-blue-500"></i>
                                    {t('cloud_preview_title')}
                                </h2>
                                <p className="text-sm text-slate-400 mt-1">
                                    {activePreviewJob.displayId} — {previewItems.length} {t('items_count')}
                                </p>
                            </div>
                            <button 
                                onClick={() => setPreviewItems(null)}
                                className="w-10 h-10 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition-all"
                            >
                                <i className="fas fa-times text-xl"></i>
                            </button>
                        </div>

                        <div className="flex-1 overflow-y-auto p-6 bg-slate-950/50 custom-scrollbar">
                            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                                {previewItems.map((item, idx) => (
                                    <div key={idx} className="aspect-square rounded-xl overflow-hidden border border-slate-700 bg-slate-800 relative group flex flex-col">
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
                        </div>

                        <div className="p-6 border-t border-slate-700 bg-slate-800/50 flex flex-col sm:flex-row justify-end gap-4">
                            <div className="mr-auto text-xs text-slate-400 flex items-center">
                                {t('cloud_tip_zip_names')}
                            </div>
                            
                            <Button variant="secondary" onClick={handleZipDownload} icon="fa-file-zipper">
                                {t('download_zip')}
                            </Button>
                            
                            <Button variant="success" onClick={handleSaveToGallery} isLoading={isSavingToGallery} icon="fa-save">
                                {t('cloud_save_to_gallery')}
                            </Button>
                        </div>
                    </div>
                </div>
            )}

            <div className="bg-slate-800/50 backdrop-blur-sm p-6 rounded-2xl border border-slate-700">
                <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-4">
                        <div className="bg-blue-600/20 p-2 rounded-lg">
                             <i className="fas fa-cloud text-blue-500"></i>
                        </div>
                        <h2 className="text-xl font-bold text-white">{t('cloud_setup_title')}</h2>
                    </div>

                    {/* Mode Switcher */}
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
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                    <div className="space-y-4">
                        <Select label={t('model_label')} options={MODELS} value={config.model} onChange={e => setConfig({ ...config, model: e.target.value as ModelType })} />
                        
                        {mode === 'image' && (
                            <>
                                <Select label={t('resolution_label')} options={RESOLUTIONS} value={config.resolution} onChange={e => setConfig({ ...config, resolution: e.target.value })} />
                                <Select label={t('ar_label')} options={translatedAspectRatios} value={config.aspectRatio} onChange={e => setConfig({ ...config, aspectRatio: e.target.value })} />
                                <div>
                                    <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 ml-1">{t('generations_per_prompt_label')}</label>
                                    <input
                                        type="number"
                                        min="1"
                                        max="50"
                                        value={generationsPerPrompt}
                                        onChange={(e) => setGenerationsPerPrompt(Math.min(50, Math.max(1, parseInt(e.target.value) || 1)))}
                                        className="w-full bg-slate-800 border border-slate-700 text-slate-100 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500/50 placeholder-slate-600"
                                    />
                                    <p className="text-[10px] text-slate-500 mt-1 ml-1">
                                        {formatText(t('generations_per_prompt_hint'), { count: generationsPerPrompt })}
                                    </p>
                                </div>
                            </>
                        )}
                        
                        {mode === 'text' && (
                             <div>
                                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 ml-1">{t('files_per_request_label')}</label>
                                <input 
                                    type="number" 
                                    min="1" 
                                    max="50"
                                    value={filesPerRequest}
                                    onChange={(e) => setFilesPerRequest(Math.max(1, parseInt(e.target.value) || 1))}
                                    className="w-full bg-slate-800 border border-slate-700 text-slate-100 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500/50 placeholder-slate-600"
                                />
                                <p className="text-[10px] text-slate-500 mt-1 ml-1">{t('files_per_request_hint')}</p>
                             </div>
                        )}

                        <div>
                            <label className="block text-sm font-medium text-slate-300 mb-2">{t('preset_label')}</label>
                            <select className="w-full bg-slate-800 border border-slate-700 text-slate-100 rounded-lg px-4 py-3 appearance-none focus:outline-none focus:ring-2 focus:ring-blue-500" onChange={handlePresetChange} defaultValue="">
                                <option value="">{t('load_preset_placeholder')}</option>
                                {presets.map(p => ( <option key={p.name} value={p.name}>{p.name}</option> ))}
                            </select>
                        </div>
                        <div>
                             <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 ml-1">{t('job_name_optional')}</label>
                             <input type="text" className="w-full bg-slate-800 border border-slate-700 text-slate-100 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500/50 placeholder-slate-600" placeholder={t('job_name_placeholder')} value={customJobName} onChange={(e) => setCustomJobName(e.target.value)} />
                        </div>
                    </div>
                    
                    <div className="h-full flex flex-col gap-4">
                         <TextArea label={t('system_instr_label')} value={config.systemPrompt} onChange={e => setConfig({ ...config, systemPrompt: e.target.value })} className="flex-1" />
                         <TextArea label={t('user_prompt_label')} value={config.userPrompt} onChange={e => setConfig({ ...config, userPrompt: e.target.value })} className="flex-1" placeholder={mode === 'text' ? t('analyze_files_placeholder') : t('image_gen_placeholder')} />
                                 <TextArea
                                     label={t('batch_prompts_label')}
                                     value={batchPromptsRaw}
                                     onChange={e => setBatchPromptsRaw(e.target.value)}
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

                <div className={`bg-slate-800/50 backdrop-blur-sm p-6 rounded-2xl border transition-colors mb-6 ${isDraggingOverGallery ? 'border-blue-500 bg-blue-500/10' : 'border-slate-700'}`} onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}>
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

                <div className="flex justify-between items-center">
                    <span className="text-slate-400 text-sm">
                        {mode === 'image' ? images.length : textFiles.length} {t('files_queued')}
                    </span>
                    <Button 
                        variant="success" 
                        onClick={handleCreateBatch} 
                        isLoading={isUploading} 
                        disabled={(mode === 'image' && images.length === 0 && !hasPromptForImageBatch) || (mode === 'text' && textFiles.length === 0)} 
                        icon="fa-cloud-upload-alt"
                    >
                        {t('upload_create_btn')}
                    </Button>
                </div>
            </div>

            <div className="bg-slate-800/50 backdrop-blur-sm p-6 rounded-2xl border border-slate-700">
                <div className="flex justify-between items-center mb-6">
                    <h2 className="text-xl font-semibold text-white">{t('batch_jobs_title')}</h2>
                    <button onClick={handleClearHistory} className="text-xs text-red-400 hover:text-red-300">{t('clear_history')}</button>
                </div>

                <div className="space-y-3">
                    {currentJobs.length === 0 ? (
                        <div className="text-center py-8 text-slate-500">{t('no_jobs')}</div>
                    ) : (
                        currentJobs.map(job => {
                            const isSucceeded = job.status.includes('SUCCEEDED');
                            const isPending = job.status.includes('PENDING') || job.status.includes('RUNNING');
                            return (
                                <div key={job.id} className="bg-slate-800 border border-slate-700 p-4 rounded-xl flex flex-col md:flex-row items-center justify-between gap-4">
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-3">
                                            <span className="font-bold text-white truncate" title={job.displayId}>{job.displayId}</span>
                                            <span className={`text-xs px-2 py-0.5 rounded shrink-0 ${isSucceeded ? 'bg-emerald-900 text-emerald-300' : 'bg-slate-700 text-slate-300'}`}>
                                                {getLocalizedJobStatus(job.status)}
                                            </span>
                                        </div>
                                        <div className="text-[10px] text-slate-500 mt-1">{job.createdAt} • {job.id.split('/').pop()}</div>
                                    </div>

                                    <div className="flex gap-2 items-center shrink-0">
                                        {isPending && <Button variant="danger" className="py-1 px-3 text-xs h-8" onClick={() => handleCancelJob(job.id)} icon="fa-stop">{t('cancel')}</Button>}
                                        <Button variant="secondary" className="py-1 px-3 text-xs h-8" onClick={() => checkStatus(job)} icon="fa-sync" isLoading={statusLoadingMap[job.id]} />
                                        <Button variant="secondary" className="py-1 px-3 text-xs h-8" onClick={() => handleDebug(job)} icon="fa-bug" />
                                        {isSucceeded && <Button variant="primary" className="py-1 px-3 text-xs h-8" onClick={() => handleFetchResults(job)} isLoading={isDownloading} icon="fa-download">{t('cloud_preview_btn')}</Button>}
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
