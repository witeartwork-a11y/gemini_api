
import React, { useEffect, useState, useRef } from 'react';
import Button from './Button';

interface ImageViewerProps {
    src: string;
    alt?: string;
    prompt?: string;
    onClose: () => void;
    onDownload?: () => void;
}

const ImageViewer: React.FC<ImageViewerProps> = ({ src, alt, prompt, onClose, onDownload }) => {
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
            {/* Top Toolbar */}
            <div 
                className="absolute top-4 right-4 z-50 flex gap-2 pointer-events-auto" 
                onClick={(e) => e.stopPropagation()}
            >
                <div className="bg-slate-800/80 rounded-full flex items-center px-2 mr-2 border border-slate-700">
                    <button 
                        onClick={() => setZoom(z => Math.max(1, z - 0.5))}
                        className="w-8 h-8 flex items-center justify-center text-white/70 hover:text-white"
                    >
                        <i className="fas fa-minus text-xs"></i>
                    </button>
                    <span className="text-xs font-mono w-10 text-center text-slate-300">{Math.round(zoom * 100)}%</span>
                    <button 
                        onClick={() => setZoom(z => Math.min(5, z + 0.5))}
                        className="w-8 h-8 flex items-center justify-center text-white/70 hover:text-white"
                    >
                        <i className="fas fa-plus text-xs"></i>
                    </button>
                </div>
                <button 
                    onClick={onClose}
                    className="text-white/70 hover:text-white bg-slate-800/50 p-2 rounded-full transition-colors w-10 h-10 flex items-center justify-center border border-slate-700"
                >
                    <i className="fas fa-times text-xl"></i>
                </button>
            </div>

            <div className="flex flex-col md:flex-row w-full h-full max-w-[95vw] max-h-[95vh] mx-auto gap-6 pointer-events-none">
                
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
                        className="w-full md:w-80 bg-slate-900/90 border-l border-slate-700 p-6 flex flex-col h-auto md:h-full rounded-xl overflow-hidden backdrop-blur-md pointer-events-auto cursor-default shadow-2xl shrink-0"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                            <i className="fas fa-info-circle text-blue-500"></i>
                            Info
                        </h3>
                        
                        <div className="flex-1 overflow-y-auto custom-scrollbar mb-4">
                            <label htmlFor="prompt-display" className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Prompt</label>
                            <div id="prompt-display" className="text-sm text-slate-200 whitespace-pre-wrap leading-relaxed bg-slate-800/50 p-3 rounded-lg border border-slate-700/50">
                                {prompt}
                            </div>
                        </div>

                        {onDownload && (
                            <div className="pt-4 border-t border-slate-700">
                                <Button 
                                    onClick={onDownload} 
                                    className="w-full justify-center" 
                                    icon="fa-download"
                                >
                                    Download Image
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
