
import React, { useState, useEffect } from 'react';
import { TabId, HarmCategory, HarmBlockThreshold, MediaResolution, ApiProvider, ServerApiKey } from '../types';
import Button from './ui/Button';
import { useLanguage } from '../contexts/LanguageContext';
import { useTheme } from '../contexts/ThemeContext';
import { logout, logoutForAccountSwitch, getCurrentUser, getSavedAccounts, switchAccount, removeSavedAccount, SavedAccount } from '../services/authService';
import { getSystemSettings, saveSystemSettings } from '../services/settingsService';
import { SAFETY_CATEGORIES, SAFETY_THRESHOLDS, MEDIA_RESOLUTIONS_OPTIONS } from '../constants';
import { getAvailableKeysByProvider, selectServerKey, clearSelectedServerKey, getSelectedServerKeyId } from '../services/apiKeyService';

interface LayoutProps {
    children: React.ReactNode;
    activeTab: TabId;
    onTabChange: (tab: TabId) => void;
}

const Layout: React.FC<LayoutProps> = ({ children, activeTab, onTabChange }) => {
    const [showSettings, setShowSettings] = useState(false);
    const [showApps, setShowApps] = useState(false);
    const [showAccountSwitcher, setShowAccountSwitcher] = useState(false);
    const [apiKey, setApiKey] = useState('');
    const { t, language, setLanguage } = useLanguage();
    const { theme, setTheme, newYearMode, setNewYearMode } = useTheme();
    const user = getCurrentUser();
    const savedAccounts = getSavedAccounts();
    const otherAccounts = savedAccounts.filter(a => a.id !== user?.id);

    const handleSwitchAccount = async (account: SavedAccount) => {
        const password = window.prompt(`${t('enter_password_for')} ${account.username}:`);
        if (!password) return;
        const success = await switchAccount(account.id, password);
        if (success) {
            window.location.reload();
        } else {
            alert(t('switch_account_failed'));
        }
    };

    const handleRemoveSavedAccount = (accountId: string, e: React.MouseEvent) => {
        e.stopPropagation();
        removeSavedAccount(accountId);
        setShowAccountSwitcher(false);
    };

    // Close dropdowns on outside click
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            const target = e.target as HTMLElement;
            if (showAccountSwitcher && !target.closest('[data-account-switcher]')) {
                setShowAccountSwitcher(false);
            }
            if (showApps && !target.closest('[data-apps-menu]')) {
                setShowApps(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [showAccountSwitcher, showApps]);
    
    // Settings State
    const [safetySettings, setSafetySettings] = useState(getSystemSettings().safetySettings);
    const [mediaResolution, setMediaResolution] = useState(getSystemSettings().mediaResolution);
    
    // Server API Keys State
    const [availableServerKeys, setAvailableServerKeys] = useState<ServerApiKey[]>([]);
    const [selectedKeyId, setSelectedKeyId] = useState<string | null>(null);
    const [useOwnKey, setUseOwnKey] = useState(false);
    const [loadingKeys, setLoadingKeys] = useState(false);

    const getUserScopedGeminiKeyStorageKey = () => {
        return user?.id ? `gemini_api_key_${user.id}` : 'gemini_api_key';
    };

    useEffect(() => {
        const scopedKey = localStorage.getItem(getUserScopedGeminiKeyStorageKey());
        const legacyKey = localStorage.getItem("gemini_api_key");
        const storedKey = scopedKey || legacyKey;
        if (storedKey) setApiKey(storedKey);
        setSafetySettings(getSystemSettings().safetySettings);
        setMediaResolution(getSystemSettings().mediaResolution);

        if (showSettings) {
            // Load available server keys when settings modal opens
            setLoadingKeys(true);
            getAvailableKeysByProvider(ApiProvider.GOOGLE).then(keys => {
                setAvailableServerKeys(keys);
                const currentSelectedId = getSelectedServerKeyId(ApiProvider.GOOGLE);
                if (currentSelectedId && keys.some(k => k.id === currentSelectedId)) {
                    setSelectedKeyId(currentSelectedId);
                    setUseOwnKey(false);
                } else if (keys.length === 0) {
                    setUseOwnKey(true);
                } else {
                    // If user has a local key set but server keys are available, default to server
                    const hasLocalKey = !!(scopedKey || legacyKey);
                    setUseOwnKey(hasLocalKey && !currentSelectedId);
                }
                setLoadingKeys(false);
            });
        }
    }, [showSettings]);

    const saveSettings = async () => {
        // Handle API key source
        if (useOwnKey || availableServerKeys.length === 0) {
            // Using own key - clear server selection, save to localStorage
            clearSelectedServerKey(ApiProvider.GOOGLE);
            let cleanKey = apiKey;
            const scopedStorageKey = getUserScopedGeminiKeyStorageKey();
            if (cleanKey) {
                cleanKey = cleanKey.replace(/[^\x20-\x7E]/g, '').trim();
                localStorage.setItem(scopedStorageKey, cleanKey);
                if (!user?.id) {
                    localStorage.setItem("gemini_api_key", cleanKey);
                }
                setApiKey(cleanKey);
            } else {
                localStorage.removeItem(scopedStorageKey);
                if (!user?.id) {
                    localStorage.removeItem("gemini_api_key");
                }
            }
        } else if (selectedKeyId) {
            // Using server key - select it (fetches and caches the actual key)
            const success = await selectServerKey(selectedKeyId, ApiProvider.GOOGLE);
            if (!success) {
                alert(t('sk_select_failed'));
                return;
            }
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
                            <div className="relative" data-apps-menu>
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

                            {/* Account Switcher */}
                            <div className="relative" data-account-switcher>
                                <button 
                                    onClick={() => setShowAccountSwitcher(!showAccountSwitcher)}
                                    className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border transition-all hover:scale-105 active:scale-95 ${showAccountSwitcher ? 'bg-slate-700 border-slate-600 text-white' : 'bg-slate-800/50 border-slate-700/50 text-slate-300 hover:bg-slate-700 hover:text-white'}`}
                                    title={user?.username}
                                >
                                    <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white ${user?.role === 'admin' ? 'bg-gradient-to-br from-purple-500 to-indigo-600' : 'bg-gradient-to-br from-blue-500 to-cyan-600'}`}>
                                        {user?.username?.charAt(0).toUpperCase()}
                                    </div>
                                    <span className="text-xs font-medium hidden lg:inline max-w-[80px] truncate">{user?.username}</span>
                                    {otherAccounts.length > 0 && (
                                        <i className={`fas fa-chevron-down text-[8px] transition-transform ${showAccountSwitcher ? 'rotate-180' : ''}`}></i>
                                    )}
                                </button>

                                {showAccountSwitcher && (
                                    <div className="absolute top-full right-0 mt-3 w-64 bg-slate-900/95 backdrop-blur-xl border border-slate-700/80 rounded-2xl shadow-2xl p-3 z-50 animate-fade-in origin-top-right">
                                        {/* Current Account */}
                                        <div className="px-3 py-2 mb-2">
                                            <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">{t('current_account')}</div>
                                            <div className="flex items-center gap-3">
                                                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold text-white shrink-0 ${user?.role === 'admin' ? 'bg-gradient-to-br from-purple-500 to-indigo-600' : 'bg-gradient-to-br from-blue-500 to-cyan-600'}`}>
                                                    {user?.username?.charAt(0).toUpperCase()}
                                                </div>
                                                <div className="min-w-0">
                                                    <div className="text-sm font-semibold text-white truncate">{user?.username}</div>
                                                    <div className="text-[10px] text-slate-400 capitalize">{user?.role}</div>
                                                </div>
                                                <div className="ml-auto shrink-0">
                                                    <span className="w-2 h-2 rounded-full bg-emerald-400 block"></span>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Other Accounts */}
                                        {otherAccounts.length > 0 && (
                                            <>
                                                <div className="border-t border-slate-700/50 my-2"></div>
                                                <div className="px-3 py-1">
                                                    <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">{t('switch_to')}</div>
                                                </div>
                                                {otherAccounts.map(account => (
                                                    <button
                                                        key={account.id}
                                                        onClick={() => handleSwitchAccount(account)}
                                                        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-slate-800 transition-all group"
                                                    >
                                                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold text-white shrink-0 ${account.role === 'admin' ? 'bg-gradient-to-br from-purple-500/70 to-indigo-600/70' : 'bg-gradient-to-br from-blue-500/70 to-cyan-600/70'}`}>
                                                            {account.username.charAt(0).toUpperCase()}
                                                        </div>
                                                        <div className="min-w-0 text-left flex-1">
                                                            <div className="text-sm font-medium text-slate-300 group-hover:text-white truncate">{account.username}</div>
                                                            <div className="text-[10px] text-slate-500 capitalize">{account.role}</div>
                                                        </div>
                                                        <button
                                                            onClick={(e) => handleRemoveSavedAccount(account.id, e)}
                                                            className="shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-slate-600 hover:text-red-400 hover:bg-red-500/10 opacity-0 group-hover:opacity-100 transition-all"
                                                            title={t('remove_saved_account')}
                                                        >
                                                            <i className="fas fa-times text-[10px]"></i>
                                                        </button>
                                                    </button>
                                                ))}
                                            </>
                                        )}

                                        {/* Add Account / Logout */}
                                        <div className="border-t border-slate-700/50 mt-2 pt-2 space-y-1">
                                            <button
                                                onClick={() => { logoutForAccountSwitch(); }}
                                                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-all"
                                            >
                                                <div className="w-8 h-8 rounded-full bg-slate-800 border border-dashed border-slate-600 flex items-center justify-center">
                                                    <i className="fas fa-plus text-[10px] text-slate-500"></i>
                                                </div>
                                                <span className="text-sm">{t('add_account')}</span>
                                            </button>
                                            <button
                                                onClick={logout}
                                                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-red-400 hover:text-red-300 hover:bg-red-500/10 transition-all"
                                            >
                                                <div className="w-8 h-8 rounded-full bg-red-500/10 flex items-center justify-center">
                                                    <i className="fas fa-sign-out-alt text-xs"></i>
                                                </div>
                                                <span className="text-sm">{t('sign_out')}</span>
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
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
                            {/* API Key Section */}
                            <div>
                                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3 ml-1">
                                    {t('api_key_label')}
                                </label>
                                
                                {loadingKeys ? (
                                    <div className="text-center py-4 text-slate-500 text-sm">
                                        <i className="fas fa-spinner fa-spin mr-2"></i>{t('loading')}...
                                    </div>
                                ) : availableServerKeys.length > 0 ? (
                                    /* Server keys available - show selector */
                                    <div className="space-y-2">
                                        {availableServerKeys.map(sk => (
                                            <label key={sk.id} className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                                                !useOwnKey && selectedKeyId === sk.id 
                                                    ? 'bg-theme-primary/10 border-theme-primary/50' 
                                                    : 'bg-slate-800/50 border-slate-700 hover:border-slate-600'
                                            }`}>
                                                <input
                                                    type="radio"
                                                    name="api-key-source"
                                                    checked={!useOwnKey && selectedKeyId === sk.id}
                                                    onChange={() => { setSelectedKeyId(sk.id); setUseOwnKey(false); }}
                                                    className="sr-only peer"
                                                />
                                                <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center transition-colors ${
                                                    !useOwnKey && selectedKeyId === sk.id 
                                                        ? 'border-theme-primary' 
                                                        : 'border-slate-500'
                                                }`}>
                                                    {!useOwnKey && selectedKeyId === sk.id && (
                                                        <div className="w-2 h-2 rounded-full bg-theme-primary"></div>
                                                    )}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <div className="text-sm font-medium text-white flex items-center gap-2">
                                                        <i className="fas fa-server text-xs text-slate-500"></i>
                                                        {sk.label}
                                                    </div>
                                                    <div className="text-[10px] text-slate-500 font-mono">{sk.maskedKey}</div>
                                                </div>
                                                <span className={`text-[10px] px-2 py-0.5 rounded ${sk.provider === 'google' ? 'bg-blue-900/50 text-blue-300' : 'bg-purple-900/50 text-purple-300'}`}>
                                                    {sk.provider === 'google' ? 'Gemini' : 'NeuroAPI'}
                                                </span>
                                            </label>
                                        ))}
                                        
                                        {/* Own key option */}
                                        <label className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                                            useOwnKey 
                                                ? 'bg-theme-primary/10 border-theme-primary/50' 
                                                : 'bg-slate-800/50 border-slate-700 hover:border-slate-600'
                                        }`}>
                                            <input
                                                type="radio"
                                                name="api-key-source"
                                                checked={useOwnKey}
                                                onChange={() => setUseOwnKey(true)}
                                                className="sr-only peer"
                                            />
                                            <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center transition-colors ${
                                                useOwnKey ? 'border-theme-primary' : 'border-slate-500'
                                            }`}>
                                                {useOwnKey && <div className="w-2 h-2 rounded-full bg-theme-primary"></div>}
                                            </div>
                                            <div className="flex-1">
                                                <div className="text-sm font-medium text-white flex items-center gap-2">
                                                    <i className="fas fa-key text-xs text-slate-500"></i>
                                                    {t('sk_use_own_key')}
                                                </div>
                                            </div>
                                        </label>
                                        
                                        {useOwnKey && (
                                            <input 
                                                id="api-key-input"
                                                name="api-key"
                                                type="password" 
                                                className="w-full bg-slate-800/50 border border-slate-700 text-slate-100 rounded-xl px-4 py-3.5 focus:ring-2 focus:ring-theme-primary/50 focus:border-theme-primary outline-none transition-all placeholder-slate-600 mt-2"
                                                placeholder={t('sk_enter_own_key')}
                                                value={apiKey}
                                                onChange={(e) => setApiKey(e.target.value)}
                                            />
                                        )}
                                    </div>
                                ) : (
                                    /* No server keys - show plain text input */
                                    <input 
                                        id="api-key-input"
                                        name="api-key"
                                        type="password" 
                                        className="w-full bg-slate-800/50 border border-slate-700 text-slate-100 rounded-xl px-4 py-3.5 focus:ring-2 focus:ring-theme-primary/50 focus:border-theme-primary outline-none transition-all placeholder-slate-600"
                                        placeholder="Paste your Gemini API Key here..."
                                        value={apiKey}
                                        onChange={(e) => setApiKey(e.target.value)}
                                    />
                                )}
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
