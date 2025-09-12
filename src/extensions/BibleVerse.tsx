import { Node, mergeAttributes, InputRule } from "@tiptap/core";
import { ReactNodeViewRenderer, NodeViewWrapper } from "@tiptap/react";
import React, { useEffect, useRef, useState } from "react";

export type BibleVerseAttrs = {
  id: string;
  status: "input" | "loading" | "resolved" | "error";
  book?: string;
  bookName?: string;
  chapter?: number;
  verse?: number;
  text?: string;
};

function generateId() {
  return Math.random().toString(36).slice(2, 10);
}

const InputView: React.FC<{
  node: any;
  updateAttributes: (a: Partial<BibleVerseAttrs>) => void;
}> = ({ node, updateAttributes }) => {
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const requestLookup = () => {
    const id = node.attrs.id as string;
    updateAttributes({ status: "loading" });
    window.ReactNativeWebView?.postMessage(
      JSON.stringify({ type: "bible:lookup", id, query: value })
    );
  };

  return (
    <NodeViewWrapper
      data-bible-verse
      className="bible-verse"
      contentEditable={false}
    >
      <div className="bible-verse__label">✝️ 성경 블록</div>
      <input
        ref={inputRef}
        className="bible-verse__input"
        placeholder="예) '창세기 1장 1절' 입력 후 엔터"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            requestLookup();
          }
        }}
        inputMode="search"
        autoCorrect="off"
        autoCapitalize="none"
        autoFocus
      />
    </NodeViewWrapper>
  );
};

const ResolvedView: React.FC<{ node: any }> = ({ node }) => {
  const { book, bookName, chapter, verse, text } =
    node.attrs as BibleVerseAttrs;
  const map: Record<string, string> = { "01": "창세기" };
  const displayName = bookName ?? (book ? map[book] : undefined) ?? "";
  return (
    <NodeViewWrapper
      data-bible-verse
      className="bible-verse bible-verse--resolved"
    >
      <div className="bible-verse__header">
        {displayName} {chapter}장
      </div>
      {Array.isArray(text) ? (
        (text as any[]).map((t, idx) => (
          <div key={idx} className="bible-verse__line">
            <span className="bible-verse__verse">{idx + Number(verse)}</span>
            <span className="bible-verse__text">{t}</span>
          </div>
        ))
      ) : (
        <div className="bible-verse__line">
          <span className="bible-verse__verse">{verse}</span>
          <span className="bible-verse__text">{text}</span>
        </div>
      )}
    </NodeViewWrapper>
  );
};

const LoadingView: React.FC = () => (
  <NodeViewWrapper
    data-bible-verse
    className="bible-verse bible-verse--loading"
  >
    조회 중...
  </NodeViewWrapper>
);

const ErrorView: React.FC = () => (
  <NodeViewWrapper data-bible-verse className="bible-verse bible-verse--error">
    구절을 찾을 수 없어요
  </NodeViewWrapper>
);

const BibleVerseReactView: React.FC<any> = (props) => {
  const { node, updateAttributes } = props;
  const status: BibleVerseAttrs["status"] = node.attrs.status;
  useEffect(() => {
    const onResult = (e: Event) => {
      const detail = (e as CustomEvent).detail as { id: string; result: any };
      if (!detail || detail.id !== node.attrs.id) return;
      const res = detail.result;
      if (res && res.verses) {
        // 범위 결과: text에 배열을 넣어 라인별 렌더링
        updateAttributes({
          status: "resolved",
          book: res.book,
          bookName: res.bookName,
          chapter: res.chapter,
          verse: res.start,
          text: res.verses.map((v: any) => v.text),
        });
      } else if (res && res.text) {
        updateAttributes({
          status: "resolved",
          book: res.book,
          bookName: res.bookName,
          chapter: res.chapter,
          verse: res.verse,
          text: res.text,
        });
      } else {
        updateAttributes({ status: "error" });
      }
    };
    window.addEventListener("bible:result", onResult as any);
    return () => window.removeEventListener("bible:result", onResult as any);
  }, [node.attrs.id, updateAttributes]);
  if (status === "loading") return <LoadingView />;
  if (status === "resolved") return <ResolvedView node={node} />;
  if (status === "error") return <ErrorView />;
  return <InputView node={node} updateAttributes={updateAttributes} />;
};

const BibleVerse = Node.create({
  name: "bibleVerse",
  group: "block",
  atom: true,
  selectable: true,
  defining: true,
  addAttributes() {
    return {
      id: { default: null },
      status: { default: "input" },
      book: { default: null },
      bookName: { default: null },
      chapter: { default: null },
      verse: { default: null },
      text: { default: "" },
    };
  },
  parseHTML() {
    return [
      {
        tag: "div[data-bible-verse]",
        getAttrs: (el: any) => {
          const e = el as HTMLElement;
          return {
            id: e.getAttribute("data-id") || generateId(),
            status: (e.getAttribute("data-status") as any) || "input",
            book: e.getAttribute("data-book"),
            bookName: e.getAttribute("data-book-name"),
            chapter: e.getAttribute("data-chapter")
              ? Number(e.getAttribute("data-chapter"))
              : null,
            verse: e.getAttribute("data-verse")
              ? Number(e.getAttribute("data-verse"))
              : null,
            text: e.getAttribute("data-text") || "",
          } as Partial<BibleVerseAttrs>;
        },
      },
    ];
  },
  renderHTML({ HTMLAttributes }) {
    const attrs = HTMLAttributes as any;
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        "data-bible-verse": "true",
        "data-id": attrs.id,
        "data-status": attrs.status,
        "data-book": attrs.book,
        "data-book-name": attrs.bookName,
        "data-chapter": attrs.chapter,
        "data-verse": attrs.verse,
        "data-text": attrs.text,
      }),
    ];
  },
  addNodeView() {
    return ReactNodeViewRenderer(BibleVerseReactView);
  },
  addInputRules() {
    return [
      new InputRule({
        find: /@\s$/,
        handler: ({ chain, range }) => {
          chain()
            .deleteRange(range)
            .insertContent({
              type: this.name,
              attrs: { id: generateId(), status: "input" },
            })
            .run();
        },
      }),
    ];
  },
});

export default BibleVerse;
