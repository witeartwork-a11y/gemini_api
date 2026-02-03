
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
    onClose: () => void;
    onDownload?: () => void;
}

const ImageViewer: React.FC<ImageViewerProps> = ({ src, alt, prompt, date, resolution, inputImagesCount, onClose, onDownload }) => {
    const { t } = useLanguage();
    const [zoom, setZoom] = useState(1);
    const [pan, setPan] = useState({ x: 0, y: 0 });
    const [isDragging, setIsDragging] = useState(false);
    const dragStart = useRef({ x: 0, y: 0 });
    const startClientPos = useRef({ x: 0, y: 0 });

    // Close on Escape key
    useEffect(() => {
        const handleEsc = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', handleEsc);
        return () => window.removeEventListener('keydown', handleEsc);
    }, [onClose]);

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
                {prompt && (
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

                            <div>
                                <label htmlFor="prompt-display" className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">{t('user_prompt_label')}</label>
                                <div id="prompt-display" className="text-sm text-slate-200 whitespace-pre-wrap leading-relaxed bg-slate-800/50 p-3 rounded-lg border border-slate-700/50 font-mono text-xs">
                                    {prompt}
                                </div>
                            </div>
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
