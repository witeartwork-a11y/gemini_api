import React from 'react';

interface NumberStepperProps {
    value: number;
    onChange: (value: number) => void;
    min?: number;
    max?: number;
    step?: number;
    className?: string;
    inputClassName?: string;
    buttonClassName?: string;
    decreaseAriaLabel?: string;
    increaseAriaLabel?: string;
}

const NumberStepper: React.FC<NumberStepperProps> = ({
    value,
    onChange,
    min = 1,
    max = 50,
    step = 1,
    className = '',
    inputClassName = '',
    buttonClassName = '',
    decreaseAriaLabel = 'Decrease value',
    increaseAriaLabel = 'Increase value'
}) => {
    const clamp = (num: number) => Math.min(max, Math.max(min, num));

    const handleDecrease = () => {
        onChange(clamp(value - step));
    };

    const handleIncrease = () => {
        onChange(clamp(value + step));
    };

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const parsed = parseInt(e.target.value, 10);
        onChange(clamp(Number.isNaN(parsed) ? min : parsed));
    };

    return (
        <div className={`flex items-center gap-2 ${className}`.trim()}>
            <button
                type="button"
                onClick={handleDecrease}
                disabled={value <= min}
                className={`h-11 w-11 rounded-xl border border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700/70 disabled:opacity-40 disabled:cursor-not-allowed transition-colors ${buttonClassName}`.trim()}
                aria-label={decreaseAriaLabel}
            >
                <i className="fas fa-minus text-xs"></i>
            </button>

            <input
                type="number"
                min={min}
                max={max}
                step={step}
                value={value}
                onChange={handleInputChange}
                className={`w-full bg-slate-800 border border-slate-700 text-slate-100 rounded-xl px-4 py-3 text-center focus:outline-none focus:ring-2 focus:ring-blue-500/50 placeholder-slate-600 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none ${inputClassName}`.trim()}
            />

            <button
                type="button"
                onClick={handleIncrease}
                disabled={value >= max}
                className={`h-11 w-11 rounded-xl border border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700/70 disabled:opacity-40 disabled:cursor-not-allowed transition-colors ${buttonClassName}`.trim()}
                aria-label={increaseAriaLabel}
            >
                <i className="fas fa-plus text-xs"></i>
            </button>
        </div>
    );
};

export default NumberStepper;