'use client';

import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import CharacterCount from '@tiptap/extension-character-count';
import Placeholder from '@tiptap/extension-placeholder';
import { Bold, Italic, Strikethrough, List, ListOrdered } from 'lucide-react';

interface TiptapEditorProps {
  initialContent: string;
  placeholder?: string;
  onChange: (text: string, html: string) => void;
  onKeystroke?: () => void;
  onPaste?: (charCount: number) => void;
  editable?: boolean;
}

/** Spec F.7 — Tiptap rich-text editor for the practice page. */
export function TiptapEditor({
  initialContent,
  placeholder = 'اینجا شروع کن…',
  onChange,
  onKeystroke,
  onPaste,
  editable = true,
}: TiptapEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit,
      CharacterCount,
      Placeholder.configure({ placeholder }),
    ],
    content: initialContent,
    editable,
    editorProps: {
      attributes: {
        class: 'editor-content focus:outline-none min-h-[400px] px-4 py-3',
        'data-placeholder': placeholder,
      },
      handlePaste: (view, event) => {
        const text = (event as ClipboardEvent).clipboardData?.getData('text/plain') ?? '';
        if (text) onPaste?.(text.length);
        return false; // let Tiptap handle the paste normally
      },
    },
    onUpdate: ({ editor: e }) => {
      const text = e.getText();
      const html = e.getHTML();
      onChange(text, html);
    },
    onCreate: ({ editor: e }) => {
      const text = e.getText();
      const html = e.getHTML();
      if (text) onChange(text, html);
    },
  });

  // Forward keystroke events (throttled by the parent).
  if (editor?.isFocused) {
    // no-op — keystroke tracking is done via the onChange callback
  }

  return (
    <div className="flex flex-col h-full">
      {/* Minimal toolbar */}
      {editable && editor && (
        <div className="flex gap-1 border-b border-border p-2">
          <ToolbarButton
            title="برجسته"
            active={editor.isActive('bold')}
            onClick={() => editor.chain().focus().toggleBold().run()}
          >
            <Bold size={14} />
          </ToolbarButton>
          <ToolbarButton
            title="مورب"
            active={editor.isActive('italic')}
            onClick={() => editor.chain().focus().toggleItalic().run()}
          >
            <Italic size={14} />
          </ToolbarButton>
          <ToolbarButton
            title="خط‌خورده"
            active={editor.isActive('strike')}
            onClick={() => editor.chain().focus().toggleStrike().run()}
          >
            <Strikethrough size={14} />
          </ToolbarButton>
          <ToolbarButton
            title="فهرست نشانه‌دار"
            active={editor.isActive('bulletList')}
            onClick={() => editor.chain().focus().toggleBulletList().run()}
          >
            <List size={14} />
          </ToolbarButton>
          <ToolbarButton
            title="فهرست شماره‌دار"
            active={editor.isActive('orderedList')}
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
          >
            <ListOrdered size={14} />
          </ToolbarButton>
        </div>
      )}
      <EditorContent editor={editor} className="flex-1 overflow-y-auto" />
    </div>
  );
}

function ToolbarButton({
  active,
  onClick,
  title,
  children,
}: {
  active: boolean;
  onClick: () => void;
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={`w-8 h-8 rounded flex items-center justify-center transition-colors ${
        active
          ? 'bg-accent/10 text-accent'
          : 'text-text-secondary hover:bg-bg-primary'
      }`}
    >
      {children}
    </button>
  );
}
