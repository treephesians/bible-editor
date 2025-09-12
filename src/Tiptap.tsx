// src/Tiptap.tsx
import { useEditor, EditorContent, EditorContext } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import { useEffect, useMemo } from "react";
import BibleVerse from "./extensions/BibleVerse";

declare global {
  interface Window {
    ReactNativeWebView?: { postMessage: (data: string) => void };
    __RN_CONTENT__?: string;
  }
}

const Tiptap = () => {
  const editor = useEditor({
    extensions: [
      StarterKit,
      BibleVerse,
      Placeholder.configure({
        placeholder: "여기를 탭하여 입력을 시작하세요.",
        emptyEditorClass: "is-editor-empty",
        emptyNodeClass: "is-node-empty",
        includeChildren: true,
        showOnlyCurrent: false,
      }),
    ],
    content: "",
  });

  // Send content updates to React Native via window.ReactNativeWebView
  useEffect(() => {
    if (!editor) return;
    const handler = () => {
      const html = editor.getHTML();
      window.ReactNativeWebView?.postMessage(
        JSON.stringify({ type: "content", html })
      );
    };
    editor.on("update", handler);
    return () => {
      editor.off("update", handler);
    };
  }, [editor]);

  // Receive initial content from RN
  useEffect(() => {
    const applyInitial = () => {
      const initial = window.__RN_CONTENT__;
      if (initial != null && editor && editor.isEmpty) {
        editor.commands.setContent(initial);
      }
    };
    window.addEventListener("RN_CONTENT", applyInitial);
    applyInitial();
    return () => window.removeEventListener("RN_CONTENT", applyInitial);
  }, [editor]);

  // Memoize the provider value to avoid unnecessary re-renders
  const providerValue = useMemo(() => ({ editor }), [editor]);

  return (
    <EditorContext.Provider value={providerValue}>
      <EditorContent editor={editor} className="tiptap-editor" />
    </EditorContext.Provider>
  );
};

export default Tiptap;
