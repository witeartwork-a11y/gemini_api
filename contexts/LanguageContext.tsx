
import React, { createContext, useContext, useState, useEffect } from 'react';

type Language = 'en' | 'ru';

const translations = {
    en: {
        nav_single: "Single",
        nav_batch: "Local Batch",
        nav_cloud: "Cloud Batch",
        nav_chat: "AI Chat",
        nav_gallery: "Gallery",
        nav_admin: "Admin",
        settings_title: "Settings",
        api_key_label: "Gemini API Key",
        save: "Save",
        cancel: "Cancel",
        gen_settings_title: "Settings",
        model_label: "Model",
        preset_label: "Preset",
        load_preset_placeholder: "Load preset...",
        system_instr_label: "System Instruction",
        user_prompt_label: "Prompt",
        resolution_label: "Resolution",
        ar_label: "Aspect Ratio",
        temp_label: "Creativity",
        precise: "Precise",
        creative: "Creative",
        generate_btn: "Generate",
        stop_btn: "Stop",
        input_image_title: "Input Image",
        remove_btn: "Clear",
        result_title: "Result",
        download_btn: "Download",
        batch_queue_title: "Queue",
        clear_completed: "Clear Done",
        start_batch: "Start",
        cloud_setup_title: "Cloud Setup",
        upload_create_btn: "Create Job",
        batch_jobs_title: "Job History",
        add_preset: "Save Preset",
        delete_preset: "Delete",
        enter_preset_name: "Preset Name:",
        items_count: "items",
        processing: "Processing...",
        processing_count: "Run",
        drag_drop: "Drag & drop images",
        drag_drop_files: "Drag & drop files",
        or_click_browse: "or click to browse",
        or_click_browse_multi: "or click to browse multiple",
        drop_it: "Drop it!",
        system_instruction_placeholder: "Define how the model should behave...",
        prompt_placeholder: "Describe what you want to generate...",
        ready_to_create: "Ready to Create",
        ready_to_create_desc: "Configure your settings and press Generate",
        or_browse: "browse",
        drop_here: "Drop here",
        files_queued: "files",
        no_jobs: "No jobs",
        check_status: "Check",
        results: "Results",
        clear_history: "Clear History",
        repeat_count: "Repeats",
        history_title: "Recent",
        history_empty: "Empty",
        max_images_reached: "Max 14 images.",
        language_label: "Language",
        chat_new: "New Chat",
        chat_placeholder: "Type message...",
        chat_no_messages: "Start conversation",
        chat_model_hint: "Image Mode: I will generate an image.",
        chat_clear: "Delete",
        use_as_input: "Use as Input",
        debug_info: "Debug Info",
        info_label: "Info",
        download_zip: "Download ZIP",
        view_fullscreen: "View",
        cancel_job: "Cancel Job",
        confirm_cancel: "Are you sure you want to cancel this job?",
        page: "Page",
        of: "of",
        // Safety Settings
        safety_settings_title: "Safety Settings",
        safety_desc: "Adjust censorship thresholds",
        
        // Media Resolution
        media_res_title: "Media Resolution",
        media_res_desc: "Global setting for Vision tokens (Gemini 3)",

        // Admin & UI
        system_ui_config: "System UI Configuration",
        show_creativity: "Show Creativity",
        show_creativity_desc: "Allow users to change temperature",
        show_repeats: "Show Repeats",
        show_repeats_desc: "Allow users to generate multiple times",
        user_management: "User Management",
        existing_users: "Existing Users",
        add_edit_user: "Add / Edit User",
        username: "Username",
        password: "Password",
        role: "Role",
        allowed_models: "Allowed Models",
        all_models: "All Models",
        global_presets: "Global Presets Management",
        available_presets: "Available Presets",
        preset_content: "System Prompt Content",
        create: "Create",
        update: "Update",
        open_admin_panel: "Open Admin Panel",
        
        // Admin New
        global_gallery_access: "Global Gallery Access",
        api_key_short: "API Key",
        api_key_desc: "Use this key to access the global gallery API from external applications:",
        usage_stats: "Usage Statistics (Token & Cost)",
        usage_by_user: "Usage by User",
        count: "Count",
        tokens: "Tokens",
        cost: "Est. Cost",
        daily_activity: "Daily Activity",
        gens: "gens",
        tok: "tok",
        
        drag_compare: "Drag slider to compare",
        original: "Original",
        result: "Result",
        date_label: "Date",
        input_images_count_label: "Input Images",
        // Theme
        appearance: "Appearance",
        theme_purple: "Purple (Default)",
        theme_raspberry: "Raspberry",
        theme_green: "Green",
        new_year_mode: "New Year Mood",
        new_year_desc: "Enable snow and festive effects",
        
        // Batch
        download_all_btn: "Download All",
        processed_result_msg: "Processed results will appear here",
        ar_auto: "Auto",
        ar_square: "1:1 (Square)",
        ar_portrait_mobile: "9:16 (Portrait Mobile)",
        ar_landscape: "16:9 (Landscape)",
        ar_portrait_standard: "3:4 (Portrait Standard)",
        ar_landscape_standard: "4:3 (Landscape Standard)",
        ar_classic_photo: "3:2 (Classic Photo)",
        ar_portrait_photo: "2:3 (Portrait Photo)",
        ar_print: "5:4 (Print)",
        ar_instagram: "4:5 (Instagram)",
        ar_cinematic: "21:9 (Cinematic)",
        
        // Translating new keys
        mode_images: "Images",
        mode_text_csv: "Text / CSV",
        job_name_optional: "Job Name (Optional)",
        job_name_placeholder: "e.g. Project A",
        input_files: "Input Files",
        analyze_files_placeholder: "Analyze the attached files...",
        image_gen_placeholder: "Describe image generation...",
    },
    ru: {
        nav_single: "Одиночная",
        nav_batch: "Пакет (Локал)",
        nav_cloud: "Пакет (Облако)",
        nav_chat: "AI Чат",
        nav_gallery: "Галерея",
        nav_admin: "Админка",
        settings_title: "Настройки",
        api_key_label: "API Ключ Gemini",
        save: "Сохранить",
        cancel: "Отмена",
        gen_settings_title: "Настройки",
        model_label: "Модель",
        preset_label: "Пресет",
        load_preset_placeholder: "Выбрать пресет...",
        system_instr_label: "Инструкция",
        user_prompt_label: "Промпт",
        resolution_label: "Разрешение",
        ar_label: "Пропорции",
        temp_label: "Креативность",
        precise: "Точно",
        creative: "Свободно",
        generate_btn: "Создать",
        stop_btn: "Стоп",
        input_image_title: "Входные фото",
        remove_btn: "Очистить",
        result_title: "Результат",
        download_btn: "Скачать",
        batch_queue_title: "Очередь",
        clear_completed: "Убрать готовые",
        start_batch: "Запуск",
        cloud_setup_title: "Настройка Облака",
        upload_create_btn: "Создать задачу",
        batch_jobs_title: "История задач",
        add_preset: "Сохр. пресет",
        delete_preset: "Удалить",
        enter_preset_name: "Имя пресета:",
        items_count: "шт.",
        processing: "Думаю...",
        processing_count: "Проход",
        drag_drop: "Перетащите фото",
        drag_drop_files: "Перетащите файлы",
        or_click_browse: "или кликните для выбора",
        or_click_browse_multi: "или кликните для выбора нескольких",
        drop_it: "Бросайте сюда!",
        system_instruction_placeholder: "Опишите, как модель должна себя вести...",
        prompt_placeholder: "Опишите, что вы хотите сгенерировать...",
        ready_to_create: "Готов творить",
        ready_to_create_desc: "Настройте параметры и нажмите Создать",
        or_browse: "обзор",
        drop_here: "Бросайте сюда",
        files_queued: "файлов",
        no_jobs: "Нет задач",
        check_status: "Статус",
        results: "Итоги",
        clear_history: "Очистить историю",
        repeat_count: "Повторы",
        history_title: "Недавние",
        history_empty: "Пусто",
        max_images_reached: "Макс 14 фото.",
        language_label: "Язык",
        chat_new: "Новый чат",
        chat_placeholder: "Введите сообщение...",
        chat_no_messages: "Начните диалог",
        chat_model_hint: "Режим фото: Я нарисую то, что вы попросите.",
        chat_clear: "Удалить",
        use_as_input: "Взять как исходник",
        debug_info: "Отладка",
        info_label: "Информация",
        download_zip: "Скачать ZIP",
        view_fullscreen: "Смотреть",
        cancel_job: "Отменить",
        confirm_cancel: "Вы уверены, что хотите отменить эту задачу?",
        page: "Стр.",
        of: "из",
        // Safety Settings
        safety_settings_title: "Настройки цензуры",
        safety_desc: "Уровень фильтрации контента",
        
        // Media Resolution
        media_res_title: "Качество анализа (Vision)",
        media_res_desc: "Глобальная настройка токенов Vision",

        // Admin & UI
        system_ui_config: "Интерфейс системы",
        show_creativity: "Показывать креативность",
        show_creativity_desc: "Разрешить пользователям менять температуру",
        show_repeats: "Показывать повторы",
        show_repeats_desc: "Разрешить генерацию серией",
        user_management: "Управление пользователями",
        existing_users: "Пользователи",
        add_edit_user: "Добавить / Изменить",
        username: "Имя пользователя",
        password: "Пароль",
        role: "Роль",
        allowed_models: "Доступные модели",
        all_models: "Все модели",
        global_presets: "Управление пресетами",
        available_presets: "Доступные пресеты",
        preset_content: "Содержимое инструкции",
        create: "Создать",
        update: "Обновить",
        open_admin_panel: "Открыть панель администратора",

        // Admin New
        global_gallery_access: "Глобальный доступ к галерее",
        api_key_short: "API Ключ",
        api_key_desc: "Используйте этот ключ для доступа к API глобальной галереи из внешних приложений:",
        usage_stats: "Статистика использования (Токены и Стоимость)",
        usage_by_user: "Использование по пользователям",
        count: "Кол-во",
        tokens: "Токены",
        cost: "Стоимость",
        daily_activity: "Ежедневная активность",
        gens: "ген.",
        tok: "ток.",

        drag_compare: "Тяните слайдер для сравнения",
        original: "Оригинал",
        result: "Результат",
        date_label: "Дата",
        input_images_count_label: "Входные фото",
        // Theme
        appearance: "Внешний вид",
        theme_purple: "Фиолетовая",
        theme_raspberry: "Малиновая",
        theme_green: "Зеленая",
        new_year_mode: "Новогоднее настроение",
        new_year_desc: "Включить снег и праздничные эффекты",

        // Batch
        download_all_btn: "Скачать Все",
        processed_result_msg: "Здесь появятся обработанные результаты",
        ar_auto: "Авто",
        ar_square: "1:1 (Квадрат)",
        ar_portrait_mobile: "9:16 (Мобильный)",
        ar_landscape: "16:9 (Альбомный)",
        ar_portrait_standard: "3:4 (Портрет)",
        ar_landscape_standard: "4:3 (Альбом)",
        ar_classic_photo: "3:2 (Классика)",
        ar_portrait_photo: "2:3 (Портрет фото)",
        ar_print: "5:4 (Печать)",
        ar_instagram: "4:5 (Instagram)",
        ar_cinematic: "21:9 (Кино)",

        // Translating new keys
        mode_images: "Изображения",
        mode_text_csv: "Текст / CSV",
        job_name_optional: "Название задачи (опц.)",
        job_name_placeholder: "напр. Проект А",
        input_files: "Входные файлы",
        analyze_files_placeholder: "Проанализировать прикрепленные файлы...",
        image_gen_placeholder: "Опишите генерацию изображения",
    }
};

