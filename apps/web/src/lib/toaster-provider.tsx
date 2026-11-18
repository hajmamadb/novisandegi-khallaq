'use client';

import { Toaster } from 'sonner';

// sonner toaster for the whole app (spec F.6 — light toasts).
export function ToasterProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      {children}
      <Toaster richColors position="bottom-left" />
    </>
  );
}
