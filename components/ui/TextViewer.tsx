import React, { useEffect } from 'react';
import Button from './Button';
import { useLanguage } from '../../contexts/LanguageContext';

interface TextViewerProps {
    text: string;
    prompt?: string;
    title?: string;
    date?: number | string;
    onClose: () => void;
    onDownload?: () => void;
}

const TextViewer: React.FC<TextViewerProps> = ({ text, prompt, title, date, onClose, onDownload }) => {
    const { t } = useLanguage();

    useEffect(() => {
        const handleEsc = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', handleEsc);
        return () => window.removeEventListener('keydown', handleEsc);
    }, [onClose]);

    return (
        <div
            className="fixed inset-0 z-[200] bg-black/95 backdrop-blur-md flex items-center justify-center p-4"
            onClick={onClose}
        >
            <div
                className="w-full max-w-4xl h-[85vh] bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl flex flex-col"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="px-5 py-4 border-b border-slate-700 flex items-center justify-between gap-4">
                    <div className="min-w-0">
                        <h3 className="text-white font-bold truncate">{title || 'Text Output'}</h3>
                        {date && <div className="text-xs text-slate-400 mt-1">{new Date(date).toLocaleString()}</div>}
                    </div>
                    <div className="flex items-center gap-2">
                        {onDownload && (
                            <Button variant="secondary" onClick={onDownload} icon="fa-download" className="py-2 px-3 text-xs h-auto">
                                {t('download_btn')}
                            </Button>
                        )}
                        <button
                            onClick={onClose}
                            className="w-9 h-9 rounded-full bg-slate-800 text-slate-200 hover:bg-slate-700 transition-colors"
                            title="Close"
                        >
                            <i className="fas fa-times"></i>
                        </button>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-5 overflow-hidden flex-1">
                    <div className="h-full bg-slate-950/60 border border-slate-800 rounded-xl p-4 overflow-y-auto custom-scrollbar">
                        <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-2">{t('user_prompt_label')}</div>
                        <div className="text-sm text-slate-300 whitespace-pre-wrap leading-relaxed">
                            {prompt || '—'}
                        </div>
                    </div>
                    <div className="h-full bg-slate-950/60 border border-slate-800 rounded-xl p-4 overflow-y-auto custom-scrollbar">
                        <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-2">Model Output</div>
                        <pre className="text-sm text-slate-200 whitespace-pre-wrap leading-relaxed font-mono">
                            {text}
                        </pre>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default TextViewer;
