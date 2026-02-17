
import React, { createContext, useContext, useState, useEffect } from 'react';
import { getCurrentUser, getUserPreferences, saveUserPreferences } from '../services/authService';

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
        default_system_language: "Default System Language",
        default_system_language_desc: "Default language for new visitors",
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
        external_gallery_user_visibility: "External Gallery User Visibility",
        external_gallery_user_visibility_desc: "Choose which users are hidden in external gallery API output.",
        hidden_in_external_gallery: "Hidden",
        visible_in_external_gallery: "Visible",
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
        cloud_mode_image_desc: "Create image generation jobs with model parameters and prompt batching.",
        cloud_mode_text_desc: "Create analysis jobs for text files and CSV batches.",
        cloud_section_model: "Model & Request Settings",
        cloud_section_prompts: "Prompts & Preset",
        cloud_section_input_launch: "Input Files & Launch",
        cloud_summary_title: "Launch Summary",
        cloud_summary_files: "Files",
        cloud_summary_prompts: "Prompts",
        cloud_summary_requests: "Estimated Requests",
        cloud_ready_badge: "Ready",
        cloud_not_ready_badge: "Need input",
        cloud_requirement_image: "Add files or provide at least one prompt to create an image batch.",
        cloud_requirement_text: "Add at least one text file to create a text batch.",
        job_name_optional: "Job Name (Optional)",
        job_name_placeholder: "e.g. Project A",
        input_files: "Input Files",
        analyze_files_placeholder: "Analyze the attached files...",
        image_gen_placeholder: "Describe image generation...",
        generations_per_prompt_label: "Generations per Prompt",
        generations_per_prompt_hint: "1 prompt × {count} = {count} image requests.",
        files_per_request_label: "Files per Request",
        files_per_request_hint: "Example: 2 files merged into 1 prompt.",
        batch_prompts_label: "Batch prompts (optional)",
        batch_prompts_placeholder: "Short prompts: one per line\nor\nLong prompt block 1\nline 2\n---\nLong prompt block 2",
        batch_prompts_hint_image: "{prompts} prompts × {generations} generations = {requests} cloud requests (use --- to split long multi-line prompts).",
        batch_prompts_hint_text: "{prompts} prompts will be sent as separate cloud requests (use --- to split long multi-line prompts).",
        batch_prompts_hint_empty: "If empty, the single User Prompt is used.",
        local_batch_prompts_hint_image: "{prompts} prompts × {generations} generations × queued files = {requests} local runs.",
        local_batch_prompts_hint_text: "{prompts} prompts × file groups = {groups} local runs.",
        local_filter_errors: "Only errors",
        cloud_clear_history_confirm: "Are you sure you want to clear the job history?",
        cloud_batch_creation_failed: "Batch creation failed:",
        cloud_cancel_failed: "Failed to cancel job:",
        cloud_fetching_data: "Fetching data...",
        cloud_output_not_found: "Error: Could not find output file for job {jobId}.",
        cloud_html_instead_json: "Received HTML instead of JSON. Check API Key or permissions.",
        cloud_parsing_items: "Parsing {count} items...",
        cloud_download_empty: "Download successful, but no content was extracted.",
        cloud_download_failed: "Download failed:",
        cloud_history_result_image_prompt: "Cloud Batch Result: {jobId}",
        cloud_history_result_text_prompt: "Cloud Batch Text Result: {name}",
        cloud_saved_gallery_success: "Successfully saved {count} items to the Gallery!",
        cloud_save_gallery_failed: "Error saving to gallery:",
        cloud_zip_failed: "ZIP download failed:",
        cloud_debug_copied: "Debug info copied!",
        cloud_debug_failed: "Debug failed:",
        cloud_preview_title: "Batch Results Preview",
        cloud_tip_zip_names: "Tip: Download ZIP to get processed files with original names.",
        cloud_save_to_gallery: "Save to Gallery",
        cloud_drag_drop_text_files: "Drag & drop text files",
        cloud_preview_btn: "Preview",
        cloud_status_unspecified: "Unspecified",
        cloud_status_pending: "Pending",
        cloud_status_running: "Running",
        cloud_status_succeeded: "Succeeded",
        cloud_status_failed: "Failed",
        cloud_status_cancelled: "Cancelled",
        cloud_default_image_job_name: "Batch_{timestamp}_Img_P{page}",
        cloud_default_text_job_name: "Batch_{timestamp}_Txt_P{page}",
        cloud_processing_classic: "Classic 20",
        cloud_processing_streamed: "Streamed 100",
        cloud_processing_classic_desc: "Current mode: create jobs in chunks of 20 and parse preview in memory.",
        cloud_processing_streamed_desc: "New mode: create jobs in chunks of 100 and stream all preview items progressively.",
        cloud_streamed_page_actions_hint: "Streamed mode: actions apply to all visible items (removed items are excluded).",
        cloud_zip_all_pages: "ZIP All Pages",
        cloud_save_all_pages_to_gallery: "Save All Pages",
        cloud_exclude_item: "Exclude from save/zip",
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
        default_system_language: "Язык системы по умолчанию",
        default_system_language_desc: "Язык по умолчанию для новых посетителей",
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
        external_gallery_user_visibility: "Видимость пользователей в API галереи",
        external_gallery_user_visibility_desc: "Выберите пользователей, которых нужно скрыть из внешнего API галереи.",
        hidden_in_external_gallery: "Скрыт",
        visible_in_external_gallery: "Виден",
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
        cloud_mode_image_desc: "Создание задач генерации изображений с параметрами модели и пакетными промптами.",
        cloud_mode_text_desc: "Создание задач анализа для текстовых файлов и CSV-пакетов.",
        cloud_section_model: "Параметры модели и запроса",
        cloud_section_prompts: "Промпты и пресет",
        cloud_section_input_launch: "Входные файлы и запуск",
        cloud_summary_title: "Итог перед запуском",
        cloud_summary_files: "Файлы",
        cloud_summary_prompts: "Промпты",
        cloud_summary_requests: "Оценка запросов",
        cloud_ready_badge: "Готово",
        cloud_not_ready_badge: "Нужно заполнить",
        cloud_requirement_image: "Добавьте файлы или укажите хотя бы один промпт для image batch.",
        cloud_requirement_text: "Добавьте хотя бы один текстовый файл для text batch.",
        job_name_optional: "Название задачи (опц.)",
        job_name_placeholder: "напр. Проект А",
        input_files: "Входные файлы",
        analyze_files_placeholder: "Проанализировать прикрепленные файлы...",
        image_gen_placeholder: "Опишите генерацию изображения",
        generations_per_prompt_label: "Генераций на один промпт",
        generations_per_prompt_hint: "1 промпт × {count} = {count} запросов на изображения.",
        files_per_request_label: "Файлов в одном запросе",
        files_per_request_hint: "Пример: 2 файла объединяются в 1 промпт.",
        batch_prompts_label: "Batch промпты (необязательно)",
        batch_prompts_placeholder: "Короткие промпты: по одному в строке\nили\nДлинный промпт 1\nстрока 2\n---\nДлинный промпт 2",
        batch_prompts_hint_image: "{prompts} промптов × {generations} генераций = {requests} cloud-запросов (используйте --- для разделения длинных многострочных промптов).",
        batch_prompts_hint_text: "{prompts} промптов будут отправлены как отдельные cloud-запросы (используйте --- для разделения длинных многострочных промптов).",
        batch_prompts_hint_empty: "Если поле пустое, используется одиночный User Prompt.",
        local_batch_prompts_hint_image: "{prompts} промптов × {generations} генераций × файлов в очереди = {requests} локальных запусков.",
        local_batch_prompts_hint_text: "{prompts} промптов × групп файлов = {groups} локальных запусков.",
        local_filter_errors: "Только ошибки",
        cloud_clear_history_confirm: "Вы уверены, что хотите очистить историю задач?",
        cloud_batch_creation_failed: "Не удалось создать batch-задачу:",
        cloud_cancel_failed: "Не удалось отменить задачу:",
        cloud_fetching_data: "Получение данных...",
        cloud_output_not_found: "Ошибка: не найден выходной файл для задачи {jobId}.",
        cloud_html_instead_json: "Вместо JSON получен HTML. Проверьте API-ключ или права доступа.",
        cloud_parsing_items: "Обработка {count} элементов...",
        cloud_download_empty: "Загрузка прошла успешно, но данные не были извлечены.",
        cloud_download_failed: "Ошибка загрузки:",
        cloud_history_result_image_prompt: "Результат облачного batch: {jobId}",
        cloud_history_result_text_prompt: "Текстовый результат облачного batch: {name}",
        cloud_saved_gallery_success: "Успешно сохранено в галерею: {count} элементов!",
        cloud_save_gallery_failed: "Ошибка сохранения в галерею:",
        cloud_zip_failed: "Ошибка создания ZIP:",
        cloud_debug_copied: "Отладочная информация скопирована!",
        cloud_debug_failed: "Ошибка отладки:",
        cloud_preview_title: "Предпросмотр результатов batch",
        cloud_tip_zip_names: "Совет: скачайте ZIP, чтобы получить файлы с исходными именами.",
        cloud_save_to_gallery: "Сохранить в галерею",
        cloud_drag_drop_text_files: "Перетащите текстовые файлы",
        cloud_preview_btn: "Предпросмотр",
        cloud_status_unspecified: "Неопределено",
        cloud_status_pending: "В очереди",
        cloud_status_running: "Выполняется",
        cloud_status_succeeded: "Успешно",
        cloud_status_failed: "Ошибка",
        cloud_status_cancelled: "Отменено",
        cloud_default_image_job_name: "Пакет_{timestamp}_Изоб_Ч{page}",
        cloud_default_text_job_name: "Пакет_{timestamp}_Текст_Ч{page}",
        cloud_processing_classic: "Классика 20",
        cloud_processing_streamed: "Поток 100",
        cloud_processing_classic_desc: "Текущий режим: задачи создаются пачками по 20, предпросмотр парсится в памяти.",
        cloud_processing_streamed_desc: "Новый режим: задачи создаются пачками по 100, предпросмотр всех элементов загружается потоково.",
        cloud_streamed_page_actions_hint: "Режим Поток: действия применяются ко всем видимым элементам (удалённые исключаются).",
        cloud_zip_all_pages: "ZIP все страницы",
        cloud_save_all_pages_to_gallery: "Сохранить все страницы",
        cloud_exclude_item: "Исключить из сохранения/ZIP",
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
        // Load language preference from user account, server, localStorage, or cookies
        const loadLanguage = async () => {
            const currentUser = getCurrentUser();
            
            // First check localStorage (fastest)
            const storedLocal = localStorage.getItem('app_language') as Language;
            if (storedLocal && (storedLocal === 'en' || storedLocal === 'ru')) {
                setLanguage(storedLocal);
            }
            
            // If user is logged in, load their personal preferences
            if (currentUser) {
                try {
                    const prefs = await getUserPreferences(currentUser.id);
                    if (prefs.language && (prefs.language === 'en' || prefs.language === 'ru')) {
                        setLanguage(prefs.language);
                        localStorage.setItem('app_language', prefs.language);
                        document.cookie = `app_language=${prefs.language}; max-age=31536000; path=/`;
                        setIsLoaded(true);
                        return;
                    }
                } catch (e) {
                    console.error('Failed to load user preferences', e);
                }
            }
            
            try {
                // Then sync with server (system settings)
                const res = await fetch('/api/system-settings');
                if (res.ok) {
                    const settings = await res.json();
                    const serverLanguage = settings.language as Language;
                    
                    // Only overwrite if we didn't find a local preference OR if user isn't logged in (acting as guest using system defaults)
                    // But wait, if they have a local cookie/storage preference, we should probably respect it even for guests?
                    // Let's say priority: UserAccount > LocalStorage/Cookie > SystemSettings
                    
                    // If we already loaded from LocalStorage (storedLocal), don't overwrite with System Settings
                    if (!storedLocal && serverLanguage && (serverLanguage === 'en' || serverLanguage === 'ru')) {
                        setLanguage(serverLanguage);
                        localStorage.setItem('app_language', serverLanguage);
                        document.cookie = `app_language=${serverLanguage}; max-age=31536000; path=/`;
                    }
                }
            } catch (e) {
                console.error('Failed to load language from server', e);
                // Fall back to cookie if localStorage is empty
                if (!storedLocal) {
                    const cookieMatch = document.cookie.match(/app_language=(\w+)/);
                    if (cookieMatch && (cookieMatch[1] === 'en' || cookieMatch[1] === 'ru')) {
                        const cookieLang = cookieMatch[1] as Language;
                        setLanguage(cookieLang);
                        localStorage.setItem('app_language', cookieLang);
                    }
                }
            }
            
            setIsLoaded(true);
        };

        loadLanguage();
    }, []);

    const handleSetLanguage = (lang: Language) => {
        setLanguage(lang);
        localStorage.setItem('app_language', lang);
        // Also save to cookie for persistence after hard reload
        document.cookie = `app_language=${lang}; max-age=31536000; path=/`;
        
        const currentUser = getCurrentUser();
        
        // Save to user preferences if logged in
        if (currentUser) {
            saveUserPreferences(currentUser.id, { language: lang })
                .catch(e => console.error('Failed to save user language preference', e));
        }
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
