import React, { useState, useEffect } from 'react';
import { TabId } from '../types';
import Button from './ui/Button';
import { useLanguage } from '../contexts/LanguageContext';

interface LayoutProps {
    children: React.ReactNode;
    activeTab: TabId;
    onTabChange: (tab: TabId) => void;
}

const Layout: React.FC<LayoutProps> = ({ children, activeTab, onTabChange }) => {
    const [showSettings, setShowSettings] = useState(false);
    const [apiKey, setApiKey] = useState('');
    const { t, language, setLanguage } = useLanguage();

    useEffect(() => {
        const storedKey = localStorage.getItem("gemini_api_key");
        if (storedKey) setApiKey(storedKey);
    }, []);

    const saveSettings = () => {
        let cleanKey = apiKey;
        if (cleanKey) {
             cleanKey = cleanKey.replace(/[^\x20-\x7E]/g, '').trim();
             localStorage.setItem("gemini_api_key", cleanKey);
             setApiKey(cleanKey);
        } else {
            localStorage.removeItem("gemini_api_key");
        }
        setShowSettings(false);
    };

    return (
        <div className="min-h-screen pb-12 relative">
            {/* Header */}
            <header className="bg-slate-900/80 backdrop-blur-md border-b border-slate-700 sticky top-0 z-50">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex justify-between items-center h-20">
                        <div className="flex items-center gap-3">
                            <div className="bg-gradient-to-r from-blue-600 to-purple-600 p-2 rounded-lg">
                                <i className="fas fa-robot text-white text-xl"></i>
                            </div>
                            <h1 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-purple-400 hidden sm:block">
                                Gemini Image Processor
                            </h1>
                            <h1 className="text-xl font-bold text-white sm:hidden">Gemini IP</h1>
                        </div>
                        <div className="flex items-center gap-4">
                            {/* Language Switcher */}
                            <div className="flex items-center bg-slate-800 rounded-lg p-1 border border-slate-700">
                                <button 
                                    onClick={() => setLanguage('en')}
                                    className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${language === 'en' ? 'bg-slate-600 text-white' : 'text-slate-400 hover:text-white'}`}
                                >
                                    EN
                                </button>
                                <button 
                                    onClick={() => setLanguage('ru')}
                                    className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${language === 'ru' ? 'bg-slate-600 text-white' : 'text-slate-400 hover:text-white'}`}
                                >
                                    RU
                                </button>
                            </div>

                            <button 
                                onClick={() => setShowSettings(true)}
                                className="text-slate-400 hover:text-white transition-colors flex items-center gap-2"
                                title={t('settings_title')}
                            >
                                <i className="fas fa-cog text-lg"></i>
                            </button>
                        </div>
                    </div>
                </div>
            </header>

            <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                {/* Tabs */}
                <div className="flex flex-wrap gap-2 mb-8 bg-slate-800/50 p-1.5 rounded-xl border border-slate-700 w-fit">
                    {[
                        { id: 'single', label: t('nav_single'), icon: 'fa-magic' },
                        { id: 'batch', label: t('nav_batch'), icon: 'fa-layer-group' },
                        { id: 'cloud-batch', label: t('nav_cloud'), icon: 'fa-cloud' },
                    ].map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => onTabChange(tab.id as TabId)}
                            className={`
                                flex items-center gap-2 px-6 py-3 rounded-lg font-medium transition-all duration-200
                                ${activeTab === tab.id 
                                    ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/50' 
                                    : 'text-slate-400 hover:text-white hover:bg-slate-700/50'}
                            `}
                        >
                            <i className={`fas ${tab.icon}`}></i>
                            {tab.label}
                        </button>
                    ))}
                </div>

                {/* Content */}
                <div className="animate-fade-in">
                    {children}
                </div>
            </main>

            {/* Settings Modal */}
            {showSettings && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm animate-fade-in">
                    <div className="bg-slate-800 border border-slate-700 p-8 rounded-2xl w-full max-w-md shadow-2xl">
                        <h2 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
                            <i className="fas fa-cog text-blue-500"></i> {t('settings_title')}
                        </h2>
                        
                        <div className="mb-6">
                            <label className="block text-sm font-medium text-slate-300 mb-2">
                                {t('api_key_label')}
                            </label>
                            <input 
                                type="password" 
                                className="w-full bg-slate-900 border border-slate-600 text-white rounded-lg px-4 py-3 focus:ring-2 focus:ring-blue-500 outline-none"
                                placeholder="Enter your API Key..."
                                value={apiKey}
                                onChange={(e) => setApiKey(e.target.value)}
                            />
                        </div>

                        <div className="flex justify-end gap-3">
                            <Button variant="secondary" onClick={() => setShowSettings(false)}>
                                {t('cancel')}
                            </Button>
                            <Button variant="primary" onClick={saveSettings}>
                                {t('save')}
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Layout;