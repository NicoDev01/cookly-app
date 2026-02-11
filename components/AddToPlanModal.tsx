import React, { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useMutation } from "convex/react";
import { api } from "../convex/_generated/api";
import { Id } from "../convex/_generated/dataModel";

interface AddToPlanModalProps {
    isOpen: boolean;
    onClose: () => void;
    recipeId: Id<"recipes">;
    recipeTitle: string;
    recipeImage?: string;
    scope?: 'day' | 'week'; // Optional scope override
}

const AddToPlanModal: React.FC<AddToPlanModalProps> = ({ isOpen, onClose, recipeId, recipeTitle, recipeImage, scope: scopeProp }) => {
    const addMeal = useMutation(api.weekly.addMeal);

    // Internal state for scope (allows switching between day/week within modal)
    const [scope, setScope] = useState<'day' | 'week'>(scopeProp ?? 'day');

    // State for Week Navigation (Default to current week)
    const [currentWeekStart, setCurrentWeekStart] = useState<Date>(() => {
        const d = new Date();
        const day = d.getDay();
        const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Monday
        const start = new Date(d.setDate(diff));
        start.setHours(0, 0, 0, 0);
        return start;
    });

    // Helper to format date as YYYY-MM-DD for backend
    const formatDate = (d: Date) => {
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    };

    // Generate the 7 days of the current view
    const weekDays = useMemo(() => {
        const days = [];
        for (let i = 0; i < 7; i++) {
            const d = new Date(currentWeekStart);
            d.setDate(d.getDate() + i);
            days.push(d);
        }
        return days;
    }, [currentWeekStart]);

    const handlePrevWeek = () => {
        const newStart = new Date(currentWeekStart);
        newStart.setDate(newStart.getDate() - 7);
        setCurrentWeekStart(newStart);
    };

    const handleNextWeek = () => {
        const newStart = new Date(currentWeekStart);
        newStart.setDate(newStart.getDate() + 7);
        setCurrentWeekStart(newStart);
    };

    const handleSelectDay = async (date: Date) => {
        await addMeal({
            recipeId,
            date: formatDate(date),
            scope: scope === 'week' ? 'week' : 'day',
        });
        onClose();
    };

    const getDayName = (d: Date) => d.toLocaleDateString('de-DE', { weekday: 'short' });
    const getFormattedDate = (d: Date) => d.toLocaleDateString('de-DE', { day: 'numeric', month: 'short' });
    const isToday = (d: Date) => {
        const today = new Date();
        return d.getDate() === today.getDate() &&
            d.getMonth() === today.getMonth() &&
            d.getFullYear() === today.getFullYear();
    };

    const getWeekNumber = (d: Date) => {
        d = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
        d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
        var yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
        return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
    };

    if (!isOpen) return null;

    return createPortal(
        <div className="fixed inset-0 z-[100] flex items-end justify-center pointer-events-auto">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity"
                onClick={onClose}
            />

            {/* Slide-up Panel */}
            <div className="relative w-full h-[92vh] bg-background-light dark:bg-background-dark rounded-t-3xl shadow-2xl flex flex-col overflow-hidden animate-slide-up pb-safe-offset">

                {/* Header */}
                <div className="flex flex-col gap-4 p-4 pb-2 border-b border-gray-100 dark:border-gray-800 bg-card-light/50 dark:bg-card-dark/50 backdrop-blur-md z-10">
                    <div className="flex items-center justify-between">
                        <button
                            onClick={onClose}
                            className="p-2 -ml-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 text-text-primary-light dark:text-text-primary-dark"
                        >
                            <span className="material-symbols-outlined text-2xl">close</span>
                        </button>

                        <div className="flex-1 text-center px-4">
                            <h3 className="text-lg font-bold text-text-primary-light dark:text-text-primary-dark line-clamp-2 leading-tight">
                                {recipeTitle}
                            </h3>
                        </div>
                        <div className="w-10" /> {/* Spacer for balance */}
                    </div>
                </div>

                {/* Week Navigation */}
                <div className="flex items-center justify-between px-6 py-4 bg-card-light/50 dark:bg-card-dark/50 shrink-0">
                    <button
                        onClick={handlePrevWeek}
                        className="p-1 text-text-secondary-light dark:text-text-secondary-dark hover:text-primary transition-colors"
                    >
                        <span className="material-symbols-outlined text-2xl">chevron_left</span>
                    </button>
                    <span className="font-medium text-text-primary-light dark:text-text-primary-dark">
                        KW {getWeekNumber(weekDays[0])} · {getFormattedDate(weekDays[0])} - {getFormattedDate(weekDays[6])}
                    </span>
                    <button
                        onClick={handleNextWeek}
                        className="p-1 text-text-secondary-light dark:text-text-secondary-dark hover:text-primary transition-colors"
                    >
                        <span className="material-symbols-outlined text-2xl">chevron_right</span>
                    </button>
                </div>

                {/* Days List */}
                <div className="flex-1 overflow-y-auto p-4">
                    <div className="grid gap-2 pb-safe-offset">
                        {weekDays.map(date => {
                            const isCurrent = isToday(date);
                            return (
                                <button
                                    key={date.toISOString()}
                                    onClick={() => handleSelectDay(date)}
                                    className={`flex items-center justify-between p-4 rounded-xl transition-all ${isCurrent
                                        ? 'bg-primary/10 border border-primary/20 shadow-sm'
                                        : 'bg-card-light dark:bg-card-dark hover:bg-gray-50 dark:hover:bg-gray-800'
                                        }`}
                                >
                                    <div className="flex items-center gap-4">
                                        <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold ${isCurrent
                                            ? 'bg-primary text-white'
                                            : 'bg-gray-100 dark:bg-gray-700 text-text-secondary-light dark:text-text-secondary-dark'
                                            }`}>
                                            {getDayName(date).substring(0, 2)}
                                        </div>
                                        <span className={`text-base font-medium ${isCurrent ? 'text-primary' : 'text-text-primary-light dark:text-text-primary-dark'}`}>
                                            {getFormattedDate(date)}
                                        </span>
                                    </div>
                                    <span className={`material-symbols-outlined ${isCurrent ? 'text-primary' : 'text-gray-300 dark:text-gray-600'}`}>
                                        add_circle
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                </div>
            </div>

            <style>{`
                @keyframes slide-up {
                  from { transform: translateY(100%); }
                  to { transform: translateY(0); }
                }
                .animate-slide-up {
                  animation: slide-up 0.3s cubic-bezier(0.16, 1, 0.3, 1);
                }
                .pb-safe-offset {
                    padding-bottom: env(safe-area-inset-bottom, 20px);
                }
            `}</style>
        </div>,
        document.body
    );
};

export default AddToPlanModal;
