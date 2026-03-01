
import React, { useState, useEffect } from 'react';
import { Select, TextArea } from '../components/ui/InputComponents';
import Button from '../components/ui/Button';
import FileUploader from '../components/ui/FileUploader';
import ImageViewer from '../components/ui/ImageViewer';
import CompareViewer from '../components/ui/CompareViewer';
import NumberStepper from '../components/ui/NumberStepper';
import { generateContent, downloadBase64Image, fileToText } from '../services/geminiService';
import { ProcessingConfig, ModelType, BatchFile, BatchTextGroup } from '../types';
import { MODELS, RESOLUTIONS, ASPECT_RATIOS, MODEL_PRICING } from '../constants';
import { useLanguage } from '../contexts/LanguageContext';
import { usePresets } from '../hooks/usePresets';
import { saveGeneration } from '../services/historyService';
import { getCurrentUser } from '../services/authService';
import { getSystemSettings, SystemSettings } from '../services/settingsService';

declare var JSZip: any;

type BatchMode = 'image' | 'text';

const BatchProcessor: React.FC = () => {
    const { t } = useLanguage();
    const formatText = (template: string, params: Record<string, string | number>) => {
        return Object.entries(params).reduce((acc, [key, value]) => {
            return acc.replaceAll(`{${key}}`, String(value));
        }, template);
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
        model: ModelType.GEMINI_2_5_FLASH_IMAGE,
        temperature: 1.0,
        systemPrompt: presets.length > 0 ? presets[0].content : '',
        userPrompt: '',
        aspectRatio: 'Auto',
        resolution: '4K'
    });

    // Image Batch State
    const [files, setFiles] = useState<BatchFile[]>([]);
    
    // Text Batch State
    const [pendingTextFiles, setPendingTextFiles] = useState<File[]>([]);
    const [filesPerRequest, setFilesPerRequest] = useState<number>(1);
    const [textGroups, setTextGroups] = useState<BatchTextGroup[]>([]);
    const [generationsPerPrompt, setGenerationsPerPrompt] = useState<number>(1);
    const [uiSettings, setUiSettings] = useState<SystemSettings>(getSystemSettings());

    const [isBatchRunning, setIsBatchRunning] = useState(false);
    const [viewingImage, setViewingImage] = useState<string | null>(null);
    const [compareData, setCompareData] = useState<{original: string, result: string} | null>(null);
    const [showErrorsOnly, setShowErrorsOnly] = useState(false);

    // Listen for settings changes
    useEffect(() => {
        const handleSettingsChange = () => setUiSettings(getSystemSettings());
        window.addEventListener('system-settings-changed', handleSettingsChange);
        return () => window.removeEventListener('system-settings-changed', handleSettingsChange);
    }, []);

    // Load state
    useEffect(() => {
        const storedFiles = localStorage.getItem('local_batch_files');
        if (storedFiles) {
            try {
                const parsed = JSON.parse(storedFiles);
                setFiles(parsed.map((f: any) => ({
                    ...f,
                    preview: f.resultImage || '', 
                    file: new File([], f.fileName || 'restored-file', { type: f.fileType || 'application/octet-stream' }) 
                })));
            } catch (e) {
                console.error("Failed to load batch state", e);
            }
        }
    }, []);

    // Save state
    useEffect(() => {
        const toStore = files.map(f => ({
            id: f.id,
            status: f.status,
            resultImage: f.resultImage,
            resultText: f.resultText,
            error: f.error,
            fileName: f.file.name,
            fileType: f.file.type,
            isPromptOnlyTask: f.isPromptOnlyTask
        }));
        try {
            localStorage.setItem('local_batch_files', JSON.stringify(toStore));
        } catch (e) {
            console.warn("Quota exceeded for local storage batch persistence");
        }
    }, [files]);

    const handleFilesSelect = (selectedFiles: File[]) => {
        if (mode === 'image') {
            const newBatchFiles: BatchFile[] = selectedFiles.map(file => ({
                id: Math.random().toString(36).substring(7),
                file,
                preview: URL.createObjectURL(file),
                status: 'pending'
            }));
            setFiles(prev => [...prev, ...newBatchFiles]);
        } else {
            // Text Mode
            setPendingTextFiles(prev => [...prev, ...selectedFiles]);
        }
    };

    const removeFile = (id: string) => {
        setFiles(prev => prev.filter(f => f.id !== id));
    };

    const removeTextFile = (index: number) => {
        setPendingTextFiles(prev => prev.filter((_, i) => i !== index));
    };

    const removeTextGroup = (id: string) => {
        setTextGroups(prev => prev.filter(g => g.id !== id));
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

    const runBatch = async () => {
        setIsBatchRunning(true);
        const parsedPrompts = parseBatchPrompts(config.userPrompt);
        const promptsForBatch = parsedPrompts.length > 0 ? parsedPrompts : [''];
        
        if (mode === 'image') {
            const pendingFiles = files.filter(f => (f.status === 'pending' || f.status === 'failed') && (f.isPromptOnlyTask || f.file.size > 0 || f.preview.startsWith('blob:')));
            const copiesPerPrompt = Math.max(1, generationsPerPrompt || 1);
            const shouldExpandVariants = promptsForBatch.length > 1 || copiesPerPrompt > 1;

            let queueToProcess = pendingFiles;
            const expandableSources = pendingFiles.filter(f => !f.isVariantTask && !f.isPromptOnlyTask);

            if (shouldExpandVariants && expandableSources.length > 0) {
                const makeVariantName = (name: string, promptIndex: number, generationIndex: number) => {
                    const dotIndex = name.lastIndexOf('.');
                    const baseName = dotIndex > 0 ? name.substring(0, dotIndex) : name;
                    const extension = dotIndex > 0 ? name.substring(dotIndex) : '';
                    const promptSuffix = promptsForBatch.length > 1 ? `_p${promptIndex}` : '';
                    const genSuffix = copiesPerPrompt > 1 ? `_g${generationIndex}` : '';
                    return `${baseName}${promptSuffix}${genSuffix}${extension}`;
                };

                const expandedVariants: BatchFile[] = expandableSources.flatMap(source => {
                    return promptsForBatch.flatMap((prompt, promptIdx) => {
                        return Array.from({ length: copiesPerPrompt }, (_, generationIdx) => {
                            const variantName = makeVariantName(source.file.name, promptIdx + 1, generationIdx + 1);
                            const variantFile = new File([source.file], variantName, { type: source.file.type });

                            return {
                                id: Math.random().toString(36).substring(2, 11),
                                file: variantFile,
                                preview: source.preview,
                                status: 'pending',
                                batchPrompt: prompt,
                                promptIndex: promptIdx + 1,
                                generationIndex: generationIdx + 1,
                                isVariantTask: true,
                            };
                        });
                    });
                });

                const sourceIds = new Set(expandableSources.map(f => f.id));
                const existingVariants = pendingFiles.filter(f => f.isVariantTask);
                queueToProcess = [...existingVariants, ...expandedVariants];

                setFiles(prev => [
                    ...prev.filter(f => !sourceIds.has(f.id)),
                    ...prev.filter(f => sourceIds.has(f.id) && f.status === 'completed'),
                    ...queueToProcess,
                ]);
            }

            if (queueToProcess.length === 0 && config.userPrompt.trim()) {
                const promptOnlyPreview = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==';
                const promptOnlyTasks: BatchFile[] = promptsForBatch.flatMap((prompt, promptIdx) => {
                    return Array.from({ length: copiesPerPrompt }, (_, generationIdx) => ({
                        id: Math.random().toString(36).substring(2, 11),
                        file: new File([], `prompt-only_p${promptIdx + 1}_g${generationIdx + 1}.txt`, { type: 'text/plain' }),
                        preview: promptOnlyPreview,
                        status: 'pending',
                        batchPrompt: prompt,
                        promptIndex: promptIdx + 1,
                        generationIndex: generationIdx + 1,
                        isVariantTask: true,
                        isPromptOnlyTask: true,
                    }));
                });

                queueToProcess = promptOnlyTasks;
                setFiles(prev => [...prev, ...promptOnlyTasks]);
            }

            for (const batchFile of queueToProcess) {
                if (!batchFile.isPromptOnlyTask && batchFile.file.size === 0 && !batchFile.preview.startsWith('blob:')) continue; 

                setFiles(prev => prev.map(f => f.id === batchFile.id ? { ...f, status: 'processing' } : f));

                try {
                    const taskConfig: ProcessingConfig = {
                        ...config,
                        userPrompt: batchFile.batchPrompt ?? config.userPrompt,
                    };

                    const result = await generateContent(taskConfig, batchFile.isPromptOnlyTask ? [] : (batchFile.file ? [batchFile.file] : []));
                    
                    if (user && result.image) {
                        let cost = 0;
                        // @ts-ignore
                        if (result.usageMetadata && MODEL_PRICING[taskConfig.model]) {
                             // @ts-ignore
                             const p = MODEL_PRICING[taskConfig.model];
                             // @ts-ignore
                             cost = (result.usageMetadata.promptTokenCount * p.input) + (result.usageMetadata.candidatesTokenCount * p.output);
                        }
                        if (result.image && MODEL_PRICING[taskConfig.model]?.perImage) {
                            cost += MODEL_PRICING[taskConfig.model]!.perImage!;
                        }

                        await saveGeneration(
                            user.id, 
                            'batch', 
                            taskConfig.model, 
                            taskConfig.userPrompt, 
                            result.image, 
                            result.text,
                            taskConfig.aspectRatio,
                            // @ts-ignore
                            result.usageMetadata,
                            cost,
                            { count: batchFile.isPromptOnlyTask ? 0 : 1 },
                            taskConfig.resolution
                        );
                    }

                    setFiles(prev => prev.map(f => f.id === batchFile.id ? { 
                        ...f, 
                        status: 'completed',
                        resultImage: result.image,
                        resultText: result.text
                    } : f));

                } catch (error: any) {
                    setFiles(prev => prev.map(f => f.id === batchFile.id ? { 
                        ...f, 
                        status: 'failed',
                        error: error.message 
                    } : f));
                }
            }
        } else {
            // Text Batch Mode
            // 1. Group files based on `filesPerRequest`
            if (pendingTextFiles.length > 0) {
                const chunks: File[][] = [];
                for (let i = 0; i < pendingTextFiles.length; i += filesPerRequest) {
                    chunks.push(pendingTextFiles.slice(i, i + filesPerRequest));
                }
                
                // Create Groups in UI state (chunk × prompt)
                const newGroups: BatchTextGroup[] = chunks.flatMap(chunk => {
                    return promptsForBatch.map((prompt, promptIndex) => ({
                        id: Math.random().toString(36).substring(7),
                        files: chunk,
                        status: 'pending',
                        batchPrompt: prompt,
                        promptIndex: promptIndex + 1,
                    }));
                });
                
                setTextGroups(prev => [...prev, ...newGroups]);
                setPendingTextFiles([]); // Clear staging area

                // 2. Process newly created groups (and any retrying ones)
                const queueToProcess = [...textGroups.filter(g => g.status === 'pending' || g.status === 'failed'), ...newGroups];
                
                for (const group of queueToProcess) {
                    // Update Status to Processing
                    setTextGroups(prev => prev.map(g => g.id === group.id ? { ...g, status: 'processing' } : g));

                    try {
                        // Read all files in group
                        const textFilesData: {name: string, content: string}[] = [];
                        for(const file of group.files) {
                            const content = await fileToText(file);
                            textFilesData.push({ name: file.name, content });
                        }

                        // Send to API
                        const taskConfig: ProcessingConfig = {
                            ...config,
                            userPrompt: group.batchPrompt ?? config.userPrompt,
                        };

                        const result = await generateContent(taskConfig, [], textFilesData);

                        if (user) {
                            let cost = 0;
                            // @ts-ignore
                            if (result.usageMetadata && MODEL_PRICING[taskConfig.model]) {
                                // @ts-ignore
                                const p = MODEL_PRICING[taskConfig.model];
                                // @ts-ignore
                                cost = (result.usageMetadata.promptTokenCount * p.input) + (result.usageMetadata.candidatesTokenCount * p.output);
                            }

                            await saveGeneration(
                                user.id, 
                                'batch', 
                                taskConfig.model, 
                                taskConfig.userPrompt, 
                                undefined, 
                                result.text,
                                taskConfig.aspectRatio,
                                // @ts-ignore
                                result.usageMetadata,
                                cost
                            );
                        }

                        // Complete
                        setTextGroups(prev => prev.map(g => g.id === group.id ? { 
                            ...g, 
                            status: 'completed',
                            resultText: result.text
                        } : g));

                    } catch (error: any) {
                        setTextGroups(prev => prev.map(g => g.id === group.id ? { 
                            ...g, 
                            status: 'failed',
                            error: error.message 
                        } : g));
                    }
                }
            } else {
                // Just retry existing groups if any
                 const retryQueue = textGroups.filter(g => g.status === 'pending' || g.status === 'failed');
                 for (const group of retryQueue) {
                    setTextGroups(prev => prev.map(g => g.id === group.id ? { ...g, status: 'processing' } : g));
                    try {
                        const textFilesData: {name: string, content: string}[] = [];
                        for(const file of group.files) {
                            const content = await fileToText(file);
                            textFilesData.push({ name: file.name, content });
                        }
                        const taskConfig: ProcessingConfig = {
                            ...config,
                            userPrompt: group.batchPrompt ?? config.userPrompt,
                        };

                        const result = await generateContent(taskConfig, [], textFilesData);
                        if (user) {
                             let cost = 0;
                            // @ts-ignore
                            if (result.usageMetadata && MODEL_PRICING[taskConfig.model]) {
                                // @ts-ignore
                                const p = MODEL_PRICING[taskConfig.model];
                                // @ts-ignore
                                cost = (result.usageMetadata.promptTokenCount * p.input) + (result.usageMetadata.candidatesTokenCount * p.output);
                            }
                            await saveGeneration(user.id, 'batch', taskConfig.model, taskConfig.userPrompt, undefined, result.text, taskConfig.aspectRatio, 
                                // @ts-ignore
                                result.usageMetadata, cost
                            );
                        }
                        setTextGroups(prev => prev.map(g => g.id === group.id ? { ...g, status: 'completed', resultText: result.text } : g));
                    } catch (error: any) {
                        setTextGroups(prev => prev.map(g => g.id === group.id ? { ...g, status: 'failed', error: error.message } : g));
                    }
                 }
            }
        }
        setIsBatchRunning(false);
    };

    const clearCompleted = () => {
        if (mode === 'image') {
            setFiles(prev => prev.filter(f => f.status !== 'completed'));
        } else {
            setTextGroups(prev => prev.filter(g => g.status !== 'completed'));
        }
    };

    const handleDownloadAll = async () => {
        if (mode === 'image') {
            const completedFiles = files.filter(f => f.status === 'completed' && f.resultImage);
            if (completedFiles.length === 0) return;

            try {
                // @ts-ignore
                const zip = new JSZip();
                const folder = zip.folder("BatchResults");

                completedFiles.forEach(f => {
                    if (f.resultImage) {
                        const base64Data = f.resultImage.split(',')[1];
                        const originalName = f.file.name.substring(0, f.file.name.lastIndexOf('.')) || f.file.name;
                        folder.file(`${originalName}_processed.png`, base64Data, { base64: true });
                    }
                });

                const content = await zip.generateAsync({ type: "blob" });
                const url = window.URL.createObjectURL(content);
                const a = document.createElement('a');
                a.href = url;
                a.download = `BatchProcess_${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.zip`;
                document.body.appendChild(a);
                a.click();
                window.URL.revokeObjectURL(url);
                document.body.removeChild(a);

            } catch (e) {
                alert("Failed to create ZIP archive.");
            }
        } else {
            // Text Download
            const completedGroups = textGroups.filter(g => g.status === 'completed' && g.resultText);
            if (completedGroups.length === 0) return;

             try {
                // @ts-ignore
                const zip = new JSZip();
                const folder = zip.folder("BatchTextResults");

                completedGroups.forEach((g, idx) => {
                    const filenames = g.files.map(f => f.name).join('_');
                    const safeName = filenames.substring(0, 50); // Truncate if too long
                    folder.file(`${safeName}_result_${idx}.txt`, g.resultText);
                });

                const content = await zip.generateAsync({ type: "blob" });
                const url = window.URL.createObjectURL(content);
                const a = document.createElement('a');
                a.href = url;
                a.download = `TextBatch_${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.zip`;
                document.body.appendChild(a);
                a.click();
                window.URL.revokeObjectURL(url);
                document.body.removeChild(a);

            } catch (e) {
                alert("Failed to create ZIP archive.");
            }
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

    // Separate lists for UI
    const parsedPrompts = parseBatchPrompts(config.userPrompt);
    const promptsCount = Math.max(1, parsedPrompts.length);

    const pendingList = mode === 'image' 
        ? files.filter(f => {
            const isInQueue = f.status === 'pending' || f.status === 'processing' || f.status === 'failed';
            return isInQueue && (!showErrorsOnly || f.status === 'failed');
        })
        : []; // For text, we handle staging in `pendingTextFiles` and processing in `textGroups`

    const completedList = mode === 'image' 
        ? files.filter(f => f.status === 'completed')
        : textGroups.filter(g => g.status === 'completed');

    const hasItemsToProcess = mode === 'image' 
        ? files.some(f => f.status === 'pending' || f.status === 'failed') || !!config.userPrompt.trim()
        : (pendingTextFiles.length > 0 || textGroups.some(g => g.status === 'pending' || g.status === 'failed'));

    const localImageRequestsEstimate = files.filter(f => f.status === 'pending' || f.status === 'failed').length * promptsCount * Math.max(1, generationsPerPrompt || 1);
    const localTextGroupsEstimate = (pendingTextFiles.length > 0 ? Math.ceil(pendingTextFiles.length / Math.max(1, filesPerRequest)) : 0) * promptsCount;

    return (
        <div className="space-y-8 relative max-w-7xl mx-auto pb-12">
            {viewingImage && (
                <ImageViewer src={viewingImage} onClose={() => setViewingImage(null)} />
            )}
            {compareData && (
                <CompareViewer 
                    original={compareData.original} 
                    result={compareData.result} 
                    onClose={() => setCompareData(null)} 
                />
            )}

            {/* Config & Upload Section */}
            <div className="bg-slate-800/50 backdrop-blur-sm p-6 lg:p-7 rounded-2xl border border-slate-700">
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-7">
                    <div className="flex items-center gap-4">
                        <div className="bg-blue-600/20 p-2 rounded-lg">
                             <i className="fas fa-layer-group text-blue-500"></i>
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-white">{t('batch_queue_title')}</h2>
                            <p className="text-xs text-slate-400 mt-1">
                                {mode === 'image' ? t('cloud_mode_image_desc') : t('cloud_mode_text_desc')}
                            </p>
                        </div>
                    </div>
                     
                     {/* Mode Switcher */}
                     <div className="flex bg-slate-800 rounded-lg p-1 border border-slate-700 self-start lg:self-auto">
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

                <div className="grid grid-cols-1 xl:grid-cols-12 gap-7 mb-7">
                    <div className="xl:col-span-5 bg-slate-900/40 border border-slate-700 rounded-2xl p-5">
                        <h3 className="text-base font-semibold text-white mb-4 flex items-center gap-2">
                            <i className="fas fa-sliders-h text-blue-400"></i>
                            {t('cloud_section_model')}
                        </h3>

                        <div className="space-y-5">
                            <Select 
                                label={t('model_label')}
                                options={MODELS} 
                                value={config.model}
                                onChange={e => setConfig({ ...config, model: e.target.value as ModelType })}
                            />
                         
                            {mode === 'image' && (
                                <>
                                    <Select 
                                        label={t('resolution_label')}
                                        options={RESOLUTIONS} 
                                        value={config.resolution}
                                        onChange={e => setConfig({ ...config, resolution: e.target.value })}
                                    />
                                    <Select 
                                        label={t('ar_label')}
                                        options={translatedAspectRatios} 
                                        value={config.aspectRatio}
                                        onChange={e => setConfig({ ...config, aspectRatio: e.target.value })}
                                    />
                                    <div>
                                        <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 ml-1">{t('generations_per_prompt_label')}</label>
                                        <NumberStepper
                                            value={generationsPerPrompt}
                                            onChange={setGenerationsPerPrompt}
                                            min={1}
                                            max={10}
                                            className="max-w-[280px]"
                                            decreaseAriaLabel="Decrease generations per prompt"
                                            increaseAriaLabel="Increase generations per prompt"
                                        />
                                        <p className="text-[10px] text-slate-500 mt-1 ml-1">
                                            {formatText(t('generations_per_prompt_hint'), { count: Math.max(1, generationsPerPrompt || 1) })}
                                        </p>
                                    </div>
                                    {uiSettings.showImageSearch && (
                                        <div>
                                            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 ml-1">
                                                {t('image_search_label')}
                                            </label>
                                            <button
                                                type="button"
                                                onClick={() => setConfig(prev => ({ ...prev, useImageSearch: !prev.useImageSearch }))}
                                                className={`
                                                    w-full max-w-[280px] flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200 border
                                                    ${config.useImageSearch 
                                                        ? 'bg-gradient-to-r from-blue-600 to-cyan-500 text-white border-blue-400/50 shadow-lg shadow-blue-500/20' 
                                                        : 'bg-slate-800/50 text-slate-400 border-slate-700/50 hover:border-slate-600 hover:text-slate-300'}
                                                    ${config.model !== ModelType.GEMINI_3_1_PRO_IMAGE ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}
                                                `}
                                                disabled={config.model !== ModelType.GEMINI_3_1_PRO_IMAGE}
                                                title={t('image_search_tooltip')}
                                            >
                                                <i className={`fas fa-search-plus ${config.useImageSearch ? 'text-white' : 'text-slate-500'}`}></i>
                                                <span>{config.useImageSearch ? 'ON' : 'OFF'}</span>
                                            </button>
                                        </div>
                                    )}
                                    {uiSettings.showGoogleSearch && (
                                        <div>
                                            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 ml-1">
                                                {t('google_search_label')}
                                            </label>
                                            <button
                                                type="button"
                                                onClick={() => setConfig(prev => ({ ...prev, useGoogleSearch: !prev.useGoogleSearch }))}
                                                className={`
                                                    w-full max-w-[280px] flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200 border
                                                    ${config.useGoogleSearch 
                                                        ? 'bg-gradient-to-r from-emerald-600 to-teal-500 text-white border-emerald-400/50 shadow-lg shadow-emerald-500/20' 
                                                        : 'bg-slate-800/50 text-slate-400 border-slate-700/50 hover:border-slate-600 hover:text-slate-300'}
                                                    cursor-pointer
                                                `}
                                                title={t('google_search_tooltip')}
                                            >
                                                <i className={`fas fa-globe ${config.useGoogleSearch ? 'text-white' : 'text-slate-500'}`}></i>
                                                <span>{config.useGoogleSearch ? 'ON' : 'OFF'}</span>
                                            </button>
                                        </div>
                                    )}
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
                                <select 
                                    className="w-full bg-slate-800 border border-slate-700 text-slate-100 rounded-lg px-4 py-3 appearance-none focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    onChange={handlePresetChange}
                                    defaultValue=""
                                >
                                    <option value="">{t('load_preset_placeholder')}</option>
                                    {presets.map(p => (
                                        <option key={p.name} value={p.name}>{p.name}</option>
                                    ))}
                                </select>
                            </div>

                            <TextArea 
                                label={t('system_instr_label')} 
                                value={config.systemPrompt}
                                onChange={e => setConfig({ ...config, systemPrompt: e.target.value })}
                                className="flex-1"
                            />
                            <TextArea
                                label={t('user_prompt_label')}
                                value={config.userPrompt}
                                onChange={e => setConfig({ ...config, userPrompt: e.target.value })}
                                className="flex-1"
                                placeholder={t('batch_prompts_placeholder')}
                            />
                            <p className="text-[11px] text-slate-500 -mt-3 ml-1">
                                {config.userPrompt.trim()
                                    ? (mode === 'image'
                                        ? formatText(t('local_batch_prompts_hint_image'), {
                                            prompts: promptsCount,
                                            generations: Math.max(1, generationsPerPrompt || 1),
                                            requests: localImageRequestsEstimate,
                                        })
                                        : formatText(t('local_batch_prompts_hint_text'), {
                                            prompts: promptsCount,
                                            groups: localTextGroupsEstimate,
                                        }))
                                    : t('batch_prompts_hint_empty')}
                            </p>
                        </div>
                    </div>
                </div>

                {/* Input Files & Launch Section */}
                <div className="bg-slate-800/50 backdrop-blur-sm p-6 rounded-2xl border border-slate-700 mb-7">
                    <div className="mb-4">
                        <h3 className="text-sm font-semibold text-white mb-1 flex items-center gap-2">
                            <i className="fas fa-inbox text-emerald-400"></i>
                            {t('input_files')}
                        </h3>
                    </div>

                    {mode === 'image' ? (
                        <FileUploader onFilesSelected={handleFilesSelect} multiple className="py-10" />
                    ) : (
                        <FileUploader 
                            onFilesSelected={handleFilesSelect} 
                            multiple 
                            accept=".csv,.txt,.json,.md,.xml,.js,.ts,.py" 
                            label="Drag & drop text or CSV files"
                            className="py-10 border-blue-500/30" 
                        />
                    )}
                </div>

                {/* Summary Bar */}
                <div className="bg-slate-900/40 border border-slate-700 rounded-2xl p-5">
                    <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-5">
                        <div>
                            <h3 className="text-sm font-semibold text-white mb-2">{t('cloud_summary_title')}</h3>
                            <div className="flex flex-wrap gap-2 text-xs">
                                <span className="px-2 py-1 rounded-md border border-slate-700 bg-slate-800/80 text-slate-300">
                                    {t('cloud_summary_files')}: <strong className="text-white">{mode === 'image' ? files.filter(f => f.status === 'pending' || f.status === 'failed').length : pendingTextFiles.length}</strong>
                                </span>
                                <span className="px-2 py-1 rounded-md border border-slate-700 bg-slate-800/80 text-slate-300">
                                    {t('cloud_summary_prompts')}: <strong className="text-white">{promptsCount}</strong>
                                </span>
                                <span className="px-2 py-1 rounded-md border border-slate-700 bg-slate-800/80 text-slate-300">
                                    {t('cloud_summary_requests')}: <strong className="text-white">{mode === 'image' ? localImageRequestsEstimate : localTextGroupsEstimate}</strong>
                                </span>
                                <span className={`px-2 py-1 rounded-md border ${!hasItemsToProcess ? 'border-amber-700/50 bg-amber-900/20 text-amber-300' : 'border-emerald-700/50 bg-emerald-900/20 text-emerald-300'}`}>
                                    {!hasItemsToProcess ? t('cloud_not_ready_badge') : t('cloud_ready_badge')}
                                </span>
                            </div>
                        </div>

                        <Button 
                            variant="success" 
                            onClick={runBatch} 
                            isLoading={isBatchRunning} 
                            disabled={!hasItemsToProcess}
                            className="min-w-[180px]"
                            icon="fa-play"
                        >
                            {t('start_batch')}
                        </Button>
                    </div>
                </div>
                

                {/* --- Staging Queue / Processing List --- */}
                {mode === 'image' && pendingList.length > 0 && (
                    <div className="mt-7 border-t border-slate-700/50 pt-7 animate-fade-in">
                         <div className="flex justify-between items-center mb-6">
                            <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider">Queue ({pendingList.length})</h3>
                            <button
                                onClick={() => setShowErrorsOnly(prev => !prev)}
                                className={`text-[11px] px-3 py-2 rounded-lg border transition-colors ${showErrorsOnly ? 'bg-red-500/15 border-red-500/40 text-red-300' : 'bg-slate-800/70 border-slate-700 text-slate-300 hover:text-white'}`}
                            >
                                {t('local_filter_errors')}
                            </button>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 max-h-80 overflow-y-auto custom-scrollbar p-1">
                            {pendingList.map(item => (
                                <div key={item.id} className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-3 flex items-center gap-4 group hover:bg-slate-800 transition-colors">
                                    <img src={item.preview} className="w-16 h-16 rounded-lg object-cover shadow-sm" alt="" />
                                    <div className="flex-1 min-w-0">
                                        <div className="text-sm font-medium text-slate-200 truncate">{item.file.name}</div>
                                        <div className="text-xs mt-1">
                                            {item.status === 'processing' ? 
                                                <span className="text-blue-400 flex items-center gap-1"><i className="fas fa-circle-notch fa-spin"></i> Processing</span> : 
                                             item.status === 'failed' ? 
                                                <span className="text-red-400"><i className="fas fa-exclamation-circle"></i> Failed</span> : 
                                                <span className="text-slate-500">Pending</span>}
                                        </div>
                                        {item.batchPrompt && (
                                            <div className="text-[10px] text-slate-500 mt-1 truncate" title={item.batchPrompt}>
                                                p{item.promptIndex || 1}, g{item.generationIndex || 1}: {item.batchPrompt}
                                            </div>
                                        )}
                                    </div>
                                    <button onClick={() => removeFile(item.id)} className="text-slate-500 hover:text-red-400 p-2 rounded-full hover:bg-slate-700/50 transition-colors">
                                        <i className="fas fa-times"></i>
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {mode === 'text' && (pendingTextFiles.length > 0 || textGroups.length > 0) && (
                    <div className="mt-7 border-t border-slate-700/50 pt-7 animate-fade-in">
                        <div className="flex justify-between items-center mb-6">
                            <div className="flex flex-col">
                                <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider">
                                    Staging: {pendingTextFiles.length} files 
                                    {textGroups.length > 0 ? ` | Processing Groups: ${textGroups.length}` : ''}
                                </h3>
                                <span className="text-xs text-slate-500">Will process in chunks of {filesPerRequest}</span>
                            </div>

                            <button
                                onClick={() => setShowErrorsOnly(prev => !prev)}
                                className={`text-[11px] px-3 py-2 rounded-lg border transition-colors ${showErrorsOnly ? 'bg-red-500/15 border-red-500/40 text-red-300' : 'bg-slate-800/70 border-slate-700 text-slate-300 hover:text-white'}`}
                            >
                                {t('local_filter_errors')}
                            </button>
                        </div>

                        {/* Staging List (Simple) */}
                        {pendingTextFiles.length > 0 && (
                            <div className="mb-6 flex flex-wrap gap-2 max-h-40 overflow-y-auto custom-scrollbar">
                                {pendingTextFiles.map((file, i) => (
                                    <div key={i} className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 flex items-center gap-2 text-xs text-slate-300">
                                        <i className="fas fa-file-alt text-slate-500"></i>
                                        <span className="truncate max-w-[150px]">{file.name}</span>
                                        <button onClick={() => removeTextFile(i)} className="text-slate-500 hover:text-red-400 ml-1"><i className="fas fa-times"></i></button>
                                    </div>
                                ))}
                            </div>
                        )}
                        
                        {/* Processing Groups */}
                                 <div className="space-y-2 max-h-80 overflow-y-auto custom-scrollbar">
                                     {textGroups.filter(g => g.status !== 'completed' && (!showErrorsOnly || g.status === 'failed')).map(group => (
                                <div key={group.id} className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-3 flex items-center gap-4">
                                     <div className="w-10 h-10 rounded-lg bg-slate-700 flex items-center justify-center text-slate-400">
                                        <i className="fas fa-file-code"></i>
                                     </div>
                                     <div className="flex-1 min-w-0">
                                         <div className="text-sm font-medium text-slate-200 truncate">
                                            Group: {group.files.map(f => f.name).join(', ')}
                                         </div>
                                                      {group.batchPrompt && (
                                                          <div className="text-[10px] text-slate-500 mt-1 truncate" title={group.batchPrompt}>
                                                                p{group.promptIndex || 1}: {group.batchPrompt}
                                                          </div>
                                                      )}
                                         <div className="text-xs mt-1">
                                            {group.status === 'processing' ? 
                                                <span className="text-blue-400 flex items-center gap-1"><i className="fas fa-circle-notch fa-spin"></i> Processing...</span> : 
                                             group.status === 'failed' ? 
                                                <span className="text-red-400"><i className="fas fa-exclamation-circle"></i> Failed: {group.error}</span> : 
                                                <span className="text-slate-500">Pending</span>}
                                        </div>
                                     </div>
                                     <button onClick={() => removeTextGroup(group.id)} className="text-slate-500 hover:text-red-400 p-2"><i className="fas fa-times"></i></button>
                                </div>
                            ))}
                         </div>
                    </div>
                )}
            </div>

            {/* --- Results Grid (Completed) --- */}
            <div className="space-y-6">
                <div className="flex justify-between items-center bg-slate-900/60 backdrop-blur-md p-6 rounded-2xl border border-slate-700/50">
                    <h2 className="text-lg font-bold text-white flex items-center gap-3">
                        <i className="fas fa-check-circle text-emerald-500 text-xl"></i>
                        {t('results')} <span className="text-slate-500 text-sm font-normal">({completedList.length})</span>
                    </h2>
                    <div className="flex gap-3">
                         <Button variant="secondary" onClick={clearCompleted} disabled={completedList.length === 0} className="text-xs px-4 py-2 h-auto">
                            {t('clear_completed')}
                        </Button>
                        <Button variant="primary" onClick={handleDownloadAll} disabled={completedList.length === 0} className="text-xs px-4 py-2 h-auto" icon="fa-file-zipper">
                            {t('download_all_btn')}
                        </Button>
                    </div>
                </div>

                {mode === 'image' ? (
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
                        {(completedList as BatchFile[]).map(item => (
                            <div key={item.id} className="bg-slate-900/40 border border-slate-700/50 rounded-2xl overflow-hidden relative group shadow-lg hover:shadow-2xl transition-all duration-300 hover:-translate-y-1">
                                <div className="aspect-square relative bg-slate-800">
                                    <img 
                                        src={item.resultImage} 
                                        className="w-full h-full object-cover" 
                                        alt="Result"
                                    />
                                    <div className="absolute inset-0 bg-slate-900/80 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-4 backdrop-blur-sm">
                                        <div className="flex gap-3">
                                            <button onClick={() => setViewingImage(item.resultImage || null)} className="p-3 bg-blue-600 rounded-xl text-white hover:bg-blue-500 shadow-lg transition-colors"><i className="fas fa-eye"></i></button>
                                            <button onClick={() => item.resultImage && setCompareData({original: item.preview, result: item.resultImage})} className="p-3 bg-purple-600 rounded-xl text-white hover:bg-purple-500 shadow-lg transition-colors"><i className="fas fa-columns"></i></button>
                                        </div>
                                        <button onClick={() => removeFile(item.id)} className="px-4 py-1.5 bg-red-500/10 text-red-400 border border-red-500/20 rounded-full text-xs hover:bg-red-500 hover:text-white transition-all">Remove</button>
                                    </div>
                                    <div className="absolute top-3 right-3 shadow-lg"><i className="fas fa-check-circle text-emerald-400 bg-white rounded-full text-lg"></i></div>
                                    {(item.promptIndex || item.generationIndex) && (
                                        <div className="absolute top-3 left-3 text-[10px] px-2 py-1 rounded-md bg-slate-950/70 text-slate-200 border border-slate-600/60">
                                            P{item.promptIndex || 1} / G{item.generationIndex || 1}
                                        </div>
                                    )}
                                </div>
                                <div className="p-4 bg-slate-800/30">
                                    <h3 className="text-xs font-bold text-slate-300 truncate mb-2" title={item.file.name}>{item.file.name}</h3>
                                    <div className="flex justify-between items-center text-[10px] text-slate-500 font-medium uppercase tracking-wide">
                                        <span>Processed</span>
                                        {item.resultImage && (
                                            <button onClick={() => item.resultImage && downloadBase64Image(item.resultImage, `batch-${item.file.name}`, {
                                                prompt: item.batchPrompt ?? config.userPrompt,
                                                model: config.model,
                                                resolution: config.resolution,
                                                aspectRatio: config.aspectRatio,
                                                inputImagesCount: 1,
                                                createdAt: Date.now()
                                            })} className="text-blue-400 hover:text-blue-300 flex items-center gap-1 transition-colors"><i className="fas fa-download"></i> Save</button>
                                        )}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {(completedList as BatchTextGroup[]).map(group => (
                            <div key={group.id} className="bg-slate-900/40 border border-slate-700/50 rounded-2xl flex flex-col overflow-hidden relative group shadow-lg">
                                <div className="p-4 bg-slate-800/50 border-b border-slate-700/50 flex justify-between items-center">
                                    <div className="flex items-center gap-2 overflow-hidden">
                                        <i className="fas fa-file-alt text-blue-400"></i>
                                        <span className="text-xs font-bold text-slate-300 truncate" title={group.files.map(f=>f.name).join(', ')}>
                                            {group.files.length} Files: {group.files[0].name} {group.files.length > 1 ? `+${group.files.length - 1}` : ''}
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        {group.promptIndex && (
                                            <span className="text-[10px] px-2 py-1 rounded-md bg-slate-900 text-slate-300 border border-slate-600/60">P{group.promptIndex}</span>
                                        )}
                                        <button onClick={() => removeTextGroup(group.id)} className="text-slate-500 hover:text-red-400"><i className="fas fa-trash"></i></button>
                                    </div>
                                </div>
                                <div className="p-4 flex-1 max-h-60 overflow-y-auto custom-scrollbar bg-slate-950/30">
                                    <pre className="text-xs text-slate-300 whitespace-pre-wrap font-mono">{group.resultText}</pre>
                                </div>
                                <div className="p-3 bg-slate-800/30 border-t border-slate-700/50 flex justify-end">
                                     <button 
                                        className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1"
                                        onClick={() => {
                                            const blob = new Blob([group.resultText || ''], { type: 'text/plain' });
                                            const url = window.URL.createObjectURL(blob);
                                            const a = document.createElement('a');
                                            a.href = url;
                                            a.download = `result_${group.files[0].name}.txt`;
                                            document.body.appendChild(a);
                                            a.click();
                                            document.body.removeChild(a);
                                        }}
                                     >
                                        <i className="fas fa-download"></i> Save Text
                                     </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
                
                {completedList.length === 0 && (
                    <div className="text-center py-16 text-slate-500 bg-slate-800/20 rounded-2xl border-2 border-dashed border-slate-700/50">
                        <i className="fas fa-box-open text-4xl mb-4 opacity-30"></i>
                        <p className="font-medium">{t('processed_result_msg')}</p>
                    </div>
                )}
            </div>
        </div>
    );
};

export default BatchProcessor;
