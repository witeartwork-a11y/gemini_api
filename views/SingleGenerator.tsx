
import React, { useState, useEffect, useRef } from 'react';
import { Select, TextArea, RangeInput } from '../components/ui/InputComponents';
import Button from '../components/ui/Button';
import FileUploader from '../components/ui/FileUploader';
import ImageViewer from '../components/ui/ImageViewer';
import { generateContent, downloadBase64Image, fileToBase64 } from '../services/geminiService';
import { saveGeneration, getUserHistory, deleteGeneration } from '../services/historyService';
import { getCurrentUser } from '../services/authService';
import { ProcessingConfig, ModelType, HistoryItem } from '../types';
import { MODELS, ASPECT_RATIOS, RESOLUTIONS } from '../constants';
import { useLanguage } from '../contexts/LanguageContext';
import { usePresets } from '../hooks/usePresets';
import { getSystemSettings, SystemSettings } from '../services/settingsService';

interface ImageAsset {
    id: string;
    file: File;
    preview: string;
}

const SingleGenerator: React.FC = () => {
    const { t } = useLanguage();
    const { presets, savePreset, deletePreset } = usePresets();
    const user = getCurrentUser();
    
    // Config State
    const [config, setConfig] = useState<ProcessingConfig>({
        model: ModelType.GEMINI_3_PRO_IMAGE,
        temperature: 1.0,
        systemPrompt: '', // Start empty
        userPrompt: '',
        aspectRatio: 'Auto',
        resolution: '1K' 
    });
    const [repeatCount, setRepeatCount] = useState<number>(1);
    const [uiSettings, setUiSettings] = useState<SystemSettings>(getSystemSettings());
    
    // Runtime State
    const [images, setImages] = useState<ImageAsset[]>([]);
    
    const [isProcessing, setIsProcessing] = useState(false);
    const [currentRunIndex, setCurrentRunIndex] = useState(0);
    const [result, setResult] = useState<{ image?: string, text?: string } | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [selectedPresetName, setSelectedPresetName] = useState<string>("");
    const [isDraggingOverGallery, setIsDraggingOverGallery] = useState(false);
    const [viewingImage, setViewingImage] = useState<string | null>(null);
    const [viewingPrompt, setViewingPrompt] = useState<string | undefined>(undefined);
    
    // Timer State
    const [elapsedTime, setElapsedTime] = useState<number>(0);
    const [lastGenerationTime, setLastGenerationTime] = useState<number | null>(null);
    
    // Recent History State
    const [recentHistory, setRecentHistory] = useState<HistoryItem[]>([]);

    const stopRef = useRef(false);

    // Filter for Image Models or Multimodal Models that handle vision/image tasks
    const availableModels = MODELS.filter(m => m.value.includes('image') || m.value === ModelType.GEMINI_3_FLASH);

    // Timer Logic
    useEffect(() => {
        let interval: ReturnType<typeof setInterval>;
        if (isProcessing) {
            const startTime = Date.now();
            setElapsedTime(0);
            interval = setInterval(() => {
                setElapsedTime((Date.now() - startTime) / 1000);
            }, 100);
        }
        return () => clearInterval(interval);
    }, [isProcessing]);

    // Load recent history and settings
    useEffect(() => {
        loadRecentHistory();
        
        // Listen for settings changes from Admin panel in same session
        const handleSettingsChange = () => setUiSettings(getSystemSettings());
        window.addEventListener('system-settings-changed', handleSettingsChange);
        return () => window.removeEventListener('system-settings-changed', handleSettingsChange);
    }, [user?.id]);

    const loadRecentHistory = async () => {
        if (user) {
            const allHistory = await getUserHistory(user.id);
            // Take last 10
            setRecentHistory(allHistory.slice(0, 10));
        }
    };

    const handleImageSelect = (files: File[]) => {
        setImages(prevImages => {
            const currentCount = prevImages.length;
            const remaining = 14 - currentCount;
            
            if (remaining <= 0) {
                alert(t('max_images_reached'));
                return prevImages;
            }

            const toAdd = files.slice(0, remaining);
            const newAssets: ImageAsset[] = toAdd.map(f => ({
                id: Math.random().toString(36).substring(2, 9),
                file: f,
                preview: URL.createObjectURL(f)
            }));
            
            setError(null);
            return [...prevImages, ...newAssets];
        });
    };

    // --- Reuse Result as Input ---
    const handleUseAsInput = async (item: HistoryItem) => {
        const src = item.imageUrl || item.image;
        if (!src) return;

        try {
            const res = await fetch(src);
            const blob = await res.blob();
            const file = new File([blob], `reused-${item.id}.png`, { type: "image/png" });
            handleImageSelect([file]);
        } catch (e) {
            console.error("Failed to reuse image", e);
        }
    };

    const handleDeleteHistoryItem = async (itemId: string) => {
        if (!user) return;
        if (confirm("Delete this image?")) {
            const success = await deleteGeneration(user.id, itemId);
            if (success) {
                setRecentHistory(prev => prev.filter(i => i.id !== itemId));
            }
        }
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
            const files: File[] = [];
            for (let i = 0; i < e.dataTransfer.files.length; i++) {
                if (e.dataTransfer.files[i].type.startsWith('image/')) {
                    files.push(e.dataTransfer.files[i]);
                }
            }
            if (files.length > 0) {
                handleImageSelect(files);
            }
        }
    };

    const removeImage = (id: string) => {
        setImages(prev => prev.filter(img => img.id !== id));
    };

    const handleGenerate = async () => {
        setIsProcessing(true);
        setError(null);
        setLastGenerationTime(null);
        stopRef.current = false;
        setCurrentRunIndex(1);

        try {
            const imageFiles = images.map(img => img.file);
            for (let i = 0; i < repeatCount; i++) {
                if (stopRef.current) break;
                setCurrentRunIndex(i + 1);
                
                // Reset timer for each repeat if needed, currently measuring total batch sequence
                const res = await generateContent(config, imageFiles);
                
                if (stopRef.current) break;

                setResult(res);

                // Save
                if (res.image || res.text) {
                     if (user) {
                         await saveGeneration(
                             user.id,
                             'single',
                             config.model,
                             config.userPrompt || `${images.length} images`,
                             res.image,
                             res.text,
                             config.aspectRatio
                         );
                         loadRecentHistory(); // Refresh strip
                     }
                }
            }
        } catch (err: any) {
            if (!stopRef.current) {
                setError(err.message);
            }
        } finally {
            setIsProcessing(false);
            setLastGenerationTime(elapsedTime);
            setCurrentRunIndex(0);
        }
    };

    const handleStop = () => {
        stopRef.current = true;
    };

    const handlePresetChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const name = e.target.value;
        setSelectedPresetName(name);
        const preset = presets.find(p => p.name === name);
        if (preset) {
            setConfig(prev => ({ ...prev, systemPrompt: preset.content }));
        }
    };

    const clearPreset = () => {
        setSelectedPresetName("");
        setConfig(prev => ({ ...prev, systemPrompt: "" }));
    };

    const handleSavePreset = () => {
        const name = prompt(t('enter_preset_name'));
        if (name && config.systemPrompt) {
            savePreset(name, config.systemPrompt);
            setSelectedPresetName(name);
        }
    };

    return (
        <div className="flex flex-col gap-8 pb-10">
            {viewingImage && (
                <ImageViewer 
                    src={viewingImage} 
                    prompt={viewingPrompt}
                    onClose={() => { setViewingImage(null); setViewingPrompt(undefined); }} 
                    onDownload={() => viewingImage && downloadBase64Image(viewingImage, `image-${Date.now()}.png`)}
                />
            )}

            <div className="grid grid-cols-1 xl:grid-cols-12 gap-8 relative">
                <div className="xl:col-span-4 space-y-6">
                    <div className="bg-slate-900/60 backdrop-blur-md p-6 rounded-3xl border border-slate-700/50 shadow-xl flex flex-col h-full">
                        <div className="mb-6">
                             {!isProcessing ? (
                                <button 
                                    onClick={handleGenerate}
                                    className="w-full bg-gradient-to-r from-theme-primary to-theme-secondary hover:brightness-110 text-white font-bold text-lg py-4 rounded-xl shadow-lg shadow-theme-glow/40 hover:shadow-theme-glow/60 transform hover:-translate-y-0.5 transition-all flex items-center justify-center gap-2"
                                >
                                    <i className="fas fa-wand-magic-sparkles"></i>
                                    {repeatCount > 1 ? `${t('generate_btn')} (${repeatCount})` : t('generate_btn')}
                                </button>
                            ) : (
                                <button 
                                    onClick={handleStop}
                                    className="w-full bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 font-bold text-lg py-4 rounded-xl flex items-center justify-center gap-2 animate-pulse"
                                >
                                    <i className="fas fa-stop"></i>
                                    {t('stop_btn')}
                                </button>
                            )}
                        </div>

                        <div className="space-y-5 flex-1 overflow-y-auto custom-scrollbar pr-1">
                            <Select 
                                label={t('model_label')}
                                options={availableModels} 
                                value={config.model}
                                onChange={e => setConfig({ ...config, model: e.target.value as ModelType })}
                            />

                            <div>
                                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 ml-1">{t('preset_label')}</label>
                                <div className="flex gap-2">
                                    <div className="relative flex-1">
                                        <select 
                                            className="w-full bg-slate-800/50 backdrop-blur-sm border border-slate-700/50 text-slate-100 rounded-xl px-4 py-3 appearance-none focus:outline-none focus:ring-2 focus:ring-theme-primary/50 cursor-pointer"
                                            onChange={handlePresetChange}
                                            value={selectedPresetName}
                                        >
                                            <option value="" disabled>{t('load_preset_placeholder')}</option>
                                            {presets.map(p => (
                                                <option key={p.name} value={p.name}>{p.name}</option>
                                            ))}
                                        </select>
                                        <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-slate-500">
                                            <i className="fas fa-chevron-down text-xs"></i>
                                        </div>
                                    </div>
                                    
                                    {selectedPresetName ? (
                                         <Button variant="secondary" onClick={clearPreset} title="Clear Preset" className="px-3 bg-slate-800">
                                            <i className="fas fa-times"></i>
                                         </Button>
                                    ) : (
                                        <Button variant="secondary" onClick={handleSavePreset} title={t('add_preset')} className="px-3">
                                            <i className="fas fa-save"></i>
                                        </Button>
                                    )}
                                </div>
                            </div>

                            <TextArea 
                                label={t('system_instr_label')} 
                                value={config.systemPrompt}
                                onChange={e => setConfig({ ...config, systemPrompt: e.target.value })}
                                rows={3}
                                placeholder="Define how the model should behave..."
                            />

                            <TextArea 
                                label={t('user_prompt_label')}
                                value={config.userPrompt}
                                onChange={e => setConfig({ ...config, userPrompt: e.target.value })}
                                rows={8}
                                placeholder="Describe what you want to generate..."
                            />

                            <div className="grid grid-cols-2 gap-5">
                                <Select 
                                    label={t('resolution_label')}
                                    options={RESOLUTIONS} 
                                    value={config.resolution}
                                    onChange={e => setConfig({ ...config, resolution: e.target.value })}
                                />
                                <Select 
                                    label={t('ar_label')}
                                    options={ASPECT_RATIOS} 
                                    value={config.aspectRatio}
                                    onChange={e => setConfig({ ...config, aspectRatio: e.target.value })}
                                />
                            </div>

                            {uiSettings.showCreativity && (
                                <div className="mt-4 p-4 bg-slate-800/30 rounded-xl border border-slate-700/30">
                                    <RangeInput 
                                        label={t('temp_label')}
                                        min="0" max="2" step="0.1" 
                                        minLabel={t('precise')} maxLabel={t('creative')}
                                        value={config.temperature}
                                        onChange={e => setConfig({ ...config, temperature: parseFloat(e.target.value) })}
                                    />
                                </div>
                            )}

                            {uiSettings.showRepeats && (
                                <div className="mt-4">
                                    <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 ml-1">
                                        {t('repeat_count')}
                                    </label>
                                    <input 
                                        type="number" 
                                        min="1" max="50"
                                        value={repeatCount}
                                        onChange={(e) => setRepeatCount(Math.max(1, parseInt(e.target.value) || 1))}
                                        className="w-full bg-slate-800/50 border border-slate-700/50 text-white rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-theme-primary outline-none"
                                    />
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                <div className="xl:col-span-8 space-y-6 flex flex-col h-full">
                     <div 
                        className={`
                            bg-slate-900/60 backdrop-blur-md p-6 rounded-3xl border transition-all duration-300 min-h-[160px]
                            ${isDraggingOverGallery ? 'border-theme-primary bg-theme-primary/10 scale-[1.01]' : 'border-slate-700/50'}
                        `}
                        onDragOver={handleDragOver}
                        onDragLeave={handleDragLeave}
                        onDrop={handleDrop}
                    >
                        <div className="flex justify-between items-center mb-4">
                            <h2 className="text-lg font-bold flex items-center gap-2 text-white">
                                <i className="fas fa-images text-theme-secondary"></i>
                                {t('input_image_title')}
                            </h2>
                            <span className="text-xs font-medium px-2 py-1 bg-slate-800 rounded-lg text-slate-300 border border-slate-700">
                                {images.length} / 14
                            </span>
                        </div>
                        
                        {images.length === 0 ? (
                            <FileUploader onFilesSelected={handleImageSelect} multiple={true} className="h-32 p-4" />
                        ) : (
                            <div className="space-y-4">
                                <div className="flex flex-wrap gap-3 max-h-48 overflow-y-auto p-3 custom-scrollbar">
                                    {images.map((img) => (
                                        <div 
                                            key={img.id} 
                                            className="relative group w-24 h-24 shrink-0"
                                        >
                                            {/* Image Container */}
                                            <div className="w-full h-full rounded-xl overflow-hidden border border-slate-600 shadow-sm">
                                                <img src={img.preview} className="w-full h-full object-cover" alt="Input" />
                                            </div>
                                            
                                            {/* Delete Button Overlay - Centered with Flexbox for full cross-browser support */}
                                            <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200 z-50 bg-black/20 rounded-xl pointer-events-none">
                                                <button 
                                                    onClick={() => removeImage(img.id)}
                                                    className="pointer-events-auto w-8 h-8 rounded-full bg-red-500 text-white flex items-center justify-center shadow-lg hover:scale-110 transition-transform cursor-pointer hover:bg-red-600"
                                                    title={t('remove_btn')}
                                                >
                                                    <i className="fas fa-times"></i>
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                    {images.length < 14 && (
                                         <div 
                                            className="w-24 h-24 border-2 border-dashed border-slate-700 rounded-xl flex items-center justify-center cursor-pointer hover:border-slate-500 hover:bg-slate-800/50 transition-colors shrink-0"
                                            onClick={() => document.getElementById('add-more-input')?.click()}
                                         >
                                            <i className="fas fa-plus text-slate-500"></i>
                                            <input 
                                                id="add-more-input"
                                                type="file" 
                                                className="hidden" 
                                                multiple 
                                                accept="image/*"
                                                onChange={(e) => e.target.files && handleImageSelect(Array.from(e.target.files))}
                                            />
                                         </div>
                                    )}
                                </div>
                                <div className="flex justify-end">
                                    <button onClick={() => setImages([])} className="text-red-400 text-xs hover:text-red-300 transition-colors flex items-center gap-1">
                                        <i className="fas fa-trash"></i> {t('remove_btn')}
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="flex-1 bg-slate-900/60 backdrop-blur-md p-2 rounded-3xl border border-slate-700/50 min-h-[500px] flex flex-col shadow-2xl relative overflow-hidden">
                        <div className="absolute top-0 right-0 w-64 h-64 bg-theme-secondary/5 blur-[100px] rounded-full pointer-events-none"></div>
                        <div className="absolute bottom-0 left-0 w-64 h-64 bg-theme-primary/5 blur-[100px] rounded-full pointer-events-none"></div>

                        <div className="flex justify-between items-center mb-4 px-4 pt-4 relative z-10">
                            <div className="flex items-center gap-3">
                                <h2 className="text-xl font-bold flex items-center gap-2 text-white">
                                    <i className="fas fa-photo-film text-theme-primary"></i>
                                    {t('result_title')}
                                </h2>
                                {/* Generation Timer / Info */}
                                {isProcessing && (
                                    <span className="text-xs font-mono text-theme-primary animate-pulse border border-theme-primary/30 bg-theme-primary/10 px-2 py-0.5 rounded">
                                        {elapsedTime.toFixed(1)}s
                                    </span>
                                )}
                                {!isProcessing && lastGenerationTime !== null && (
                                     <span className="text-xs font-mono text-slate-400 border border-slate-700 bg-slate-800 px-2 py-0.5 rounded">
                                        {lastGenerationTime.toFixed(1)}s
                                    </span>
                                )}
                            </div>

                            {result?.image && (
                                <Button 
                                    variant="secondary" 
                                    className="px-3 py-1.5 text-xs h-8 border-slate-600 bg-slate-800/80"
                                    onClick={() => result.image && downloadBase64Image(result.image, `gemini-gen-${Date.now()}.png`)}
                                    icon="fa-download"
                                >
                                    {t('download_btn')}
                                </Button>
                            )}
                        </div>

                        {error && (
                            <div className="mx-4 p-4 bg-red-500/10 border border-red-500/20 text-red-200 rounded-xl flex items-start gap-3 break-words mb-4 animate-fade-in">
                                <i className="fas fa-exclamation-triangle mt-1 shrink-0 text-red-400"></i>
                                <div>{error}</div>
                            </div>
                        )}

                        {!result && !isProcessing && !error && (
                            <div className="flex-1 m-4 flex flex-col items-center justify-center text-slate-500 border-2 border-dashed border-slate-700/50 rounded-2xl bg-slate-800/20">
                                <div className="w-20 h-20 bg-slate-800 rounded-full flex items-center justify-center mb-4 shadow-inner">
                                    <i className="fas fa-magic text-3xl opacity-30 text-slate-400"></i>
                                </div>
                                <p className="font-medium text-lg">Ready to Create</p>
                                <p className="text-sm opacity-60">Configure your settings and press Generate</p>
                            </div>
                        )}

                        {isProcessing && (
                             <div className="flex-1 flex flex-col items-center justify-center text-theme-primary">
                                <div className="relative mb-6">
                                    <div className="w-16 h-16 border-4 border-theme-primary/30 border-t-theme-primary rounded-full animate-spin"></div>
                                    {repeatCount > 1 && (
                                        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-xs font-bold text-white">
                                            {currentRunIndex}
                                        </div>
                                    )}
                                </div>
                                <p className="animate-pulse font-medium text-lg tracking-wide">
                                    {repeatCount > 1 ? `${t('processing_count')} ${currentRunIndex}...` : t('processing')}
                                </p>
                                <p className="text-sm text-slate-500 mt-2 font-mono">{elapsedTime.toFixed(1)}s</p>
                            </div>
                        )}

                        {result && (
                            <div className="flex-1 flex flex-col gap-4 animate-fade-in relative z-10 overflow-hidden h-full">
                                {result.image && (
                                    <div className="flex-1 rounded-xl overflow-hidden shadow-2xl bg-black/40 flex items-center justify-center group relative min-h-0">
                                        <img 
                                            src={result.image} 
                                            alt="Generated" 
                                            className="w-full h-full object-contain cursor-pointer"
                                            onClick={() => {
                                                setViewingImage(result.image!);
                                                setViewingPrompt(result.text || config.userPrompt);
                                            }}
                                        />
                                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center pointer-events-none backdrop-blur-[2px]">
                                            <div className="bg-white/10 p-3 rounded-full backdrop-blur-md">
                                                <i className="fas fa-expand text-white text-2xl"></i>
                                            </div>
                                        </div>
                                    </div>
                                )}
                                {result.text && (
                                    <div className="mx-4 mb-4 p-4 bg-slate-800/50 rounded-2xl border border-slate-700/50 text-slate-200 text-sm leading-relaxed whitespace-pre-wrap shadow-inner max-h-40 overflow-y-auto custom-scrollbar shrink-0">
                                        <h3 className="text-xs font-bold text-slate-500 uppercase mb-2 tracking-wider">Model Output</h3>
                                        {result.text}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {recentHistory.length > 0 && (
                <div className="mt-4 bg-slate-900/60 backdrop-blur-md p-6 rounded-3xl border border-slate-700/50 shadow-xl">
                    <h3 className="text-md font-bold text-white mb-4 flex items-center gap-2">
                        <i className="fas fa-clock text-slate-400"></i>
                        {t('history_title')}
                    </h3>
                    <div className="flex gap-4 overflow-x-auto pb-4 custom-scrollbar">
                        {recentHistory.map(item => {
                            const imgSrc = item.thumbnailUrl || item.imageUrl || item.image;
                            const fullImgSrc = item.imageUrl || item.image;
                            
                            return (
                                <div key={item.id} className="shrink-0 w-32 group relative">
                                    <div className="aspect-square rounded-xl overflow-hidden border border-slate-700 bg-slate-800 relative">
                                        {imgSrc ? (
                                            <img 
                                                src={imgSrc} 
                                                loading="lazy"
                                                className="w-full h-full object-cover cursor-pointer hover:scale-110 transition-transform duration-500" 
                                                onClick={() => {
                                                    setViewingImage(fullImgSrc); // View FULL image in modal
                                                    setViewingPrompt(item.prompt);
                                                }}
                                            />
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center text-slate-600 text-xs text-center p-2">
                                                Text Only
                                            </div>
                                        )}
                                        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-2">
                                            {fullImgSrc && (
                                                <div className="flex gap-2">
                                                    <button 
                                                        onClick={() => handleUseAsInput(item)}
                                                        className="w-8 h-8 rounded-full bg-theme-primary text-white flex items-center justify-center hover:bg-theme-secondary transition-colors"
                                                        title={t('use_as_input')}
                                                    >
                                                        <i className="fas fa-magic text-xs"></i>
                                                    </button>
                                                    <button 
                                                        onClick={() => {
                                                            setViewingImage(fullImgSrc);
                                                            setViewingPrompt(item.prompt);
                                                        }}
                                                        className="w-8 h-8 rounded-full bg-slate-700 text-white flex items-center justify-center hover:bg-slate-600 transition-colors"
                                                        title="View"
                                                    >
                                                        <i className="fas fa-eye text-xs"></i>
                                                    </button>
                                                </div>
                                            )}
                                            <button 
                                                onClick={() => handleDeleteHistoryItem(item.id)}
                                                className="w-8 h-8 rounded-full bg-red-500/80 text-white flex items-center justify-center hover:bg-red-600 transition-colors"
                                                title="Delete"
                                            >
                                                <i className="fas fa-trash text-xs"></i>
                                            </button>
                                        </div>
                                    </div>
                                    <div className="mt-1 text-[10px] text-slate-400 truncate px-1">
                                        {item.model.split('-').slice(-2).join(' ')}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
};

export default SingleGenerator;
