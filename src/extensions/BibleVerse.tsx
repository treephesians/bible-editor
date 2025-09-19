import { Node, mergeAttributes, InputRule } from "@tiptap/core";
import {
  ReactNodeViewRenderer,
  NodeViewWrapper,
  type NodeViewProps,
} from "@tiptap/react";
import React, { useEffect, useRef, useState, useCallback } from "react";

export type BibleVerseAttrs = {
  id: string;
  status: "input" | "loading" | "resolved" | "error";
  book?: string;
  bookName?: string;
  chapter?: number;
  verse?: number;
  start?: number;
  end?: number;
  text?: string | string[];
  verses?: string; // JSON-encoded [{ verse, text }]
};

function generateId() {
  return Math.random().toString(36).slice(2, 10);
}

const InputView: React.FC<
  Pick<NodeViewProps, "node" | "editor" | "getPos"> & {
    updateAttributes: (a: Partial<BibleVerseAttrs>) => void;
  }
> = ({ node, updateAttributes, editor, getPos }) => {
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      const el = inputRef.current;
      if (!el) return;
      // iOS/Safari에서 즉시 포커스가 무시되는 경우가 있어 raf로 지연
      el.focus({ preventScroll: true });
      // 커서를 끝으로 이동해 입력 준비
      const len = el.value.length;
      el.setSelectionRange(len, len);
    });
    return () => cancelAnimationFrame(raf);
  }, [editor]);

  const moveCaretBelowFromInput = () => {
    try {
      const pos = typeof getPos === "function" ? getPos() : null;
      if (pos == null) return;
      const after = pos + node.nodeSize;
      const doc = editor.state.doc;
      const nodeAfter = doc.resolve(after).nodeAfter;
      if (!nodeAfter || nodeAfter.type.name !== "paragraph") {
        editor.chain().insertContentAt(after, { type: "paragraph" }).run();
      }
      editor
        .chain()
        .setTextSelection(after + 1)
        .focus()
        .run();
      // 이동 직후 강제 스크롤로 커서를 가시 영역으로 노출
      requestAnimationFrame(() => {
        try {
          editor.view.dispatch(editor.state.tr.scrollIntoView());
        } catch {
          /* ignore */
        }
      });
    } catch {
      /* ignore */
    }
  };

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
      onClick={() => {
        inputRef.current?.focus();
      }}
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
            e.stopPropagation();
            // 먼저 커서를 블록 아래 문단으로 이동시켜 키보드 유지
            moveCaretBelowFromInput();
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

const ResolvedView: React.FC<{ node: NodeViewProps["node"] }> = ({ node }) => {
  const { book, bookName, chapter, verse, text, verses } =
    node.attrs as BibleVerseAttrs;
  const map: Record<string, string> = { "01": "창세기" };
  const displayName = bookName ?? (book ? map[book] : undefined) ?? "";
  const baseVerse = Number(verse ?? 1);
  let pairs: { v: number; t: string }[] = [];
  if (typeof verses === "string" && verses.length > 0) {
    try {
      const arr = JSON.parse(decodeURIComponent(verses));
      if (Array.isArray(arr)) {
        pairs = arr
          .filter(
            (x) =>
              x && typeof x.verse === "number" && typeof x.text === "string"
          )
          .map((x) => ({ v: x.verse as number, t: x.text as string }));
      }
    } catch {
      /* ignore */
    }
  }
  if (pairs.length === 0) {
    const lines = Array.isArray(text)
      ? (text as string[])
      : typeof text === "string"
      ? (text as string).split("\n")
      : [];
    pairs = lines.map((t, idx) => ({ v: baseVerse + idx, t }));
  }
  return (
    <NodeViewWrapper
      data-bible-verse
      className="bible-verse bible-verse--resolved"
    >
      <div className="bible-verse__header">
        {displayName} {chapter}장
      </div>
      {pairs.map((p, idx) => (
        <div key={idx} className="bible-verse__line">
          <span className="bible-verse__verse">{p.v}</span>
          <span className="bible-verse__text">{p.t}</span>
        </div>
      ))}
    </NodeViewWrapper>
  );
};

const LoadingView: React.FC = () => (
  <NodeViewWrapper
    data-bible-verse
    className="bible-verse bible-verse--loading"
  />
);

const ErrorView: React.FC = () => (
  <NodeViewWrapper data-bible-verse className="bible-verse bible-verse--error">
    구절을 찾을 수 없어요
  </NodeViewWrapper>
);

type BibleResultDetail = {
  id: string;
  result?: {
    book?: string;
    bookName?: string;
    chapter?: number;
    verse?: number;
    start?: number;
    end?: number;
    text?: string | string[];
    verses?: { verse: number; text: string }[];
  };
};

