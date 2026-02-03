
import React, { useState, useEffect } from 'react';
import { TabId, HarmCategory, HarmBlockThreshold, MediaResolution } from '../types';
import Button from './ui/Button';
import { useLanguage } from '../contexts/LanguageContext';
import { useTheme } from '../contexts/ThemeContext';
import { logout, getCurrentUser } from '../services/authService';
import { getSystemSettings, saveSystemSettings } from '../services/settingsService';
import { SAFETY_CATEGORIES, SAFETY_THRESHOLDS, MEDIA_RESOLUTIONS_OPTIONS } from '../constants';

interface LayoutProps {
    children: React.ReactNode;
    activeTab: TabId;
    onTabChange: (tab: TabId) => void;
}

const Layout: React.FC<LayoutProps> = ({ children, activeTab, onTabChange }) => {
    const [showSettings, setShowSettings] = useState(false);
    const [showApps, setShowApps] = useState(false);
    const [apiKey, setApiKey] = useState('');
    const { t, language, setLanguage } = useLanguage();
    const { theme, setTheme, newYearMode, setNewYearMode } = useTheme();
    const user = getCurrentUser();
    
    // Settings State
    const [safetySettings, setSafetySettings] = useState(getSystemSettings().safetySettings);
    const [mediaResolution, setMediaResolution] = useState(getSystemSettings().mediaResolution);

    useEffect(() => {
        const storedKey = localStorage.getItem("gemini_api_key");
        if (storedKey) setApiKey(storedKey);
        setSafetySettings(getSystemSettings().safetySettings);
        setMediaResolution(getSystemSettings().mediaResolution);
    }, [showSettings]);

    const saveSettings = () => {
        // Save API Key
        let cleanKey = apiKey;
        if (cleanKey) {
             cleanKey = cleanKey.replace(/[^\x20-\x7E]/g, '').trim();
             localStorage.setItem("gemini_api_key", cleanKey);
             setApiKey(cleanKey);
        } else {
            localStorage.removeItem("gemini_api_key");
        }

        // Save Safety & Media Settings
        const currentSysSettings = getSystemSettings();
        saveSystemSettings({ 
            ...currentSysSettings, 
            safetySettings,
            mediaResolution
        });

        setShowSettings(false);
    };

    const updateSafetySetting = (category: HarmCategory, threshold: string) => {
        const current = [...safetySettings];
        const index = current.findIndex(s => s.category === category);
        const newSetting = { category, threshold: threshold as HarmBlockThreshold };
        
        if (index !== -1) {
            current[index] = newSetting;
        } else {
            current.push(newSetting);
        }
        setSafetySettings(current);
    };

    const getThresholdForCategory = (category: HarmCategory) => {
        const setting = safetySettings.find(s => s.category === category);
        return setting ? setting.threshold : HarmBlockThreshold.HARM_BLOCK_THRESHOLD_UNSPECIFIED;
    };

    const handleOpenAdmin = () => {
        onTabChange('admin');
        setShowSettings(false);
    };

    return (
        <div className="min-h-screen pb-12 relative font-sans selection:bg-theme-primary/30">
            {/* Header */}
            <header className="sticky top-0 z-50 px-4 pt-4 pb-2">
                <div className="max-w-[1920px] mx-auto bg-slate-900/80 backdrop-blur-xl border border-slate-700/60 rounded-2xl shadow-2xl shadow-black/20 relative">
                    {/* New Year Decor on Header */}
                    {newYearMode && (
                        <div className="absolute top-0 w-full h-1 bg-gradient-to-r from-red-500 via-green-500 to-white opacity-50 rounded-t-2xl"></div>
                    )}

                    <div className="flex flex-col md:flex-row justify-between items-center px-4 py-3 gap-4 relative z-10 min-h-[60px]">
                        
                        {/* 1. Logo (Left) */}
                        <div className="flex items-center gap-3 shrink-0 md:flex-1">
                            <div className="bg-gradient-to-br from-theme-primary to-theme-secondary w-9 h-9 rounded-xl flex items-center justify-center shadow-lg shadow-theme-glow">
                                <i className="fas fa-robot text-white text-sm"></i>
                            </div>
                            <span className="font-bold text-white text-lg tracking-tight hidden lg:block">Wite AI</span>
                            
                            {/* Apps Button */}
                            <div className="relative">
                                <button 
                                    onClick={() => setShowApps(!showApps)} 
                                    className={`ml-2 w-8 h-8 rounded-lg flex items-center justify-center transition-all ${showApps ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-white hover:bg-slate-800/50'}`}
                                >
                                    <i className="fas fa-th"></i>
                                </button>
                                
                                {/* Apps Slide-out Panel */}
                                {showApps && (
                                    <div className="absolute top-full left-0 mt-4 w-72 bg-slate-900/95 backdrop-blur-xl border border-slate-700/80 rounded-2xl shadow-2xl p-4 z-50 animate-fade-in origin-top-left">
                                        <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3 px-1">Wite Apps</h3>
                                        <div className="grid grid-cols-2 gap-2">
                                            <a href="https://wite-hik.ru/" target="_blank" rel="noreferrer" className="flex flex-col items-center justify-center gap-2 p-3 rounded-xl bg-slate-800/50 hover:bg-slate-800 border border-slate-700/50 hover:border-slate-600 transition-all group">
                                                <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-pink-500 to-rose-600 flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
                                                    <i className="fas fa-layer-group text-white"></i>
                                                </div>
                                                <span className="text-xs font-medium text-slate-300">Mockups</span>
                                            </a>
                                            <a href="https://wite-hik.ru/excel/" target="_blank" rel="noreferrer" className="flex flex-col items-center justify-center gap-2 p-3 rounded-xl bg-slate-800/50 hover:bg-slate-800 border border-slate-700/50 hover:border-slate-600 transition-all group">
                                                <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
                                                    <i className="fas fa-table text-white"></i>
                                                </div>
                                                <span className="text-xs font-medium text-slate-300">Excel</span>
                                            </a>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* 2. Main Navigation Tabs (Center) */}
                        <div className="flex-0 order-3 md:order-2 w-full md:w-auto">
                            <div className="flex items-center justify-center bg-slate-950/40 p-1.5 rounded-2xl border border-slate-700/50 shadow-inner">
                                {[
                                    { id: 'single', label: t('nav_single'), icon: 'fa-wand-magic-sparkles' },
                                    { id: 'batch', label: t('nav_batch'), icon: 'fa-layer-group' },
                                    { id: 'cloud-batch', label: t('nav_cloud'), icon: 'fa-cloud' },
                                ].map(tab => (
                                    <button
                                        key={tab.id}
                                        onClick={() => onTabChange(tab.id as TabId)}
                                        className={`
                                            flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wide transition-all duration-300 whitespace-nowrap
                                            ${activeTab === tab.id 
                                                ? 'bg-theme-primary text-white shadow-lg shadow-theme-primary/25 scale-105' 
                                                : 'text-slate-400 hover:text-white hover:bg-slate-800/50'}
                                        `}
                                    >
                                        <i className={`fas ${tab.icon} ${activeTab === tab.id ? 'text-white' : 'opacity-70'}`}></i>
                                        <span className="hidden sm:inline">{tab.label}</span>
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* 3. Right Side Controls (Right) */}
                        <div className="flex items-center justify-end gap-3 shrink-0 md:flex-1 order-2 md:order-3">
                            {/* Gallery Button */}
                            <button
                                onClick={() => onTabChange('gallery')}
                                className={`
                                    flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wide transition-all duration-200 border
                                    ${activeTab === 'gallery' 
                                        ? 'bg-emerald-600 text-white border-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.4)]' 
                                        : 'bg-emerald-900/20 text-emerald-400 border-emerald-500/30 hover:bg-emerald-900/40 hover:text-emerald-300'}
                                `}
                            >
                                <i className="fas fa-folder-open text-sm"></i>
                                <span className="hidden lg:inline">{t('nav_gallery')}</span>
                            </button>

                            <div className="h-6 w-px bg-slate-700 mx-1"></div>

                            <button 
                                onClick={() => setShowSettings(true)}
                                className="w-9 h-9 rounded-xl bg-slate-800/50 hover:bg-slate-700 border border-slate-700/50 flex items-center justify-center text-slate-400 hover:text-white transition-all hover:scale-105 active:scale-95"
                                title={t('settings_title')}
                            >
                                <i className="fas fa-cog"></i>
                            </button>
                            
                            <button 
                                onClick={logout} 
                                className="w-9 h-9 rounded-xl bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 flex items-center justify-center text-red-400 hover:text-red-300 transition-all hover:scale-105 active:scale-95" 
                                title="Sign out"
                            >
                                <i className="fas fa-sign-out-alt"></i>
                            </button>
                        </div>
                    </div>
                </div>
            </header>

            <main className="max-w-[1920px] mx-auto px-4 py-4">
                <div className="animate-fade-in">
                    {children}
                </div>
            </main>

            {/* Settings Modal */}
            {showSettings && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/80 backdrop-blur-md animate-fade-in p-4">
                    <div className="bg-slate-900 border border-slate-700/50 p-8 rounded-3xl w-full max-w-lg shadow-2xl relative overflow-hidden max-h-[90vh] overflow-y-auto custom-scrollbar">
                        <div className="absolute top-0 right-0 w-32 h-32 bg-theme-primary blur-3xl rounded-full pointer-events-none opacity-20"></div>

                        <h2 className="text-xl font-bold text-white mb-6 flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center text-theme-primary">
                                <i className="fas fa-cog"></i>
                            </div>
                            {t('settings_title')}
                        </h2>
                        
                        <div className="space-y-6 mb-8">
                            {/* API Key */}
                            <div>
                                <label htmlFor="api-key-input" className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 ml-1">
                                    {t('api_key_label')}
                                </label>
                                <input 
                                    id="api-key-input"
                                    name="api-key"
                                    type="password" 
                                    className="w-full bg-slate-800/50 border border-slate-700 text-slate-100 rounded-xl px-4 py-3.5 focus:ring-2 focus:ring-theme-primary/50 focus:border-theme-primary outline-none transition-all placeholder-slate-600"
                                    placeholder="Paste your Gemini API Key here..."
                                    value={apiKey}
                                    onChange={(e) => setApiKey(e.target.value)}
                                />
                            </div>

                            {/* Global Safety Settings */}
                            <div className="bg-slate-800/30 p-4 rounded-xl border border-slate-700/50">
                                <h3 className="text-sm font-bold text-white mb-1 flex items-center gap-2">
                                    <i className="fas fa-shield-alt text-theme-secondary"></i>
                                    {t('safety_settings_title')}
                                </h3>
                                <p className="text-xs text-slate-500 mb-4">{t('safety_desc')} (Global)</p>
                                
                                <div className="space-y-3">
                                    {SAFETY_CATEGORIES.map(category => (
                                        <div key={category.value} className="grid grid-cols-2 gap-4 items-center">
                                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                                                {category.label}
                                            </label>
                                            <select
                                                className="w-full bg-slate-900 border border-slate-700 text-slate-300 text-xs rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-theme-primary"
                                                value={getThresholdForCategory(category.value)}
                                                onChange={(e) => updateSafetySetting(category.value, e.target.value)}
                                            >
                                                {SAFETY_THRESHOLDS.map(th => (
                                                    <option key={th.value} value={th.value}>{th.label}</option>
                                                ))}
                                            </select>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Media Resolution */}
                            <div className="bg-slate-800/30 p-4 rounded-xl border border-slate-700/50">
                                <h3 className="text-sm font-bold text-white mb-1 flex items-center gap-2">
                                    <i className="fas fa-eye text-blue-400"></i>
                                    {t('media_res_title')}
                                </h3>
                                <p className="text-xs text-slate-500 mb-4">{t('media_res_desc')} (Gemini 3)</p>
                                <select 
                                    className="w-full bg-slate-900 border border-slate-700 text-slate-300 text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-theme-primary"
                                    value={mediaResolution}
                                    onChange={(e) => setMediaResolution(e.target.value as MediaResolution)}
                                >
                                    {MEDIA_RESOLUTIONS_OPTIONS.map(opt => (
                                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                                    ))}
                                </select>
                            </div>

                            {/* Language Switcher */}
                            <div>
                                <label htmlFor="language-select" className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 ml-1">
                                    {t('language_label')}
                                </label>
                                <div className="flex bg-slate-800 rounded-xl p-1 border border-slate-700/50">
                                    <button 
                                        onClick={() => setLanguage('en')}
                                        className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${language === 'en' ? 'bg-slate-700 text-white shadow-sm' : 'text-slate-500 hover:text-slate-300'}`}
                                    >
                                        English
                                    </button>
                                    <button 
                                        onClick={() => setLanguage('ru')}
                                        className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${language === 'ru' ? 'bg-slate-700 text-white shadow-sm' : 'text-slate-500 hover:text-slate-300'}`}
                                    >
                                        Русский
                                    </button>
                                </div>
                            </div>
                            
                            {/* Theme Selector */}
                            <div>
                                <fieldset>
                                <legend className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 ml-1">
                                    {t('appearance')}
                                </legend>
                                <div className="grid grid-cols-3 gap-2">
                                    <button 
                                        onClick={() => setTheme('default')}
                                        className={`py-2 rounded-xl text-xs font-bold border transition-all ${theme === 'default' ? 'bg-blue-600 border-blue-400 text-white' : 'bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-700'}`}
                                    >
                                        <i className="fas fa-circle text-[10px] mr-1 text-blue-300"></i> {t('theme_purple')}
                                    </button>
                                    <button 
                                        onClick={() => setTheme('raspberry')}
                                        className={`py-2 rounded-xl text-xs font-bold border transition-all ${theme === 'raspberry' ? 'bg-pink-600 border-pink-400 text-white' : 'bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-700'}`}
                                    >
                                        <i className="fas fa-circle text-[10px] mr-1 text-pink-300"></i> {t('theme_raspberry')}
                                    </button>
                                    <button 
                                        onClick={() => setTheme('green')}
                                        className={`py-2 rounded-xl text-xs font-bold border transition-all ${theme === 'green' ? 'bg-emerald-600 border-emerald-400 text-white' : 'bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-700'}`}
                                    >
                                        <i className="fas fa-circle text-[10px] mr-1 text-emerald-300"></i> {t('theme_green')}
                                    </button>
                                </div>
                                </fieldset>
                            </div>

                            {/* New Year Mode Toggle */}
                            <div className="bg-slate-800/50 p-4 rounded-xl border border-slate-700 flex justify-between items-center">
                                <div>
                                    <div className="text-white font-bold flex items-center gap-2">
                                        {t('new_year_mode')} <i className="fas fa-snowflake text-sky-400 animate-pulse"></i>
                                    </div>
                                    <div className="text-xs text-slate-400">{t('new_year_desc')}</div>
                                </div>
                                <label htmlFor="new-year-toggle" className="relative inline-flex items-center cursor-pointer">
                                    <input 
                                        id="new-year-toggle"
                                        name="new-year-mode"
                                        type="checkbox" 
                                        className="sr-only peer"
                                        checked={newYearMode}
                                        onChange={(e) => setNewYearMode(e.target.checked)}
                                    />
                                    <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-theme-primary"></div>
                                </label>
                            </div>

                             {/* Admin Panel Link */}
                            {user?.role === 'admin' && (
                                <div className="pt-2 border-t border-slate-800">
                                    <button 
                                        onClick={handleOpenAdmin}
                                        className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-purple-900/20 text-purple-400 hover:bg-purple-900/40 border border-purple-500/30 transition-all font-bold text-sm"
                                    >
                                        <i className="fas fa-user-shield"></i>
                                        {t('open_admin_panel')}
                                    </button>
                                </div>
                            )}
                        </div>

                        <div className="flex justify-end gap-3 sticky bottom-0 bg-slate-900/95 py-2">
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
