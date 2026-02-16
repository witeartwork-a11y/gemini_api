
import React, { useEffect, useState, useRef } from 'react';
import Button from './Button';
import { useLanguage } from '../../contexts/LanguageContext';

interface ImageViewerProps {
    src: string;
    alt?: string;
    prompt?: string;
    date?: number | string;
    resolution?: string;
    inputImagesCount?: number;
    provenance?: {
        schema?: string;
        workId?: string;
        createdAtUtc?: string;
        recordedAtUtc?: string;
        authorId?: string;
        authorName?: string | null;
        model?: string;
        outputResolution?: string | null;
        aspectRatio?: string | null;
        inputImagesCount?: number | null;
        imageSha256?: string | null;
        promptHash?: string | null;
        app?: string;
        recordDigest?: string;
    };
    onClose: () => void;
    onDownload?: () => void;
}

const ImageViewer: React.FC<ImageViewerProps> = ({ src, alt, prompt, date, resolution, inputImagesCount, provenance, onClose, onDownload }) => {
    const { t } = useLanguage();
    const [zoom, setZoom] = useState(1);
    const [pan, setPan] = useState({ x: 0, y: 0 });
    const [isDragging, setIsDragging] = useState(false);
    const [copiedProof, setCopiedProof] = useState(false);
    const [runtimeProof, setRuntimeProof] = useState<ImageViewerProps['provenance'] | null>(provenance || null);
    const dragStart = useRef({ x: 0, y: 0 });
    const startClientPos = useRef({ x: 0, y: 0 });
    const effectiveProof = runtimeProof || provenance;
    const hasSidebar = !!(prompt || effectiveProof || onDownload);

    const toHex = (buffer: ArrayBuffer): string => {
        const bytes = new Uint8Array(buffer);
        return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
    };

    const sha256Hex = async (value: Uint8Array | string): Promise<string> => {
        const bytes = typeof value === 'string' ? new TextEncoder().encode(value) : value;
        const digest = await crypto.subtle.digest('SHA-256', bytes);
        return toHex(digest);
    };

    const extractPngProof = (bytes: Uint8Array): ImageViewerProps['provenance'] | null => {
        const pngSignature = [137, 80, 78, 71, 13, 10, 26, 10];
        if (bytes.length < 8) return null;
        for (let i = 0; i < 8; i++) {
            if (bytes[i] !== pngSignature[i]) return null;
        }

        const readUint32 = (offset: number) => ((bytes[offset] << 24) >>> 0) + ((bytes[offset + 1] << 16) >>> 0) + ((bytes[offset + 2] << 8) >>> 0) + (bytes[offset + 3] >>> 0);
        const decoder = new TextDecoder();

        let offset = 8;
        while (offset + 12 <= bytes.length) {
            const len = readUint32(offset);
            const typeOffset = offset + 4;
            const dataOffset = offset + 8;
            const crcOffset = dataOffset + len;
            if (crcOffset + 4 > bytes.length) break;

            const type = String.fromCharCode(bytes[typeOffset], bytes[typeOffset + 1], bytes[typeOffset + 2], bytes[typeOffset + 3]);
            if (type === 'iTXt') {
                const chunk = bytes.slice(dataOffset, dataOffset + len);
                const zeroIndex = chunk.indexOf(0);
                if (zeroIndex > 0) {
                    const keyword = decoder.decode(chunk.slice(0, zeroIndex));
                    if (keyword === 'wite.provenance') {
                        const textStart = zeroIndex + 5;
                        if (textStart <= chunk.length) {
                            const raw = decoder.decode(chunk.slice(textStart));
                            try {
                                return JSON.parse(raw);
                            } catch {
                                return null;
                            }
                        }
                    }
                }
            }

            if (type === 'IEND') break;
            offset = crcOffset + 4;
        }

        return null;
    };

    const loadProofFromSource = async () => {
        if (provenance) {
            setRuntimeProof(provenance);
            return;
        }

        try {
            let bytes: Uint8Array;
            if (src.startsWith('data:')) {
                const match = src.match(/^data:([^;]+);base64,(.*)$/);
                if (!match) return;
                const b64 = match[2];
                const binary = atob(b64);
                bytes = new Uint8Array(binary.length);
                for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
            } else {
                const res = await fetch(src);
                const buf = await res.arrayBuffer();
                bytes = new Uint8Array(buf);
            }

            const embedded = extractPngProof(bytes);
            if (embedded) {
                setRuntimeProof(embedded);
                return;
            }

            const imageSha256 = await sha256Hex(bytes);
            const promptHash = prompt ? await sha256Hex(prompt) : undefined;
            setRuntimeProof({
                schema: 'wite.provenance.runtime.v1',
                createdAtUtc: date ? new Date(date).toISOString() : new Date().toISOString(),
                outputResolution: resolution || null,
                inputImagesCount: inputImagesCount ?? null,
                imageSha256,
                promptHash: promptHash || null,
                app: 'gemini_api'
            });
        } catch {
            setRuntimeProof(null);
        }
    };

    // Close on Escape key
    useEffect(() => {
        const handleEsc = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', handleEsc);
        return () => window.removeEventListener('keydown', handleEsc);
    }, [onClose]);

    useEffect(() => {
        setRuntimeProof(provenance || null);
        loadProofFromSource();
    }, [src, provenance, prompt, date, resolution, inputImagesCount]);

    // Zoom Logic
    const handleWheel = (e: React.WheelEvent) => {
        e.stopPropagation();
        const delta = -Math.sign(e.deltaY) * 0.1;
        setZoom(prev => {
            const newZoom = Math.max(1, Math.min(prev + delta, 5));
            // Reset pan if zoomed out to 1
            if (newZoom === 1) setPan({ x: 0, y: 0 });
            return newZoom;
        });
    };

    // Pan Logic
    const handleMouseDown = (e: React.MouseEvent) => {
        if (zoom > 1) {
            e.preventDefault();
            setIsDragging(true);
            dragStart.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
            startClientPos.current = { x: e.clientX, y: e.clientY };
        }
    };

    const handleMouseMove = (e: React.MouseEvent) => {
        if (isDragging && zoom > 1) {
            e.preventDefault();
            setPan({
                x: e.clientX - dragStart.current.x,
                y: e.clientY - dragStart.current.y
            });
        }
    };

    const handleMouseUp = () => setIsDragging(false);

    const toggleZoom = (e: React.MouseEvent) => {
        e.stopPropagation();
        
        // Если изображение увеличено, проверяем, был ли это драг (смещение)
        if (zoom > 1) {
            const moveDistance = Math.hypot(
                e.clientX - startClientPos.current.x, 
                e.clientY - startClientPos.current.y
            );
            // Если сместили курсор больше чем на 5 пикселей, считаем это панорамированием, а не кликом
            if (moveDistance > 5) return;
        }

        setZoom(prev => (prev === 1 ? 2 : 1));
        setPan({ x: 0, y: 0 });
    };

    const copyProofJson = async () => {
        if (!effectiveProof) return;
        try {
            await navigator.clipboard.writeText(JSON.stringify(effectiveProof, null, 2));
            setCopiedProof(true);
            setTimeout(() => setCopiedProof(false), 1500);
        } catch {
            setCopiedProof(false);
        }
    };

    return (
        <div 
            className="fixed inset-0 z-[200] bg-black/95 flex items-center justify-center animate-fade-in backdrop-blur-md cursor-pointer overflow-hidden"
            onClick={onClose}
        >
            <div className="flex flex-col md:flex-row w-full h-full max-w-[95vw] max-h-[95vh] mx-auto gap-0 md:gap-6 pointer-events-none pt-0 md:pt-0">
                
                {/* Image Area */}
                <div 
                    className="flex-1 flex items-center justify-center relative min-h-0 overflow-hidden"
                    onWheel={handleWheel}
                >
                    <img 
                        src={src} 
                        alt={alt || "Full view"} 
                        className="max-w-full max-h-full object-contain rounded-lg shadow-2xl pointer-events-auto transition-transform duration-100 ease-out origin-center"
                        style={{ 
                            transform: `scale(${zoom}) translate(${pan.x / zoom}px, ${pan.y / zoom}px)`,
                            cursor: zoom > 1 ? (isDragging ? 'grabbing' : 'grab') : 'zoom-in'
                        }}
                        onClick={toggleZoom}
                        onMouseDown={handleMouseDown}
                        onMouseMove={handleMouseMove}
                        onMouseUp={handleMouseUp}
                        onMouseLeave={handleMouseUp}
                        draggable={false}
                    />
                </div>

                {/* Metadata Sidebar */}
                {hasSidebar && (
                    <div 
                        className="w-full md:w-80 bg-slate-900/90 border-l border-slate-700 p-6 flex flex-col h-auto md:h-full rounded-xl overflow-hidden backdrop-blur-md pointer-events-auto cursor-default shadow-2xl shrink-0 relative"
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* Close Button - Top Right */}
                        <button 
                            onClick={onClose}
                            className="absolute top-4 right-4 z-[60] text-white bg-slate-700/80 hover:bg-slate-600 p-2 rounded-full transition-all w-9 h-9 flex items-center justify-center border border-slate-600 shadow-xl hover:scale-105"
                            title="Close"
                        >
                            <i className="fas fa-times text-base"></i>
                        </button>

                        <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                            <i className="fas fa-info-circle text-blue-500"></i>
                            {t('info_label')}
                        </h3>
                        
                        <div className="flex-1 overflow-y-auto custom-scrollbar mb-4 space-y-4">
                            {/* Metadata Grid */}
                            <div className="grid grid-cols-2 gap-3 mb-4">
                                {date && (
                                    <div className="bg-slate-800/50 p-2 rounded-lg border border-slate-700/50">
                                        <div className="text-xs text-slate-400 mb-1">{t('date_label') || 'Date'}</div>
                                        <div className="text-sm font-mono text-slate-200">
                                            {new Date(date).toLocaleDateString()}
                                        </div>
                                    </div>
                                )}
                                <div className="bg-slate-800/50 p-2 rounded-lg border border-slate-700/50">
                                    <div className="text-xs text-slate-400 mb-1">{t('resolution_label')}</div>
                                    <div className="text-sm font-mono text-slate-200">{resolution || 'N/A'}</div>
                                </div>
                                <div className="bg-slate-800/50 p-2 rounded-lg border border-slate-700/50">
                                    <div className="text-xs text-slate-400 mb-1">{t('input_images_count_label') || 'Input Images'}</div>
                                    <div className="text-sm text-slate-200 flex items-center gap-2">
                                        <i className={`fas fa-images ${inputImagesCount ? 'text-green-400' : 'text-slate-500'}`}></i>
                                        <span>{inputImagesCount ? `${inputImagesCount} used` : 'None'}</span>
                                    </div>
                                </div>
                            </div>

                            {prompt && (
                                <div>
                                    <label htmlFor="prompt-display" className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">{t('user_prompt_label')}</label>
                                    <div id="prompt-display" className="text-sm text-slate-200 whitespace-pre-wrap leading-relaxed bg-slate-800/50 p-3 rounded-lg border border-slate-700/50 font-mono text-xs">
                                        {prompt}
                                    </div>
                                </div>
                            )}

                            {effectiveProof && (
                                <div className="space-y-3">
                                    <div className="flex items-center justify-between">
                                        <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider">Proof Data</label>
                                        <button
                                            onClick={copyProofJson}
                                            className="text-[10px] px-2 py-1 rounded border border-slate-600 text-slate-300 hover:text-white hover:border-slate-400 transition-colors"
                                        >
                                            {copiedProof ? 'Copied' : 'Copy JSON'}
                                        </button>
                                    </div>

                                    <div className="bg-slate-800/50 p-3 rounded-lg border border-slate-700/50 space-y-2 text-[11px]">
                                        {effectiveProof.workId && <div className="text-slate-300"><span className="text-slate-500">workId:</span> {effectiveProof.workId}</div>}
                                        {effectiveProof.createdAtUtc && <div className="text-slate-300"><span className="text-slate-500">createdAt:</span> {effectiveProof.createdAtUtc}</div>}
                                        {effectiveProof.recordedAtUtc && <div className="text-slate-300"><span className="text-slate-500">recordedAt:</span> {effectiveProof.recordedAtUtc}</div>}
                                        {(effectiveProof.authorName || effectiveProof.authorId) && (
                                            <div className="text-slate-300"><span className="text-slate-500">author:</span> {effectiveProof.authorName || effectiveProof.authorId}</div>
                                        )}
                                        {effectiveProof.model && <div className="text-slate-300"><span className="text-slate-500">model:</span> {effectiveProof.model}</div>}
                                        {effectiveProof.imageSha256 && (
                                            <div className="text-slate-300 break-all"><span className="text-slate-500">imageSha256:</span> {effectiveProof.imageSha256}</div>
                                        )}
                                        {effectiveProof.promptHash && (
                                            <div className="text-slate-300 break-all"><span className="text-slate-500">promptHash:</span> {effectiveProof.promptHash}</div>
                                        )}
                                        {effectiveProof.recordDigest && (
                                            <div className="text-slate-300 break-all"><span className="text-slate-500">recordDigest:</span> {effectiveProof.recordDigest}</div>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>

                        {onDownload && (
                            <div className="pt-4 border-t border-slate-700">
                                <Button 
                                    onClick={onDownload} 
                                    className="w-full justify-center" 
                                    icon="fa-download"
                                >
                                    {t('download_btn')}
                                </Button>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

export default ImageViewer;
