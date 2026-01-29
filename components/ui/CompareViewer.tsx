
import React, { useState, useEffect, useRef } from 'react';
import { useLanguage } from '../../contexts/LanguageContext';

interface CompareViewerProps {
    original: string;
    result: string;
    onClose: () => void;
}

const CompareViewer: React.FC<CompareViewerProps> = ({ original, result, onClose }) => {
    const [sliderPosition, setSliderPosition] = useState(50);
    const [isResizing, setIsResizing] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);
    const { t } = useLanguage();

    // Handle ESC key
    useEffect(() => {
        const handleEsc = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', handleEsc);
        return () => window.removeEventListener('keydown', handleEsc);
    }, [onClose]);

    // Handle Slider Drag
    const handleMouseDown = () => setIsResizing(true);
    const handleMouseUp = () => setIsResizing(false);
    const handleMouseMove = (e: React.MouseEvent) => {
        if (!isResizing || !containerRef.current) return;
        const rect = containerRef.current.getBoundingClientRect();
        const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
        setSliderPosition((x / rect.width) * 100);
    };

    return (
        <div 
            className="fixed inset-0 z-[200] bg-black/95 flex flex-col items-center justify-center p-4 animate-fade-in backdrop-blur-sm"
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
        >
            <div className="absolute top-4 right-4 flex gap-4">
                <div className="bg-slate-800/80 px-4 py-2 rounded-lg text-white text-sm">
                    {t('drag_compare')}
                </div>
                <button 
                    onClick={onClose}
                    className="text-white/70 hover:text-white bg-slate-800/80 p-2 rounded-full transition-colors w-10 h-10 flex items-center justify-center"
                >
                    <i className="fas fa-times text-xl"></i>
                </button>
            </div>

            <div 
                className="relative w-full max-w-5xl aspect-video md:aspect-auto md:h-[80vh] bg-black border border-slate-700 rounded-xl overflow-hidden select-none cursor-col-resize"
                ref={containerRef}
                onMouseMove={handleMouseMove}
            >
                {/* Result Image (Background / Right Side) */}
                <img 
                    src={result} 
                    alt="Result" 
                    className="absolute inset-0 w-full h-full object-contain"
                />

                {/* Original Image (Foreground / Left Side / Clipped) */}
                <div 
                    className="absolute inset-0 w-full h-full overflow-hidden border-r-2 border-white/50 bg-black"
                    style={{ width: `${sliderPosition}%` }}
                >
                    <img 
                        src={original} 
                        alt="Original" 
                        className="absolute inset-0 w-full h-full object-contain"
                        // Important: width needs to be 100% of PARENT container, not this clipped div
                        style={{ width: containerRef.current ? `${containerRef.current.clientWidth}px` : '100vw', maxWidth: 'none' }}
                    />
                </div>

                {/* Slider Handle */}
                <div 
                    className="absolute top-0 bottom-0 w-1 bg-white cursor-ew-resize shadow-[0_0_10px_rgba(0,0,0,0.5)] z-10"
                    style={{ left: `${sliderPosition}%` }}
                    onMouseDown={handleMouseDown}
                >
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-8 bg-white rounded-full flex items-center justify-center shadow-lg text-slate-900">
                        <i className="fas fa-arrows-alt-h text-xs"></i>
                    </div>
                </div>

                {/* Labels */}
                <div className="absolute bottom-4 left-4 bg-black/50 text-white px-2 py-1 rounded text-xs pointer-events-none">
                    {t('original')}
                </div>
                <div className="absolute bottom-4 right-4 bg-black/50 text-white px-2 py-1 rounded text-xs pointer-events-none">
                    {t('result')}
                </div>
            </div>
        </div>
    );
};

export default CompareViewer;