interface LanguageContextType {
    language: Language;
    setLanguage: (lang: Language) => void;
    t: (key: keyof typeof translations['en']) => string;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [language, setLanguage] = useState<Language>('en');
    const [isLoaded, setIsLoaded] = useState(false);

    useEffect(() => {
        // Load language preference from server or localStorage
        const loadLanguage = async () => {
            try {
                // Try to fetch from server first
                const res = await fetch('/api/system-settings');
                if (res.ok) {
                    const settings = await res.json();
                    const serverLanguage = settings.language as Language;
                    if (serverLanguage && (serverLanguage === 'en' || serverLanguage === 'ru')) {
                        setLanguage(serverLanguage);
                        localStorage.setItem('app_language', serverLanguage);
                        setIsLoaded(true);
                        return;
                    }
                }
            } catch (e) {
                // Fall back to localStorage
            }
            
            // Fall back to localStorage
            const stored = localStorage.getItem('app_language') as Language;
            if (stored && (stored === 'en' || stored === 'ru')) {
                setLanguage(stored);
            }
            setIsLoaded(true);
        };

        loadLanguage();
    }, []);

    const handleSetLanguage = (lang: Language) => {
        setLanguage(lang);
        localStorage.setItem('app_language', lang);
        
        // Save to server
        fetch('/api/system-settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ language: lang })
        }).catch(e => console.error('Failed to save language to server', e));
    };

    const t = (key: keyof typeof translations['en']) => {
        return translations[language][key] || key;
    };

    // Don't render children until language is loaded to prevent flashing
    if (!isLoaded) {
        return null;
    }

    return (
        <LanguageContext.Provider value={{ language, setLanguage: handleSetLanguage, t }}>
            {children}
        </LanguageContext.Provider>
    );
};

export const useLanguage = () => {
    const context = useContext(LanguageContext);
    if (!context) {
        throw new Error('useLanguage must be used within a LanguageProvider');
    }
    return context;
};
