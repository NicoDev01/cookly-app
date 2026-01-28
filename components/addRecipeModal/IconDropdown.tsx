import React, { useEffect, useRef, useState } from 'react';

interface IconDropdownProps {
    value: string;
    onChange: (icon: string) => void;
    disabled?: boolean;
}

const COOKING_ICONS = [
    'restaurant', 'flatware', 'soup_kitchen', 'outdoor_grill',
    'local_fire_department', 'oven_gen', 'microwave_gen', 'blender',
    'kitchen', 'egg', 'cookie', 'local_pizza', 'set_meal', 'timer',
    'skillet', 'scale', 'heat', 'schedule',
    'cake', 'lunch_dining', 'ramen_dining', 'icecream', 'liquor',
    'water_drop', 'ac_unit', 'whatshot', 
];

const IconDropdown: React.FC<IconDropdownProps> = ({ value, onChange, disabled }) => {
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    return (
        <div className="relative" ref={dropdownRef}>
            <button
                type="button"
                onClick={() => !disabled && setIsOpen(!isOpen)}
                disabled={disabled}
                className="flex items-center gap-1.5 bg-gray-50 dark:bg-black/20 border-0 rounded-lg p-1.5 hover:bg-gray-100 dark:hover:bg-white/5 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                title="Icon auswählen"
            >
                <span className="material-symbols-outlined text-gray-600 dark:text-gray-300 text-lg">
                    {value || 'circle'}
                </span>
                <span className="material-symbols-outlined text-xs text-gray-400">
                    {isOpen ? 'expand_less' : 'expand_more'}
                </span>
            </button>

            {isOpen && (
                <div className="absolute left-0 mt-1 bg-white dark:bg-[#1e3031] border border-gray-200 dark:border-gray-700 rounded-xl shadow-2xl p-2 z-50 w-64">
                    <div className="grid grid-cols-6 gap-1 max-h-48 overflow-y-auto">
                        {COOKING_ICONS.map((icon) => (
                            <button
                                key={icon}
                                type="button"
                                onClick={() => {
                                    onChange(icon);
                                    setIsOpen(false);
                                }}
                                className={`p-2 rounded-lg transition-colors ${value === icon
                                        ? 'bg-primary text-white'
                                        : 'hover:bg-gray-100 dark:hover:bg-white/10 text-gray-700 dark:text-gray-300'
                                    }`}
                                title={icon}
                            >
                                <span className="material-symbols-outlined text-lg">{icon}</span>
                            </button>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};

export default IconDropdown;
