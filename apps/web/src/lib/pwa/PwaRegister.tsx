'use client';

import { useEffect, useState, useCallback } from 'react';
import { toast } from 'sonner';
import { startOutbox } from '@/lib/offline/outbox';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

/**
 * Client-side service-worker registration + install prompt.
 * Rendered once inside the root layout. The SW itself is generated
 * by next-pwa at build time into /sw.js.
 */
export function PwaRegister() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isStandalone, setIsStandalone] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Detect if already running in a standalone PWA context.
    const standalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (navigator as unknown as { standalone?: boolean }).standalone === true;
    setIsStandalone(standalone);

    // Start the offline outbox: listens for online/visibility events and
    // drains any queued writes when the network returns. Idempotent.
    startOutbox();

    // Register the service worker (produced by next-pwa at build time).
    if ('serviceWorker' in navigator) {
      const registerSW = async () => {
        try {
          const reg = await navigator.serviceWorker.register('/sw.js', {
            scope: '/',
          });
          // Auto-update: when a new version is waiting, prompt the user.
          reg.addEventListener('updatefound', () => {
            const newWorker = reg.installing;
            if (!newWorker) return;
            newWorker.addEventListener('statechange', () => {
              if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                toast.info('نسخه جدید کارگاه آماده است.', {
                  action: {
                    label: 'به‌روزرسانی',
                    onClick: () => newWorker.postMessage({ type: 'SKIP_WAITING' }),
                  },
                  duration: 8000,
                });
              }
            });
          });
        } catch {
          // SW registration can fail in dev or if the file is missing — non-fatal.
        }
      };
      registerSW();
    }

    // Capture the beforeinstallprompt event so we can show our own install button.
    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', onBeforeInstall);

    // When the app is actually installed, clear the deferred prompt.
    const onInstalled = () => setDeferredPrompt(null);
    window.addEventListener('appinstalled', onInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const handleInstall = useCallback(async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      toast.success('کارگاه نصب شد!');
    }
    setDeferredPrompt(null);
  }, [deferredPrompt]);

  // No UI rendered here — the install prompt is handled by the SW toast
  // and the beforeinstallprompt is exposed via a custom event for any
  // component that wants to show an "Install App" button.
  return null;
}
