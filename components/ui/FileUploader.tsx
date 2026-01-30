
import React, { useRef, useState } from 'react';

interface FileUploaderProps {
    onFilesSelected: (files: File[]) => void;
    multiple?: boolean;
    className?: string;
    accept?: string;
    label?: string;
}

const FileUploader: React.FC<FileUploaderProps> = ({ 
    onFilesSelected, 
    multiple = false, 
    className = '',
    accept = "image/*",
    label
}) => {
    const inputRef = useRef<HTMLInputElement>(null);
    const [isDragging, setIsDragging] = useState(false);

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(true);
    };

    const handleDragLeave = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation(); // Prevent parent handlers from firing
        setIsDragging(false);
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            handleFiles(e.dataTransfer.files);
        }
    };

    const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            handleFiles(e.target.files);
        }
    };

    const handleFiles = (fileList: FileList) => {
        const files: File[] = [];
        // Allow all files if wildcard or specific types match
        for (let i = 0; i < fileList.length; i++) {
            const file = fileList[i];
            
            // Basic filtering if accept is provided and isn't just a wildcard
            // Note: Simple 'startsWith' logic is used for 'image/', for others we trust the browser or validate later
            if (accept === '*' || accept.includes(file.type) || accept.includes('.' + file.name.split('.').pop())) {
                files.push(file);
            } else if (accept === 'image/*' && file.type.startsWith('image/')) {
                 files.push(file);
            } else if (accept !== 'image/*') {
                // If custom accept (like .csv, .txt), we generally accept the file and let the logic handle it
                // because MIME types for text/code can be inconsistent across OS
                files.push(file);
            }
        }
        
        if (files.length > 0) {
            if (!multiple) {
                onFilesSelected([files[0]]);
            } else {
                onFilesSelected(files);
            }
        }
    };

    return (
        <div 
            className={`
                group relative border-2 border-dashed rounded-2xl p-6 text-center cursor-pointer transition-all duration-300 flex flex-col items-center justify-center overflow-hidden
                ${isDragging 
                    ? 'border-blue-500 bg-blue-500/10 scale-[1.01] shadow-xl shadow-blue-500/10' 
                    : 'border-slate-700 bg-slate-800/30 hover:border-slate-500 hover:bg-slate-800/60'}
                ${className}
            `}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => inputRef.current?.click()}
        >
            <input 
                type="file" 
                ref={inputRef}
                id="file-uploader-input"
                name="file-uploader"
                className="hidden" 
                multiple={multiple}
                accept={accept}
                onChange={handleFileInput}
            />
            
            <div className="flex flex-col items-center gap-3 relative z-10 w-full max-w-full">
                <div className={`
                    w-12 h-12 rounded-xl flex items-center justify-center transition-all duration-300 shrink-0
                    ${isDragging ? 'bg-blue-500 text-white shadow-lg shadow-blue-500/50' : 'bg-slate-700/50 text-slate-400 group-hover:bg-slate-700 group-hover:text-slate-200'}
                `}>
                    <i className={`fas fa-cloud-upload-alt text-2xl ${isDragging ? 'animate-bounce' : ''}`}></i>
                </div>
                <div className="w-full px-2">
                    <p className="text-sm font-semibold text-slate-200 break-words whitespace-normal w-full leading-tight">
                        {isDragging ? 'Drop it!' : (label || 'Drag & drop files')}
                    </p>
                    <p className="text-xs text-slate-500 mt-1 break-words whitespace-normal w-full">
                        or click to browse {multiple ? 'multiple' : ''}
                    </p>
                </div>
            </div>
        </div>
    );
};

export default FileUploader;
