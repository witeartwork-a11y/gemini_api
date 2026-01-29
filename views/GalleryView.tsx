
import React, { useState, useEffect } from 'react';
import { getUserHistory, deleteGeneration } from '../services/historyService';
import { getCurrentUser } from '../services/authService';
import { downloadBase64Image } from '../services/geminiService';
import { HistoryItem } from '../types';
import ImageViewer from '../components/ui/ImageViewer';
import Button from '../components/ui/Button';

type FilterType = 'all' | 'single' | 'batch' | 'cloud';

const GalleryView: React.FC = () => {
    const user = getCurrentUser();
    const [history, setHistory] = useState<HistoryItem[]>([]);
    const [selectedDate, setSelectedDate] = useState<string>('');
    const [filterType, setFilterType] = useState<FilterType>('all');
    const [viewingItem, setViewingItem] = useState<HistoryItem | null>(null);

    useEffect(() => {
        if (user) {
            // Default to today
            const today = new Date().toISOString().split('T')[0];
            setSelectedDate(today);
            loadHistory(today);
        }
    }, [user?.id]);

    const loadHistory = async (date: string) => {
        if (!user) return;
        const items = await getUserHistory(user.id, date);
        setHistory(items);
    };

    const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const date = e.target.value;
        setSelectedDate(date);
        loadHistory(date);
    };

    const handleDownload = async (item: HistoryItem) => {
        const filename = `${item.dateStr}_${item.type}_${item.id}.png`;
        
        if (item.imageUrl) {
            // Fetch blob from URL and download
            try {
                const response = await fetch(item.imageUrl);
                const blob = await response.blob();
                const url = window.URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.href = url;
                link.download = filename;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                window.URL.revokeObjectURL(url);
            } catch (e) {
                console.error("Download failed", e);
            }
        } else if (item.image) {
            // Fallback for old base64 items
            downloadBase64Image(item.image, filename);
        }
    };

    const handleDelete = async (item: HistoryItem, e: React.MouseEvent) => {
        e.stopPropagation();
        if (!user) return;
        if (confirm("Permanently delete this generation?")) {
            const success = await deleteGeneration(user.id, item.id);
            if (success) {
                setHistory(prev => prev.filter(i => i.id !== item.id));
                if (viewingItem?.id === item.id) setViewingItem(null);
            } else {
                alert("Failed to delete item. Ensure server is running.");
            }
        }
    };

    // Filter Logic
    const filteredHistory = history.filter(item => {
        if (filterType === 'all') return true;
        if (filterType === 'cloud') return item.type === 'cloud';
        return item.type === filterType;
    });

    return (
        <div className="space-y-6">
            {viewingItem && (viewingItem.imageUrl || viewingItem.image) && (
                <ImageViewer 
                    src={viewingItem.imageUrl || viewingItem.image!} 
                    prompt={viewingItem.prompt}
                    onClose={() => setViewingItem(null)} 
                    onDownload={() => handleDownload(viewingItem)}
                />
            )}

            {/* Controls Bar */}
            <div className="bg-slate-800/50 backdrop-blur-sm p-4 rounded-2xl border border-slate-700 flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
                <div>
                    <h2 className="text-xl font-bold text-white flex items-center gap-2">
                        <i className="fas fa-folder-open text-yellow-500"></i>
                        Generation Gallery
                    </h2>
                    <p className="text-xs text-slate-400 mt-1">
                        Files stored in: <span className="font-mono bg-slate-900 px-1 rounded">data/{user?.id}/images/{selectedDate}/</span>
                    </p>
                </div>

                <div className="flex flex-wrap gap-4 items-center w-full lg:w-auto">
                    {/* Type Filters */}
                    <div className="flex bg-slate-900 rounded-lg p-1 border border-slate-700">
                        {(['all', 'single', 'batch', 'cloud'] as FilterType[]).map(type => (
                            <button
                                key={type}
                                onClick={() => setFilterType(type)}
                                className={`
                                    px-3 py-1.5 rounded-md text-sm font-medium transition-all capitalize
                                    ${filterType === type 
                                        ? 'bg-blue-600 text-white shadow-sm' 
                                        : 'text-slate-400 hover:text-white hover:bg-slate-800'}
                                `}
                            >
                                {type}
                            </button>
                        ))}
                    </div>

                    {/* Date Filter */}
                    <div className="flex items-center gap-2 bg-slate-900 rounded-lg p-1 border border-slate-700 px-2">
                        <i className="fas fa-calendar-alt text-slate-500"></i>
                        <input 
                            type="date" 
                            className="bg-transparent text-white text-sm outline-none border-none py-1"
                            value={selectedDate}
                            onChange={handleDateChange}
                        />
                        <button 
                            onClick={() => loadHistory(selectedDate)}
                            className="text-slate-400 hover:text-white transition-colors"
                            title="Refresh"
                        >
                            <i className="fas fa-sync"></i>
                        </button>
                    </div>
                </div>
            </div>

            {/* Grid */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                {filteredHistory.map(item => (
                    <div key={item.id} className="bg-slate-800 rounded-xl overflow-hidden border border-slate-700 group relative flex flex-col shadow-lg transition-transform hover:-translate-y-1">
                        <div className="aspect-square bg-slate-900 relative">
                            {(item.imageUrl || item.image) ? (
                                <img 
                                    src={item.imageUrl || item.image} 
                                    className="w-full h-full object-cover cursor-pointer"
                                    onClick={() => setViewingItem(item)}
                                    loading="lazy"
                                    decoding="async"
                                    alt="Generated Content"
                                />
                            ) : (
                                <div className="p-4 text-xs text-slate-500 h-full flex items-center justify-center text-center">
                                    <i className="fas fa-file-alt text-2xl mb-2 block"></i>
                                    {item.resultText ? "Text Output" : "No Media"}
                                </div>
                            )}

                            {/* Hover Overlay with Actions */}
                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2 pointer-events-none">
                                {(item.imageUrl || item.image) && (
                                    <>
                                        <button 
                                            onClick={() => setViewingItem(item)}
                                            className="pointer-events-auto w-10 h-10 rounded-full bg-slate-800/90 text-white flex items-center justify-center hover:bg-blue-600 transition-colors"
                                            title="View Details"
                                        >
                                            <i className="fas fa-eye"></i>
                                        </button>
                                        <button 
                                            onClick={() => handleDownload(item)}
                                            className="pointer-events-auto w-10 h-10 rounded-full bg-slate-800/90 text-white flex items-center justify-center hover:bg-emerald-600 transition-colors"
                                            title="Download"
                                        >
                                            <i className="fas fa-download"></i>
                                        </button>
                                    </>
                                )}
                                <button 
                                    onClick={(e) => handleDelete(item, e)}
                                    className="pointer-events-auto w-10 h-10 rounded-full bg-slate-800/90 text-red-400 flex items-center justify-center hover:bg-red-600 hover:text-white transition-colors"
                                    title="Delete"
                                >
                                    <i className="fas fa-trash"></i>
                                </button>
                            </div>
                        </div>
                        
                        <div className="p-3 flex-1 flex flex-col">
                            <div className="flex justify-between items-start mb-2">
                                <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded border ${
                                    item.type === 'single' ? 'bg-purple-900/30 text-purple-300 border-purple-800' :
                                    item.type === 'batch' ? 'bg-blue-900/30 text-blue-300 border-blue-800' :
                                    'bg-emerald-900/30 text-emerald-300 border-emerald-800'
                                }`}>
                                    {item.type}
                                </span>
                                <span className="text-[10px] text-slate-500">
                                    {new Date(item.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                                </span>
                            </div>
                            <div className="mt-auto text-xs text-slate-400 truncate" title={item.prompt}>
                                {item.prompt}
                            </div>
                        </div>
                    </div>
                ))}
                
                {filteredHistory.length === 0 && (
                    <div className="col-span-full py-20 text-center text-slate-500 bg-slate-800/20 rounded-2xl border-2 border-dashed border-slate-800">
                        <i className="fas fa-images text-5xl mb-4 opacity-20"></i>
                        <p className="text-lg font-medium">No generations found</p>
                        <p className="text-sm opacity-60 mt-1">
                            {filterType !== 'all' 
                                ? `No items found for "${filterType}" on ${selectedDate}` 
                                : `Try generating some images or changing the date.`}
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
};

export default GalleryView;
