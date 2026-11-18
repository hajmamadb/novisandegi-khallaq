'use client';

import { AlertTriangle, AlertCircle, Info, X, Loader2 } from 'lucide-react';

interface ConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  title?: string;
  description: string;
  confirmText?: string;
  cancelText?: string;
  variant?: 'danger' | 'warning' | 'info';
  isLoading?: boolean;
}

export function ConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  title = 'تأیید عملیات',
  description,
  confirmText = 'تأیید',
  cancelText = 'انصراف',
  variant = 'warning',
  isLoading = false,
}: ConfirmModalProps) {
  if (!isOpen) return null;

  const iconColors = {
    danger: 'text-red-500 bg-red-500/10 border-red-500/20',
    warning: 'text-amber-500 bg-amber-500/10 border-amber-500/20',
    info: 'text-blue-500 bg-blue-500/10 border-blue-500/20',
  }[variant];

  const buttonColors = {
    danger: 'bg-red-600 hover:bg-red-700 text-white',
    warning: 'bg-amber-600 hover:bg-amber-700 text-white',
    info: 'bg-accent hover:opacity-90 text-white',
  }[variant];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-md bg-bg-secondary border border-border rounded-xl shadow-2xl p-5 space-y-4 animate-in zoom-in-95 duration-150">
        <div className="flex items-start gap-3">
          <div className={`p-2.5 rounded-full border shrink-0 ${iconColors}`}>
            {variant === 'danger' && <AlertTriangle className="w-5 h-5" />}
            {variant === 'warning' && <AlertCircle className="w-5 h-5" />}
            {variant === 'info' && <Info className="w-5 h-5" />}
          </div>
          <div className="space-y-1 flex-1 min-w-0">
            <h3 className="text-base font-bold text-text-primary">{title}</h3>
            <p className="text-sm text-text-secondary leading-relaxed">
              {description}
            </p>
          </div>
          <button
            onClick={onClose}
            disabled={isLoading}
            className="p-1 rounded-md text-text-secondary hover:text-text-primary hover:bg-bg-primary transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex items-center justify-end gap-2 pt-3 border-t border-border/60">
          <button
            type="button"
            onClick={onClose}
            disabled={isLoading}
            className="px-4 py-2 text-sm font-medium rounded-lg border border-border bg-bg-primary text-text-primary hover:bg-bg-secondary transition-colors"
          >
            {cancelText}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isLoading}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors flex items-center gap-1.5 ${buttonColors} disabled:opacity-50`}
          >
            {isLoading && <Loader2 className="w-4 h-4 animate-spin" />}
            <span>{confirmText}</span>
          </button>
        </div>
      </div>
    </div>
  );
}

