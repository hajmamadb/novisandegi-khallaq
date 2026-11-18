'use client';

import { create } from 'zustand';

// Spec F.6 — editor-store. Tracks the in-flight practice session so the
// autosave debounce and submit handler can share state across components.

interface PasteRecord {
  charCount: number;
  at: number;
}

interface EditorState {
  sessionId: string | null;
  content: string;
  wordCount: number;
  startTime: number;
  activeTimeSeconds: number;
  lastActivityAt: number;
  pastes: PasteRecord[];
  keystrokes: number;
  lastSavedAt: number | null;
  dirty: boolean;
  setContent: (text: string) => void;
  onPaste: (charCount: number) => void;
  onKeystroke: () => void;
  onTick: () => void;
  markSaved: () => void;
  reset: (sessionId: string) => void;
}

function countWords(text: string): number {
  // DECISION: whitespace-split word count (matches the API's definition).
  const parts = text.trim().split(/\s+/);
  return parts.length === 1 && parts[0] === '' ? 0 : parts.length;
}

const initial = {
  sessionId: null,
  content: '',
  wordCount: 0,
  startTime: 0,
  activeTimeSeconds: 0,
  lastActivityAt: 0,
  pastes: [] as PasteRecord[],
  keystrokes: 0,
  lastSavedAt: null,
  dirty: false,
};

export const useEditorStore = create<EditorState>((set) => ({
  ...initial,

  setContent: (text) =>
    set({
      content: text,
      wordCount: countWords(text),
      dirty: true,
      lastActivityAt: Date.now(),
    }),

  onPaste: (charCount) =>
    set((s) => ({
      pastes: [...s.pastes, { charCount, at: Date.now() }],
      lastActivityAt: Date.now(),
    })),

  onKeystroke: () =>
    set((s) => ({
      keystrokes: s.keystrokes + 1,
      lastActivityAt: Date.now(),
    })),

  // Called by the 30s activity tick while the practice page is mounted.
  onTick: () =>
    set((s) => ({
      activeTimeSeconds: s.activeTimeSeconds + 30,
      lastActivityAt: Date.now(),
    })),

  markSaved: () => set({ lastSavedAt: Date.now(), dirty: false }),

  reset: (sessionId) =>
    set({ ...initial, sessionId, startTime: Date.now(), lastActivityAt: Date.now() }),
}));
