
import React, { useState, useEffect } from 'react';
import Button from '../components/ui/Button';
import { getUsers, saveUser, deleteUser, sha256 } from '../services/authService';
import { User } from '../types';
import { MODELS } from '../constants';
import { usePresets, Preset } from '../hooks/usePresets';
import { getSystemSettings, saveSystemSettings, syncSystemSettings, SystemSettings } from '../services/settingsService';
import { useLanguage } from '../contexts/LanguageContext';

const AdminPanel: React.FC = () => {
    const [users, setUsers] = useState<User[]>([]);
    const { presets, savePreset, deletePreset } = usePresets();
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

    useEffect(() => {
        loadData();
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
    const handleSavePreset = () => {
        if(!presetName || !presetContent) return alert("Name and Content required");
        savePreset(presetName, presetContent);
        resetPresetForm();
    };

    const handleEditPreset = (p: Preset) => {
        setPresetName(p.name);
        setPresetContent(p.content);
        setEditingPreset(true);
    };

    const handleDeletePreset = (name: string) => {
        if(confirm(`Delete preset "${name}"?`)) {
            deletePreset(name);
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

    return (
        <div className="space-y-8 pb-10">
             {/* System Settings Section */}
             <div className="bg-slate-800/50 backdrop-blur-sm p-6 rounded-2xl border border-slate-700">
                <h2 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
                    <i className="fas fa-toggle-on text-emerald-500"></i>
                    {t('system_ui_config')}
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                                        <input 
                                            type="checkbox" 
                                            checked={allowedModels.length === 0 || allowedModels.includes('all')}
                                            onChange={() => setAllowedModels([])}
                                        />
                                        <span className="text-sm text-slate-300">{t('all_models')}</span>
                                    </label>
                                    {MODELS.map(m => (
                                        <label key={m.value} className="flex items-center gap-2 cursor-pointer">
                                            <input 
                                                type="checkbox" 
                                                checked={allowedModels.includes(m.value)}
                                                onChange={() => toggleModel(m.value)}
                                                disabled={allowedModels.includes('all')} 
                                            />
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

            {/* --- 4. Global API Key --- */}
            <div className="bg-slate-800/50 backdrop-blur-sm p-6 rounded-2xl border border-slate-700">
                <h2 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
                    <i className="fas fa-key text-pink-500"></i>
                    {t('global_gallery_access')}
                </h2>
                
                <div className="bg-slate-900/50 p-4 rounded-xl border border-slate-700">
                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">{t('api_key_short')}</label>
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