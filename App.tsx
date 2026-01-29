
import React, { useState, useEffect } from 'react';
import Layout from './components/Layout';
import SingleGenerator from './views/SingleGenerator';
import BatchProcessor from './views/BatchProcessor';
import CloudBatchProcessor from './views/CloudBatchProcessor';
import AdminPanel from './views/AdminPanel';
import GalleryView from './views/GalleryView';
import LoginView from './views/LoginView';
import { TabId } from './types';
import { LanguageProvider } from './contexts/LanguageContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { getCurrentUser } from './services/authService';

const App: React.FC = () => {
    const [activeTab, setActiveTab] = useState<TabId>('single');
    const [user, setUser] = useState(getCurrentUser());

    if (!user) {
        return <LoginView />;
    }

    return (
        <LanguageProvider>
            <ThemeProvider>
                <Layout activeTab={activeTab} onTabChange={setActiveTab}>
                    
                    {/* 
                       Используем CSS (display: none / block) для генераторов.
                       Это предотвращает размонтирование компонентов и потерю данных (картинок/настроек)
                       при переключении вкладок.
                    */}
                    
                    <div className={activeTab === 'single' ? 'block animate-fade-in' : 'hidden'}>
                        <SingleGenerator />
                    </div>

                    <div className={activeTab === 'batch' ? 'block animate-fade-in' : 'hidden'}>
                        <BatchProcessor />
                    </div>

                    <div className={activeTab === 'cloud-batch' ? 'block animate-fade-in' : 'hidden'}>
                        <CloudBatchProcessor />
                    </div>

                    {/* 
                       Галерею и Админку рендерим условно, чтобы при каждом входе 
                       данные обновлялись (запрашивалась свежая история с сервера).
                    */}
                    {activeTab === 'admin' && user.role === 'admin' && <AdminPanel />}
                    {activeTab === 'gallery' && <GalleryView />}

                </Layout>
            </ThemeProvider>
        </LanguageProvider>
    );
};

export default App;
