
import React, { useState, useEffect, useRef } from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import { ChatSession, ChatMessage, ModelType } from '../types';
import { sendChatMessage, downloadBase64Image, fileToBase64 } from '../services/geminiService';
import Button from '../components/ui/Button';
import ImageViewer from '../components/ui/ImageViewer';
import { MODELS } from '../constants';

const ChatInterface: React.FC = () => {
    const { t } = useLanguage();
    const [sessions, setSessions] = useState<ChatSession[]>([]);
    const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
    const [input, setInput] = useState('');
    const [attachments, setAttachments] = useState<string[]>([]); // base64
    const [isLoading, setIsLoading] = useState(false);
    const [isImageMode, setIsImageMode] = useState(false);
    const [viewingImage, setViewingImage] = useState<string | null>(null);
    const [selectedModel, setSelectedModel] = useState<ModelType>(ModelType.GEMINI_3_FLASH);

    const scrollRef = useRef<HTMLDivElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Effect to enforce Image Mode logic for Pro Image 3
    useEffect(() => {
        if (selectedModel === ModelType.GEMINI_3_PRO_IMAGE) {
            setIsImageMode(true);
        }
    }, [selectedModel]);

    // Load Sessions
    useEffect(() => {
        const stored = localStorage.getItem('wite_ai_chats');
        if (stored) {
            try {
                const parsed = JSON.parse(stored);
                setSessions(parsed);
                if (parsed.length > 0) setCurrentSessionId(parsed[0].id);
                else createNewSession();
            } catch (e) {
                createNewSession();
            }
        } else {
            createNewSession();
        }
    }, []);

    // Save Sessions
    useEffect(() => {
        if (sessions.length > 0) {
            localStorage.setItem('wite_ai_chats', JSON.stringify(sessions));
        }
    }, [sessions]);

    // Auto Scroll
    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [sessions, currentSessionId, isLoading]);

    const currentSession = sessions.find(s => s.id === currentSessionId);

    const createNewSession = () => {
        const newSession: ChatSession = {
            id: Date.now().toString(),
            title: t('chat_new'),
            messages: [],
            model: ModelType.GEMINI_3_FLASH,
            lastUpdated: Date.now()
        };
        setSessions(prev => [newSession, ...prev]);
        setCurrentSessionId(newSession.id);
        setAttachments([]);
        setInput('');
        setIsImageMode(false);
    };

    const deleteSession = (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        if (confirm("Delete this chat?")) {
            const newSessions = sessions.filter(s => s.id !== id);
            setSessions(newSessions);
            if (newSessions.length > 0) {
                setCurrentSessionId(newSessions[0].id);
            } else {
                createNewSession();
            }
        }
    };

    const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files) {
            const newAtt: string[] = [];
            for (let i = 0; i < e.target.files.length; i++) {
                const file = e.target.files[i];
                if (file.type.startsWith('image/')) {
                    const b64 = await fileToBase64(file);
                    newAtt.push(`data:${file.type};base64,${b64}`);
                }
            }
            setAttachments(prev => [...prev, ...newAtt]);
        }
    };

    const handleSend = async () => {
        if ((!input.trim() && attachments.length === 0) || !currentSessionId) return;

        const userMsg: ChatMessage = {
            id: Math.random().toString(36),
            role: 'user',
            text: input,
            images: [...attachments],
            timestamp: Date.now()
        };

        // Optimistic Update
        setSessions(prev => prev.map(s => {
            if (s.id === currentSessionId) {
                return {
                    ...s,
                    messages: [...s.messages, userMsg],
                    title: s.messages.length === 0 ? input.slice(0, 30) : s.title,
                    lastUpdated: Date.now()
                };
            }
            return s;
        }));

        setInput('');
        setAttachments([]);
        setIsLoading(true);

        try {
            // Prepare history for API (exclude current message as it's passed separately)
            const history = currentSession?.messages || [];
            
            const response = await sendChatMessage(
                selectedModel,
                history,
                userMsg.text || '',
                userMsg.images || [],
                isImageMode
            );

            const aiMsg: ChatMessage = {
                id: Math.random().toString(36),
                role: 'model',
                text: response.text,
                images: response.images,
                timestamp: Date.now()
            };

            setSessions(prev => prev.map(s => {
                if (s.id === currentSessionId) {
                    return {
                        ...s,
                        messages: [...s.messages, aiMsg],
                        lastUpdated: Date.now()
                    };
                }
                return s;
            }));

        } catch (error: any) {
            const errorMsg: ChatMessage = {
                id: Math.random().toString(36),
                role: 'model',
                text: `Error: ${error.message}`,
                timestamp: Date.now(),
                isError: true
            };
            setSessions(prev => prev.map(s => {
                if (s.id === currentSessionId) {
                    return { ...s, messages: [...s.messages, errorMsg] };
                }
                return s;
            }));
        } finally {
            setIsLoading(false);
        }
    };

    const isImageModeLocked = selectedModel === ModelType.GEMINI_3_PRO_IMAGE;

    return (
        // Adjusted height calculation to ensure input remains on screen (100vh - header - padding)
        <div className="flex h-[calc(100vh-100px)] gap-6">
            {viewingImage && (
                <ImageViewer 
                    src={viewingImage} 
                    onClose={() => setViewingImage(null)} 
                    onDownload={() => downloadBase64Image(viewingImage, 'chat-image.png', {
                        model: selectedModel,
                        createdAt: Date.now()
                    })}
                />
            )}

            {/* Sidebar */}
            <div className="w-80 bg-slate-900/60 backdrop-blur-md rounded-2xl border border-slate-700/50 flex flex-col hidden md:flex shadow-xl">
                <div className="p-4 border-b border-slate-700/50">
                    <Button onClick={createNewSession} className="w-full justify-center" icon="fa-plus">
                        {t('chat_new')}
                    </Button>
                </div>
                <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-1">
                    {sessions.map(s => (
                        <div 
                            key={s.id}
                            onClick={() => setCurrentSessionId(s.id)}
                            className={`
                                group flex justify-between items-center p-3 rounded-xl cursor-pointer transition-all
                                ${currentSessionId === s.id ? 'bg-blue-600/20 text-white border border-blue-500/30' : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'}
                            `}
                        >
                            <div className="truncate flex-1 text-sm font-medium pr-2">
                                {s.title || t('chat_new')}
                            </div>
                            <button 
                                onClick={(e) => deleteSession(s.id, e)}
                                className="opacity-0 group-hover:opacity-100 hover:text-red-400 transition-opacity p-1"
                            >
                                <i className="fas fa-trash-alt text-xs"></i>
                            </button>
                        </div>
                    ))}
                </div>
            </div>

            {/* Main Chat Area */}
            <div className="flex-1 bg-slate-900/60 backdrop-blur-md rounded-2xl border border-slate-700/50 flex flex-col shadow-xl overflow-hidden relative min-h-0">
                
                {/* Chat Header */}
                <div className="h-14 border-b border-slate-700/50 flex items-center justify-between px-6 bg-slate-900/40 shrink-0">
                    <div className="flex items-center gap-3">
                        <i className="fas fa-comments text-blue-500"></i>
                        <span className="font-bold text-white truncate max-w-[200px]">
                            {currentSession?.title}
                        </span>
                    </div>
                    <div className="flex items-center gap-3">
                         {/* Model Selector within Chat */}
                        <div className="relative">
                            <select 
                                value={selectedModel}
                                onChange={(e) => setSelectedModel(e.target.value as ModelType)}
                                className="appearance-none bg-slate-800 border border-slate-700 text-slate-300 text-xs rounded-lg px-3 py-1.5 pr-8 focus:outline-none focus:border-blue-500 cursor-pointer"
                            >
                                {MODELS.map(m => ( 
                                    <option key={m.value} value={m.value}>{m.label}</option>
                                ))}
                            </select>
                            <i className="fas fa-chevron-down absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-slate-500 pointer-events-none"></i>
                        </div>
                    </div>
                </div>

                {/* Messages List - flex-1 with overflow-auto allows it to take remaining space but scroll */}
                <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-6 min-h-0" ref={scrollRef}>
                    {currentSession?.messages.length === 0 ? (
                        <div className="h-full flex flex-col items-center justify-center text-slate-500 opacity-60">
                            <i className="fas fa-robot text-6xl mb-4 text-slate-700"></i>
                            <p className="text-xl font-light">{t('chat_no_messages')}</p>
                        </div>
                    ) : (
                        currentSession?.messages.map(msg => (
                            <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                <div className={`max-w-[85%] rounded-2xl p-4 shadow-md ${
                                    msg.role === 'user' 
                                    ? 'bg-blue-600/20 text-white border border-blue-500/30 rounded-br-none' 
                                    : msg.isError 
                                        ? 'bg-red-500/10 text-red-300 border border-red-500/30' 
                                        : 'bg-slate-800 text-slate-200 border border-slate-700 rounded-bl-none'
                                }`}>
                                    {/* Images */}
                                    {msg.images && msg.images.length > 0 && (
                                        <div className="flex flex-wrap gap-2 mb-3">
                                            {msg.images.map((img, idx) => (
                                                <img 
                                                    key={idx} 
                                                    src={img} 
                                                    className="max-w-full max-h-64 rounded-lg cursor-pointer border border-white/10" 
                                                    onClick={() => setViewingImage(img)}
                                                />
                                            ))}
                                        </div>
                                    )}
                                    
                                    {/* Text */}
                                    <div className="whitespace-pre-wrap leading-relaxed text-sm">
                                        {msg.text}
                                    </div>
                                    
                                    <div className="text-[10px] opacity-40 mt-2 text-right">
                                        {new Date(msg.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                                    </div>
                                </div>
                            </div>
                        ))
                    )}
                    {isLoading && (
                         <div className="flex justify-start">
                            <div className="bg-slate-800 rounded-2xl rounded-bl-none p-4 border border-slate-700 flex items-center gap-2">
                                <div className="w-2 h-2 bg-slate-500 rounded-full animate-bounce"></div>
                                <div className="w-2 h-2 bg-slate-500 rounded-full animate-bounce delay-100"></div>
                                <div className="w-2 h-2 bg-slate-500 rounded-full animate-bounce delay-200"></div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Input Area - shrink-0 prevents it from being squashed */}
                <div className="p-4 bg-slate-900/80 border-t border-slate-700/50 backdrop-blur-md shrink-0">
                    {isImageMode && (
                        <div className="mb-2 flex items-center gap-2 text-purple-400 text-xs animate-pulse bg-purple-900/20 px-3 py-1.5 rounded-lg border border-purple-500/20 w-fit">
                            <i className="fas fa-magic"></i>
                            {t('chat_model_hint')}
                        </div>
                    )}
                    
                    {attachments.length > 0 && (
                        <div className="flex gap-2 mb-3 overflow-x-auto pb-1">
                            {attachments.map((att, idx) => (
                                <div key={idx} className="relative group w-16 h-16 shrink-0">
                                    <img src={att} className="w-full h-full object-cover rounded-lg border border-slate-600" />
                                    <button 
                                        onClick={() => setAttachments(prev => prev.filter((_, i) => i !== idx))}
                                        className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full w-4 h-4 flex items-center justify-center text-[10px]"
                                    >
                                        <i className="fas fa-times"></i>
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}

                    <div className="flex items-end gap-3">
                         <input 
                            type="file" 
                            multiple 
                            accept="image/*" 
                            className="hidden" 
                            ref={fileInputRef}
                            onChange={handleFileSelect}
                        />
                        <button 
                            onClick={() => fileInputRef.current?.click()}
                            className="w-12 h-12 rounded-xl bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700 border border-slate-700 flex items-center justify-center transition-all shrink-0"
                            title="Attach Image"
                        >
                            <i className="fas fa-paperclip text-lg"></i>
                        </button>
                        
                        <button 
                            onClick={() => setIsImageMode(!isImageMode)}
                            disabled={isImageModeLocked}
                            className={`w-12 h-12 rounded-xl border flex items-center justify-center transition-all shrink-0 ${
                                isImageMode 
                                    ? 'bg-purple-600/20 text-purple-400 border-purple-500/50 shadow-[0_0_15px_rgba(168,85,247,0.2)]' 
                                    : 'bg-slate-800 text-slate-400 hover:text-white border-slate-700'
                            } ${isImageModeLocked ? 'opacity-50 cursor-not-allowed' : ''}`}
                            title="Toggle Image Generation Mode"
                        >
                            <i className="fas fa-image text-lg"></i>
                        </button>

                        <div className="flex-1 bg-slate-800/50 border border-slate-700 rounded-xl p-3 focus-within:ring-2 focus-within:ring-blue-500/50 focus-within:border-blue-500 transition-all">
                            <textarea
                                value={input}
                                onChange={(e) => setInput(e.target.value)}
                                onKeyDown={(e) => {
                                    if(e.key === 'Enter' && !e.shiftKey) {
                                        e.preventDefault();
                                        handleSend();
                                    }
                                }}
                                placeholder={t('chat_placeholder')}
                                className="w-full bg-transparent text-white outline-none resize-none max-h-32 text-sm custom-scrollbar"
                                rows={1}
                                style={{ minHeight: '24px' }}
                            />
                        </div>

                        <button 
                            onClick={handleSend}
                            disabled={isLoading || (!input.trim() && attachments.length === 0)}
                            className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 text-white shadow-lg shadow-blue-500/20 hover:shadow-blue-500/40 hover:-translate-y-0.5 transition-all flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
                        >
                            <i className="fas fa-paper-plane text-lg"></i>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ChatInterface;
