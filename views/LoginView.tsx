
import React, { useState } from 'react';
import Button from '../components/ui/Button';
import { login } from '../services/authService';
import { syncSystemSettings } from '../services/settingsService';
import { initializeUsers } from '../services/authService';

const LoginView: React.FC = () => {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        const user = await login(username, password);
        if (user) {
            // Load system settings and user preferences from server
            await syncSystemSettings();
            window.location.reload();
        } else {
            setError("Invalid credentials");
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center relative overflow-hidden">
            {/* Background Effects */}
            <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-slate-900 via-slate-950 to-black z-0"></div>
            <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-blue-600/20 rounded-full blur-[100px] animate-pulse-slow"></div>
            <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-purple-600/20 rounded-full blur-[100px] animate-pulse-slow" style={{animationDelay: '1s'}}></div>

            <div className="bg-slate-900/60 backdrop-blur-xl border border-slate-700/50 p-10 rounded-3xl w-full max-w-md shadow-2xl relative z-10 animate-fade-in">
                <div className="text-center mb-10">
                    <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-2xl mb-6 shadow-lg shadow-blue-500/30">
                         <i className="fas fa-robot text-white text-3xl"></i>
                    </div>
                    <h1 className="text-4xl font-bold text-white tracking-tight">Wite AI</h1>
                    <p className="text-slate-400 mt-3 font-medium">GenAI Studio Access</p>
                </div>

                {error && (
                    <div className="bg-red-500/10 text-red-300 p-4 rounded-xl mb-6 text-sm text-center border border-red-500/20 flex items-center justify-center gap-2">
                        <i className="fas fa-exclamation-circle"></i>
                        {error}
                    </div>
                )}

                <form onSubmit={handleLogin} className="space-y-6">
                    <div>
                        <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 ml-1">Username</label>
                        <input 
                            type="text" 
                            className="w-full bg-slate-800/50 border border-slate-700/50 text-white rounded-xl px-5 py-4 focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 outline-none transition-all placeholder-slate-600"
                            value={username}
                            onChange={e => setUsername(e.target.value)}
                            placeholder="Enter username"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 ml-1">Password</label>
                        <input 
                            type="password" 
                            className="w-full bg-slate-800/50 border border-slate-700/50 text-white rounded-xl px-5 py-4 focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 outline-none transition-all placeholder-slate-600"
                            value={password}
                            onChange={e => setPassword(e.target.value)}
                            placeholder="Enter password"
                        />
                    </div>
                    <Button type="submit" className="w-full py-4 text-lg shadow-xl shadow-blue-900/20 mt-4">
                        Sign In <i className="fas fa-arrow-right ml-2 text-sm"></i>
                    </Button>
                </form>
                
                <div className="mt-8 text-center">
                    <p className="text-xs text-slate-500">
                        Restricted Access System
                    </p>
                </div>
            </div>
        </div>
    );
};

export default LoginView;
