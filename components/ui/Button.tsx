
import React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: 'primary' | 'secondary' | 'danger' | 'success';
    isLoading?: boolean;
    icon?: string;
}

const Button: React.FC<ButtonProps> = ({ 
    children, 
    variant = 'primary', 
    isLoading = false, 
    icon,
    className = '',
    disabled,
    ...props 
}) => {
    const baseStyles = "inline-flex items-center justify-center px-6 py-3 rounded-xl font-medium transition-all duration-200 transform active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100";
    
    const variants = {
        primary: "bg-gradient-to-r from-theme-primary to-theme-secondary hover:brightness-110 text-white shadow-lg shadow-theme-glow/40 hover:shadow-theme-glow/60 border border-transparent",
        secondary: "bg-slate-800/80 hover:bg-slate-700 text-slate-200 border border-slate-700 hover:border-slate-600 backdrop-blur-sm",
        danger: "bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 hover:border-red-500/50",
        success: "bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-900/40"
    };

    return (
        <button 
            className={`${baseStyles} ${variants[variant]} ${className}`}
            disabled={disabled || isLoading}
            {...props}
        >
            {isLoading ? (
                <i className="fas fa-circle-notch fa-spin mr-2"></i>
            ) : icon ? (
                <i className={`fas ${icon} mr-2`}></i>
            ) : null}
            {children}
        </button>
    );
};

export default Button;
