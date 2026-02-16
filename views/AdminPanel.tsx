
import React, { useState, useEffect } from 'react';
import Button from '../components/ui/Button';
import { getUsers, saveUser, deleteUser, sha256, getCurrentUser } from '../services/authService';
import { User, ApiProvider } from '../types';
import { MODELS } from '../constants';
import { usePresets, Preset } from '../hooks/usePresets';
import { getSystemSettings, saveSystemSettings, syncSystemSettings, SystemSettings } from '../services/settingsService';
import { useLanguage } from '../contexts/LanguageContext';

const AdminPanel: React.FC = () => {
    const [users, setUsers] = useState<User[]>([]);
    const currentUser = getCurrentUser();
    const { presets, savePreset, deletePreset, refreshPresets } = usePresets(currentUser?.id);
    const { t } = useLanguage();
    
    // User Form State
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [role, setRole] = useState<'user' | 'admin'>('user');
    const [allowedModels, setAllowedModels] = useState<string[]>([]);

    // Preset Form State
    const [presetName, setPresetName] = useState('');
    const [presetContent, setPresetContent] = useState('');
    const [editingPreset, setEditingPreset] = useState<boolean>(false);

    // System Settings State
    const [systemSettings, setSystemSettings] = useState<SystemSettings>(getSystemSettings());
    const [globalApiKey, setGlobalApiKey] = useState<string | null>(null);
    const [stats, setStats] = useState<any>(null);
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 7;
    
    // API Keys State
    const [geminiApiKey, setGeminiApiKey] = useState<string>('');
    const [neuroApiKey, setNeuroApiKey] = useState<string>('');
    const [showGeminiKey, setShowGeminiKey] = useState<boolean>(false);
    const [showNeuroKey, setShowNeuroKey] = useState<boolean>(false);

    useEffect(() => {
        loadData();
        // Load API keys from localStorage
        const geminiKey = localStorage.getItem('gemini_api_key') || '';
        const neuroKey = localStorage.getItem('neuroapi_api_key') || '';
        setGeminiApiKey(geminiKey);
        setNeuroApiKey(neuroKey);
    }, []);

    const loadData = async () => {
        const [loadedUsers, _] = await Promise.all([getUsers(), syncSystemSettings()]);
        setUsers(loadedUsers);
        setSystemSettings(getSystemSettings());
        fetchGlobalApiKey();
        fetchStats();
    };

    const fetchStats = async () => {
        try {
            const res = await fetch('/api/admin/stats');
            if (res.ok) {
                setStats(await res.json());
            }
        } catch (e) {
            console.error("Failed to fetch stats", e);
        }
    };

    const fetchGlobalApiKey = async () => {
        try {
            const res = await fetch('/api/key');
            const data = await res.json();
            if (data.apiKey) {
                setGlobalApiKey(data.apiKey);
            }
        } catch (e) {
            console.error("Failed to fetch API key", e);
        }
    };

    // --- User Logic ---
    const handleSaveUser = async () => {
        if (!username || !password) return alert("Username and password required");
        
        // Check if user already exists
        const existingUser = users.find(u => u.id === username.toLowerCase().replace(/\s/g, ''));
        
        // Only hash if it's a new password (not already a hash)
        // SHA256 hashes are always 64 characters long
        let passHash = password;
        if (password.length !== 64 || !/^[a-f0-9]+$/.test(password)) {
            passHash = await sha256(password);
        }
        
        const newUser: User = {
            id: username.toLowerCase().replace(/\s/g, ''),
            username,
            password: passHash,
            role,
            allowedModels: allowedModels.length === 0 ? ['all'] : allowedModels
        };
        await saveUser(newUser);
        const updatedUsers = await getUsers();
        setUsers(updatedUsers);
        resetUserForm();
    };

    const handleDeleteUser = async (id: string) => {
        if (confirm("Delete user?")) {
            try {
                await deleteUser(id);
                const updatedUsers = await getUsers();
                setUsers(updatedUsers);

                if ((systemSettings.externalGalleryHiddenUsers || []).includes(id)) {
                    const newSettings = {
                        ...systemSettings,
                        externalGalleryHiddenUsers: (systemSettings.externalGalleryHiddenUsers || []).filter(uid => uid !== id)
                    };
                    setSystemSettings(newSettings);
                    saveSystemSettings(newSettings);
                }
            } catch (e: any) {
                alert(e.message);
            }
        }
    };

    const resetUserForm = () => {
        setUsername('');
        setPassword('');
        setRole('user');
        setAllowedModels([]);
    };

    const toggleModel = (value: string) => {
        setAllowedModels(prev => {
            if (prev.includes(value)) return prev.filter(m => m !== value);
            return [...prev, value];
        });
    };

    // --- Preset Logic ---
    const handleSavePreset = async () => {
        if(!presetName || !presetContent) return alert("Name and Content required");
        try {
            await savePreset(presetName, presetContent);
            resetPresetForm();
        } catch (error: any) {
            alert(error.message || 'Failed to save preset');
        }
    };

    const handleEditPreset = (p: Preset) => {
        setPresetName(p.name);
        setPresetContent(p.content);
        setEditingPreset(true);
    };

    const handleDeletePreset = async (name: string) => {
        if(confirm(`Delete preset "${name}"?`)) {
            try {
                await deletePreset(name);
            } catch (error: any) {
                alert(error.message || 'Failed to delete preset');
            }
        }
    };

    const resetPresetForm = () => {
        setPresetName('');
        setPresetContent('');
        setEditingPreset(false);
    };

    // --- System Settings Logic ---
    const handleToggleSetting = (key: keyof SystemSettings) => {
        const newSettings = { ...systemSettings, [key]: !systemSettings[key] };
        setSystemSettings(newSettings);
        saveSystemSettings(newSettings);
    };

    const handleSystemLanguageChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const newLang = e.target.value as 'en' | 'ru';
        const newSettings = { ...systemSettings, language: newLang };
        setSystemSettings(newSettings);
        saveSystemSettings(newSettings);
    };

    const handleApiProviderChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const newProvider = e.target.value as ApiProvider;
        const newSettings = { ...systemSettings, apiProvider: newProvider };
        setSystemSettings(newSettings);
        saveSystemSettings(newSettings);
    };

    const handleToggleExternalGalleryUser = (userId: string) => {
        const hiddenUsers = systemSettings.externalGalleryHiddenUsers || [];
        const nextHiddenUsers = hiddenUsers.includes(userId)
            ? hiddenUsers.filter(id => id !== userId)
            : [...hiddenUsers, userId];

        const newSettings = { ...systemSettings, externalGalleryHiddenUsers: nextHiddenUsers };
        setSystemSettings(newSettings);
        saveSystemSettings(newSettings);
    };

    const handleSaveGeminiKey = () => {
        localStorage.setItem('gemini_api_key', geminiApiKey);
        alert('Google Gemini API key saved to localStorage');
    };

    const handleSaveNeuroKey = () => {
        localStorage.setItem('neuroapi_api_key', neuroApiKey);
        alert('NeuroAPI key saved to localStorage');
    };

    return (
        <div className="space-y-8 pb-10">
             {/* System Settings Section */}
             <div className="bg-slate-800/50 backdrop-blur-sm p-6 rounded-2xl border border-slate-700">
                <h2 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
                    <i className="fas fa-toggle-on text-emerald-500"></i>
                    {t('system_ui_config')}
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                     {/* API Provider Setting */}
                     <div className="bg-slate-900/50 p-4 rounded-xl border border-slate-700 flex justify-between items-center col-span-full">
                        <div>
                            <div className="text-white font-bold">🔌 API Provider</div>
                            <div className="text-xs text-slate-400">
                                Choose between Google Gemini or NeuroAPI. <br/>
                                <span className="text-amber-400">⚠️ Set the corresponding API key in your local storage: 
                                    <code className="ml-1 text-emerald-400">gemini_api_key</code> or 
                                    <code className="ml-1 text-emerald-400">neuroapi_api_key</code>
                                </span>
                            </div>
                        </div>
                        <select 
                            className="bg-slate-800 border-none rounded px-3 py-1 text-white text-sm outline-none cursor-pointer min-w-[160px]"
                            value={systemSettings.apiProvider || ApiProvider.GOOGLE}
                            onChange={handleApiProviderChange}
                        >
                            <option value={ApiProvider.GOOGLE}>Google Gemini</option>
                            <option value={ApiProvider.NEUROAPI}>NeuroAPI</option>
                        </select>
                     </div>

                     {/* Default Language Setting */}
                     <div className="bg-slate-900/50 p-4 rounded-xl border border-slate-700 flex justify-between items-center">
                        <div>
                            <div className="text-white font-bold">{t('default_system_language')}</div>
                            <div className="text-xs text-slate-400">{t('default_system_language_desc')}</div>
                        </div>
                        <select 
                            className="bg-slate-800 border-none rounded px-3 py-1 text-white text-sm outline-none cursor-pointer"
                            value={systemSettings.language || 'en'}
                            onChange={handleSystemLanguageChange}
                        >
                            <option value="en">English</option>
                            <option value="ru">Русский</option>
                        </select>
                     </div>

                     <div className="bg-slate-900/50 p-4 rounded-xl border border-slate-700 flex justify-between items-center">
                        <div>
                            <div className="text-white font-bold">{t('show_creativity')}</div>
                            <div className="text-xs text-slate-400">{t('show_creativity_desc')}</div>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                            <input 
                                type="checkbox" 
                                className="sr-only peer"
                                checked={systemSettings.showCreativity}
                                onChange={() => handleToggleSetting('showCreativity')}
                            />
                            <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
                        </label>
                     </div>
                     <div className="bg-slate-900/50 p-4 rounded-xl border border-slate-700 flex justify-between items-center">
                        <div>
                            <div className="text-white font-bold">{t('show_repeats')}</div>
                            <div className="text-xs text-slate-400">{t('show_repeats_desc')}</div>
                        </div>
                         <label className="relative inline-flex items-center cursor-pointer">
                            <input 
                                type="checkbox" 
                                className="sr-only peer"
                                checked={systemSettings.showRepeats}
                                onChange={() => handleToggleSetting('showRepeats')}
                            />
                            <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
                        </label>
                     </div>

                     <div className="bg-slate-900/50 p-4 rounded-xl border border-slate-700 col-span-full">
                        <div className="text-white font-bold">{t('external_gallery_user_visibility')}</div>
                        <div className="text-xs text-slate-400 mb-3">{t('external_gallery_user_visibility_desc')}</div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-48 overflow-y-auto custom-scrollbar pr-1">
                            {users.map((u) => {
                                const isHidden = (systemSettings.externalGalleryHiddenUsers || []).includes(u.id);

                                return (
                                    <label key={u.id} className="flex items-center justify-between gap-3 bg-slate-800/70 border border-slate-700 rounded-lg p-3 cursor-pointer">
                                        <div className="min-w-0">
                                            <div className="text-sm text-white truncate">{u.username}</div>
                                            <div className="text-xs text-slate-400 truncate">{u.id}</div>
                                        </div>
                                        <div className="flex items-center gap-2 shrink-0">
                                            <span className={`text-xs ${isHidden ? 'text-amber-300' : 'text-emerald-300'}`}>
                                                {isHidden ? t('hidden_in_external_gallery') : t('visible_in_external_gallery')}
                                            </span>
                                            <span className="relative inline-flex items-center">
                                                <input
                                                    type="checkbox"
                                                    checked={isHidden}
                                                    onChange={() => handleToggleExternalGalleryUser(u.id)}
                                                    className="sr-only peer"
                                                    aria-label={`${u.username} external gallery visibility`}
                                                />
                                                <span className="w-9 h-5 bg-slate-700 rounded-full border border-slate-600 peer-checked:bg-amber-500/70 peer-checked:border-amber-400/60 transition-colors"></span>
                                                <span className="absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white border border-slate-300 transition-transform peer-checked:translate-x-4"></span>
                                            </span>
                                        </div>
                                    </label>
                                );
                            })}
                        </div>
                     </div>
                </div>
             </div>

            {/* User Management Section */}
            <div className="bg-slate-800/50 backdrop-blur-sm p-6 rounded-2xl border border-slate-700">
                <h2 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
                    <i className="fas fa-users-cog text-blue-500"></i>
                    {t('user_management')}
                </h2>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    {/* User List */}
                    <div className="space-y-4">
                        <h3 className="text-lg font-medium text-slate-300">{t('existing_users')}</h3>
                        <div className="space-y-2 max-h-[300px] overflow-y-auto custom-scrollbar p-1">
                            {users.map(u => (
                                <div key={u.id} className="bg-slate-800 p-4 rounded-xl border border-slate-700 flex justify-between items-center">
                                    <div>
                                        <div className="font-bold text-white">{u.username}</div>
                                        <div className="text-xs text-slate-400">
                                            {u.role} • Access: {u.allowedModels.includes('all') ? t('all_models') : `${u.allowedModels.length} models`}
                                        </div>
                                    </div>
                                    {u.id !== 'admin' && (
                                        <button 
                                            onClick={() => handleDeleteUser(u.id)}
                                            className="text-red-400 hover:text-red-300 p-2 bg-slate-700/50 rounded-lg transition-colors"
                                        >
                                            <i className="fas fa-trash"></i>
                                        </button>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Add/Edit User Form */}
                    <div className="bg-slate-900/50 p-6 rounded-xl border border-slate-700">
                        <h3 className="text-lg font-medium text-slate-300 mb-4">{t('add_edit_user')}</h3>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm text-slate-400 mb-1">{t('username')}</label>
                                <input 
                                    className="w-full bg-slate-800 border border-slate-600 rounded px-3 py-2 text-white outline-none focus:border-blue-500"
                                    value={username} 
                                    onChange={e => setUsername(e.target.value)}
                                />
                            </div>
                            <div>
                                <label className="block text-sm text-slate-400 mb-1">{t('password')}</label>
                                <input 
                                    type="text" 
                                    className="w-full bg-slate-800 border border-slate-600 rounded px-3 py-2 text-white outline-none focus:border-blue-500"
                                    value={password} 
                                    onChange={e => setPassword(e.target.value)}
                                />
                            </div>
                            <div>
                                <label className="block text-sm text-slate-400 mb-1">{t('role')}</label>
                                <select 
                                    className="w-full bg-slate-800 border border-slate-600 rounded px-3 py-2 text-white outline-none focus:border-blue-500"
                                    value={role}
                                    onChange={(e) => setRole(e.target.value as any)}
                                >
                                    <option value="user">User</option>
                                    <option value="admin">Admin</option>
                                </select>
                            </div>
                            
                            <div>
                                <label className="block text-sm text-slate-400 mb-2">{t('allowed_models')}</label>
                                <div className="space-y-2 max-h-32 overflow-y-auto p-2 border border-slate-700 rounded custom-scrollbar">
                                    <label className="flex items-center gap-2 cursor-pointer">
                                        <span className="relative inline-flex items-center">
                                            <input 
                                                type="checkbox" 
                                                checked={allowedModels.length === 0 || allowedModels.includes('all')}
                                                onChange={() => setAllowedModels([])}
                                                className="sr-only peer"
                                            />
                                            <span className="h-4 w-4 rounded border border-slate-500 bg-slate-800/90 peer-checked:bg-emerald-500/30 peer-checked:border-emerald-400 transition-colors"></span>
                                            <i className="fas fa-check absolute left-[2px] top-[2px] text-[10px] text-emerald-300 opacity-0 peer-checked:opacity-100 transition-opacity"></i>
                                        </span>
                                        <span className="text-sm text-slate-300">{t('all_models')}</span>
                                    </label>
                                    {MODELS.map(m => (
                                        <label key={m.value} className="flex items-center gap-2 cursor-pointer">
                                            <span className={`relative inline-flex items-center ${allowedModels.includes('all') ? 'opacity-50' : ''}`}>
                                                <input 
                                                    type="checkbox" 
                                                    checked={allowedModels.includes(m.value)}
                                                    onChange={() => toggleModel(m.value)}
                                                    disabled={allowedModels.includes('all')}
                                                    className="sr-only peer"
                                                />
                                                <span className="h-4 w-4 rounded border border-slate-500 bg-slate-800/90 peer-checked:bg-emerald-500/30 peer-checked:border-emerald-400 transition-colors"></span>
                                                <i className="fas fa-check absolute left-[2px] top-[2px] text-[10px] text-emerald-300 opacity-0 peer-checked:opacity-100 transition-opacity"></i>
                                            </span>
                                            <span className="text-sm text-slate-300">{m.label}</span>
                                        </label>
                                    ))}
                                </div>
                            </div>

                            <div className="flex justify-end gap-2 pt-2">
                                <Button variant="secondary" onClick={resetUserForm} className="py-2 text-sm">{t('remove_btn')}</Button>
                                <Button onClick={handleSaveUser} className="py-2 text-sm">{t('save')}</Button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Global Presets Management */}
            <div className="bg-slate-800/50 backdrop-blur-sm p-6 rounded-2xl border border-slate-700">
                <h2 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
                    <i className="fas fa-list-alt text-purple-500"></i>
                    {t('global_presets')}
                </h2>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                     {/* Preset List */}
                     <div className="space-y-4">
                        <h3 className="text-lg font-medium text-slate-300">{t('available_presets')}</h3>
                        <div className="space-y-2 max-h-[300px] overflow-y-auto custom-scrollbar p-1">
                            {presets.map(p => (
                                <div key={p.name} className="bg-slate-800 p-3 rounded-xl border border-slate-700 flex justify-between items-start gap-4">
                                    <div className="min-w-0">
                                        <div className="font-bold text-white text-sm">{p.name}</div>
                                        <div className="text-xs text-slate-400 truncate mt-1">{p.content}</div>
                                    </div>
                                    <div className="flex gap-2 shrink-0">
                                         <button 
                                            onClick={() => handleEditPreset(p)}
                                            className="text-blue-400 hover:text-blue-300 p-2 bg-slate-700/50 rounded-lg transition-colors"
                                        >
                                            <i className="fas fa-edit"></i>
                                        </button>
                                        <button 
                                            onClick={() => handleDeletePreset(p.name)}
                                            className="text-red-400 hover:text-red-300 p-2 bg-slate-700/50 rounded-lg transition-colors"
                                        >
                                            <i className="fas fa-trash"></i>
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Edit Preset Form */}
                    <div className="bg-slate-900/50 p-6 rounded-xl border border-slate-700">
                         <h3 className="text-lg font-medium text-slate-300 mb-4">{editingPreset ? t('update') : t('create')} {t('preset_label')}</h3>
                         <div className="space-y-4">
                            <div>
                                <label className="block text-sm text-slate-400 mb-1">{t('enter_preset_name')}</label>
                                <input 
                                    className="w-full bg-slate-800 border border-slate-600 rounded px-3 py-2 text-white outline-none focus:border-purple-500"
                                    value={presetName} 
                                    onChange={e => setPresetName(e.target.value)}
                                    placeholder="e.g. Cinematic Lighting"
                                    disabled={editingPreset} // Name acts as ID for now
                                />
                            </div>
                            <div>
                                <label className="block text-sm text-slate-400 mb-1">{t('preset_content')}</label>
                                <textarea 
                                    className="w-full bg-slate-800 border border-slate-600 rounded px-3 py-2 text-white outline-none focus:border-purple-500 h-32 resize-none"
                                    value={presetContent} 
                                    onChange={e => setPresetContent(e.target.value)}
                                    placeholder="Enter system instructions..."
                                />
                            </div>
                            <div className="flex justify-end gap-2 pt-2">
                                <Button variant="secondary" onClick={resetPresetForm} className="py-2 text-sm">{t('cancel')}</Button>
                                <Button onClick={handleSavePreset} className="py-2 text-sm bg-purple-600 hover:bg-purple-500">{editingPreset ? t('update') : t('create')}</Button>
                            </div>
                         </div>
                    </div>
                </div>
            </div>

            {/* --- 4. API Keys Management --- */}
            <div className="bg-slate-800/50 backdrop-blur-sm p-6 rounded-2xl border border-slate-700">
                <h2 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
                    <i className="fas fa-key text-pink-500"></i>
                    API Keys Management
                </h2>
                
                <div className="space-y-4">
                    {/* Google Gemini API Key */}
                    <div className="bg-slate-900/50 p-4 rounded-xl border border-slate-700">
                        <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                            🔑 Google Gemini API Key
                        </label>
                        <div className="flex items-center gap-2">
                            <input
                                type={showGeminiKey ? "text" : "password"}
                                className="flex-1 bg-slate-950 p-3 rounded-lg text-emerald-400 font-mono text-sm border border-slate-800 outline-none focus:border-purple-500"
                                value={geminiApiKey}
                                onChange={(e) => setGeminiApiKey(e.target.value)}
                                placeholder="Enter your Google Gemini API key..."
                            />
                            <button
                                onClick={() => setShowGeminiKey(!showGeminiKey)}
                                className="px-3 py-2 bg-slate-800 hover:bg-slate-700 rounded text-slate-300 text-sm"
                            >
                                <i className={`fas ${showGeminiKey ? 'fa-eye-slash' : 'fa-eye'}`}></i>
                            </button>
                            <Button
                                onClick={handleSaveGeminiKey}
                                className="px-4 py-2 text-sm bg-purple-600 hover:bg-purple-500"
                            >
                                Save
                            </Button>
                        </div>
                        <p className="text-xs text-slate-500 mt-2 leading-relaxed">
                            Used when API Provider is set to <strong className="text-slate-400">Google Gemini</strong>. 
                            Stored in browser's localStorage: <code className="text-emerald-400">gemini_api_key</code>
                        </p>
                    </div>

                    {/* NeuroAPI Key */}
                    <div className="bg-slate-900/50 p-4 rounded-xl border border-slate-700">
                        <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                            🧠 NeuroAPI Key
                        </label>
                        <div className="flex items-center gap-2">
                            <input
                                type={showNeuroKey ? "text" : "password"}
                                className="flex-1 bg-slate-950 p-3 rounded-lg text-emerald-400 font-mono text-sm border border-slate-800 outline-none focus:border-purple-500"
                                value={neuroApiKey}
                                onChange={(e) => setNeuroApiKey(e.target.value)}
                                placeholder="Enter your NeuroAPI key..."
                            />
                            <button
                                onClick={() => setShowNeuroKey(!showNeuroKey)}
                                className="px-3 py-2 bg-slate-800 hover:bg-slate-700 rounded text-slate-300 text-sm"
                            >
                                <i className={`fas ${showNeuroKey ? 'fa-eye-slash' : 'fa-eye'}`}></i>
                            </button>
                            <Button
                                onClick={handleSaveNeuroKey}
                                className="px-4 py-2 text-sm bg-purple-600 hover:bg-purple-500"
                            >
                                Save
                            </Button>
                        </div>
                        <p className="text-xs text-slate-500 mt-2 leading-relaxed">
                            Used when API Provider is set to <strong className="text-slate-400">NeuroAPI</strong>. 
                            Stored in browser's localStorage: <code className="text-emerald-400">neuroapi_api_key</code>
                        </p>
                    </div>

                    {/* Global Gallery Access Key (unchanged) */}
                    <div className="bg-slate-900/50 p-4 rounded-xl border border-slate-700">
                        <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                            🌐 {t('global_gallery_access')}
                        </label>
                        <div className="flex items-center gap-2">
                            <code className="flex-1 bg-slate-950 p-3 rounded-lg text-emerald-400 font-mono text-sm break-all select-all border border-slate-800">
                                {globalApiKey || "Loading..."}
                            </code>
                        </div>
                        <p className="text-xs text-slate-500 mt-3 leading-relaxed">
                            {t('api_key_desc')}<br/>
                            <span className="text-slate-400 font-mono">GET /api/external_gallery?key=YOUR_KEY</span>
                        </p>
                    </div>
                </div>
            </div>

             {/* Usage Statistics Classification */}
             {stats && (
                <div className="bg-slate-800/50 backdrop-blur-sm p-6 rounded-2xl border border-slate-700">
                    <h2 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
                        <i className="fas fa-chart-line text-amber-500"></i>
                        {t('usage_stats')}
                    </h2>
                    
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                        <div>
                             <h3 className="text-md font-bold text-slate-300 mb-3">{t('usage_by_user')}</h3>
                             <div className="bg-slate-900/50 rounded-xl border border-slate-700 overflow-hidden">
                                 <table className="w-full text-sm text-left text-slate-400">
                                     <thead className="text-xs text-slate-200 uppercase bg-slate-800">
                                         <tr>
                                             <th className="px-4 py-3">User</th>
                                             <th className="px-4 py-3">{t('count')}</th>
                                             <th className="px-4 py-3">{t('tokens')}</th>
                                             <th className="px-4 py-3">{t('cost')}</th>
                                         </tr>
                                     </thead>
                                     <tbody>
                                        {Object.entries(stats.users || {}).map(([uid, s]: [string, any]) => (
                                            <tr key={uid} className="border-b border-slate-800 hover:bg-slate-800/30">
                                                <td className="px-4 py-3 font-medium text-white">{uid}</td>
                                                <td className="px-4 py-3">{s.count}</td>
                                                <td className="px-4 py-3">{(s.totalTokens / 1000).toFixed(1)}k</td>
                                                <td className="px-4 py-3">${s.totalCost.toFixed(4)}</td>
                                            </tr>
                                        ))}
                                     </tbody>
                                 </table>
                             </div>
                        </div>
                        
                        <div>
                             <h3 className="text-md font-bold text-slate-300 mb-3">{t('daily_activity')}</h3>
                             <div className="space-y-2 mb-4">
                                 {Object.entries(stats.timeline || {})
                                     .sort((a,b) => b[0].localeCompare(a[0]))
                                     .slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage)
                                     .map(([date, s]: [string, any]) => (
                                     <div key={date} className="bg-slate-900/50 p-3 rounded-lg border border-slate-700 flex justify-between items-center">
                                         <div className="font-mono text-emerald-400">{date}</div>
                                         <div className="flex gap-4 text-xs">
                                             <span className="text-slate-400">{s.count} {t('gens')}</span>
                                             <span className="text-blue-400">{(s.tokens/1000).toFixed(1)}k {t('tok')}</span>
                                             <span className="text-amber-400 font-bold">${s.cost.toFixed(4)}</span>
                                         </div>
                                     </div>
                                 ))}
                             </div>
                             
                             {/* Pagination Controls */}
                             {Object.keys(stats.timeline || {}).length > itemsPerPage && (
                                <div className="flex justify-between items-center bg-slate-900/50 p-2 rounded-lg border border-slate-700">
                                    <Button 
                                        variant="secondary" 
                                        className="text-xs py-1 h-auto"
                                        disabled={currentPage === 1}
                                        onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                    >
                                        <i className="fas fa-chevron-left mr-1"></i> Prev
                                    </Button>
                                    <span className="text-xs text-slate-400 font-mono">
                                        Page {currentPage} / {Math.ceil(Object.keys(stats.timeline || {}).length / itemsPerPage)}
                                    </span>
                                    <Button 
                                        variant="secondary" 
                                        className="text-xs py-1 h-auto"
                                        disabled={currentPage >= Math.ceil(Object.keys(stats.timeline || {}).length / itemsPerPage)}
                                        onClick={() => setCurrentPage(p => p + 1)}
                                    >
                                        Next <i className="fas fa-chevron-right ml-1"></i>
                                    </Button>
                                </div>
                             )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default AdminPanel;