const BibleVerseReactView: React.FC<NodeViewProps> = (props) => {
  const { node, updateAttributes, editor, getPos } = props;
  const status: BibleVerseAttrs["status"] = node.attrs.status;
  const moveCaretBelow = useCallback(() => {
    try {
      const pos = typeof getPos === "function" ? getPos() : null;
      if (pos == null) return;
      const after = pos + node.nodeSize;
      const doc = editor.state.doc;
      const nodeAfter = doc.resolve(after).nodeAfter;
      if (!nodeAfter || nodeAfter.type.name !== "paragraph") {
        editor.chain().insertContentAt(after, { type: "paragraph" }).run();
      }
      // 이미 selection이 아래에 있으면 재설정하지 않음
      const { from } = editor.state.selection;
      if (from !== after + 1) {
        editor
          .chain()
          .setTextSelection(after + 1)
          .focus()
          .run();
      }
      // 커서가 가려지지 않도록 스크롤
      requestAnimationFrame(() => {
        try {
          editor.view.dispatch(editor.state.tr.scrollIntoView());
        } catch {
          /* ignore */
        }
      });
    } catch {
      /* ignore */
    }
  }, [node, getPos, editor]);
  useEffect(() => {
    const onResult = (e: Event) => {
      const detail = (e as CustomEvent<BibleResultDetail>).detail;
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
          start: res.start,
          end: res.end,
          text: (res.verses || []).map((v) => v.text),
          verses: encodeURIComponent(
            JSON.stringify(
              (res.verses || []).map((v) => ({ verse: v.verse, text: v.text }))
            )
          ),
        });
        // 렌더 사이클 이후 커서를 블록 아래로 이동
        setTimeout(moveCaretBelow, 0);
      } else if (res && res.text) {
        updateAttributes({
          status: "resolved",
          book: res.book,
          bookName: res.bookName,
          chapter: res.chapter,
          verse: res.verse,
          text: res.text,
        });
        setTimeout(moveCaretBelow, 0);
      } else {
        updateAttributes({ status: "error" });
      }
    };
    window.addEventListener("bible:result", onResult as EventListener);
    return () =>
      window.removeEventListener("bible:result", onResult as EventListener);
  }, [node.attrs.id, updateAttributes, moveCaretBelow]);
  if (status === "loading") return <LoadingView />;
  if (status === "resolved") return <ResolvedView node={node} />;
  if (status === "error") return <ErrorView />;
  return (
    <InputView
      node={node}
      updateAttributes={updateAttributes}
      editor={editor}
      getPos={getPos}
    />
  );
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
      start: { default: null },
      end: { default: null },
      text: { default: "" },
      verses: { default: "" },
    };
  },
  parseHTML() {
    return [
      {
        tag: "div[data-bible-verse]",
        getAttrs: (el: Element) => {
          const e = el as HTMLElement;
          const rawVerses = e.getAttribute("data-verses");
          let parsedText: string | string[] = "";
          if (rawVerses && rawVerses.length > 0) {
            try {
              const arr: Array<{ verse?: number; text?: string }> = JSON.parse(
                decodeURIComponent(rawVerses)
              );
              // 저장된 것이 객체배열이면 텍스트 배열로 투영
              if (Array.isArray(arr)) {
                parsedText = arr.map((x) =>
                  x && typeof x.text === "string" ? x.text : ""
                );
              } else {
                parsedText = "";
              }
            } catch {
              parsedText = "";
            }
          } else {
            const rawText = e.getAttribute("data-text") || "";
            parsedText = rawText.includes("\n") ? rawText.split("\n") : rawText;
          }
          return {
            id: e.getAttribute("data-id") || generateId(),
            status:
              (e.getAttribute("data-status") as BibleVerseAttrs["status"]) ||
              "input",
            book: e.getAttribute("data-book"),
            bookName: e.getAttribute("data-book-name"),
            chapter: e.getAttribute("data-chapter")
              ? Number(e.getAttribute("data-chapter"))
              : null,
            verse: e.getAttribute("data-verse")
              ? Number(e.getAttribute("data-verse"))
              : null,
            start: e.getAttribute("data-start")
              ? Number(e.getAttribute("data-start"))
              : null,
            end: e.getAttribute("data-end")
              ? Number(e.getAttribute("data-end"))
              : null,
            verses: rawVerses || "",
            text: parsedText,
          } as Partial<BibleVerseAttrs>;
        },
      },
    ];
  },
  renderHTML({ HTMLAttributes }) {
    const attrs = HTMLAttributes as Partial<BibleVerseAttrs> &
      Record<string, unknown>;
    const versesAttr =
      typeof attrs.verses === "string" && attrs.verses.length > 0
        ? String(attrs.verses)
        : Array.isArray(attrs.text)
        ? encodeURIComponent(
            JSON.stringify(
              (attrs.text as string[]).map((t, i) => ({
                verse: Number(attrs.verse ?? 1) + i,
                text: t,
              }))
            )
          )
        : "";
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        "data-bible-verse": "true",
        "data-id": String(attrs.id ?? ""),
        "data-status": String(attrs.status ?? "input"),
        "data-book": String(attrs.book ?? ""),
        "data-book-name": String(attrs.bookName ?? ""),
        "data-chapter": attrs.chapter != null ? String(attrs.chapter) : "",
        "data-verse": attrs.verse != null ? String(attrs.verse) : "",
        "data-start": attrs.start != null ? String(attrs.start) : "",
        "data-end": attrs.end != null ? String(attrs.end) : "",
        // backward-compat: data-text도 함께 유지 (가독 목적)
        "data-text": Array.isArray(attrs.text)
          ? (attrs.text as string[]).join("\n")
          : String(attrs.text ?? ""),
        "data-verses": versesAttr,
      }),
    ];
  },
  addNodeView() {
    return ReactNodeViewRenderer(BibleVerseReactView, {
      stopEvent: () => true,
    });
  },
  addInputRules() {
    return [
      new InputRule({
        find: /@\s$/,
        handler: ({ chain, range }) => {
          // 현재 커서 다음 줄에 빈 문단이 자동으로 생기지 않도록 처리 후 포커스 이동
          chain()
            .deleteRange(range)
            .insertContent({
              type: this.name,
              attrs: { id: generateId(), status: "input" },
            })
            .focus()
            .run();
        },
      }),
    ];
  },
});

export default BibleVerse;
