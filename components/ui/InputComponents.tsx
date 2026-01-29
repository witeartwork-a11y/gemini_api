
import React from 'react';

interface BaseProps {
    label?: string;
    className?: string;
}

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement>, BaseProps {
    options: { value: string; label: string }[];
}

export const Select: React.FC<SelectProps> = ({ label, options, className = '', ...props }) => (
    <div className={`mb-5 ${className}`}>
        {label && <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 ml-1">{label}</label>}
        <div className="relative group">
            <select 
                className="w-full bg-slate-800/50 backdrop-blur-sm border border-slate-700/50 text-slate-100 rounded-xl px-4 py-3.5 appearance-none focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all hover:bg-slate-800/80 cursor-pointer"
                {...props}
            >
                {options.map(opt => (
                    <option key={opt.value} value={opt.value} className="bg-slate-900 text-slate-200 py-2">{opt.label}</option>
                ))}
            </select>
            <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-slate-500 group-hover:text-slate-300 transition-colors">
                <i className="fas fa-chevron-down text-xs"></i>
            </div>
        </div>
    </div>
);

interface TextAreaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement>, BaseProps {}

export const TextArea: React.FC<TextAreaProps> = ({ label, className = '', ...props }) => (
    <div className={`mb-5 ${className}`}>
        {label && <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 ml-1">{label}</label>}
        <textarea 
            className="w-full bg-slate-800/50 backdrop-blur-sm border border-slate-700/50 text-slate-100 rounded-xl px-4 py-3.5 min-h-[120px] focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all hover:bg-slate-800/80 placeholder-slate-600 resize-y"
            {...props}
        />
    </div>
);

interface RangeProps extends React.InputHTMLAttributes<HTMLInputElement>, BaseProps {
    minLabel?: string;
    maxLabel?: string;
}

export const RangeInput: React.FC<RangeProps> = ({ label, minLabel, maxLabel, value, className = '', ...props }) => (
    <div className={`mb-6 ${className}`}>
        <div className="flex justify-between items-center mb-3">
             {label && <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider ml-1">{label}</label>}
             <span className="bg-blue-600/20 text-blue-400 px-2 py-0.5 rounded text-xs font-mono font-bold border border-blue-500/30">{value}</span>
        </div>
        
        <input 
            type="range" 
            className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer focus:outline-none"
            value={value}
            {...props}
        />
        <div className="flex justify-between text-[10px] text-slate-500 mt-2 font-medium uppercase tracking-wide">
            <span>{minLabel}</span>
            <span>{maxLabel}</span>
        </div>
    </div>
);
