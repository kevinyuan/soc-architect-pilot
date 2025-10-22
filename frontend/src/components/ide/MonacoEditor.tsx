
"use client";

import Editor, { type OnChange, type OnMount, type Monaco } from "@monaco-editor/react";
import type { Language } from "@/types/ide";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { Skeleton } from "../ui/skeleton";
import { cn } from "@/lib/utils";

interface MonacoEditorProps {
  value: string;
  language: Language;
  onChange?: OnChange;
  filePath?: string; // For associating editor instance with a file path
  readOnly?: boolean;
}

export function MonacoEditor({ value, language, onChange, filePath, readOnly }: MonacoEditorProps) {
  const { theme: appTheme } = useTheme();
  const [editorTheme, setEditorTheme] = useState("vs"); // Default to light theme
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    setEditorTheme(appTheme === "dark" ? "vs-dark" : "vs");
  }, [appTheme]);

  const handleEditorDidMount: OnMount = (editor, monaco) => {
    setIsLoading(false);
    // You can define custom themes or languages here if needed
    // Example: monaco.editor.defineTheme(...)
    // editor.focus();
    if (readOnly !== undefined) {
      editor.updateOptions({ readOnly: readOnly });
    }
  };

  if (isLoading && typeof window === 'undefined') { // Avoid SSR rendering for loader
    return <Skeleton className="w-full h-full" />;
  }

  return (
    <div className={cn(
      "h-full w-full font-code",
      readOnly && "bg-muted" // Apply muted background if readOnly
    )}>
      {isLoading && <Skeleton className="w-full h-full absolute inset-0 z-10" />}
      <Editor
        height="100%"
        path={filePath} // Unique path helps Monaco preserve view state for files
        language={language}
        value={value}
        theme={editorTheme}
        onChange={onChange}
        onMount={handleEditorDidMount}
        options={{
          fontFamily: '"Source Code Pro", monospace',
          fontSize: 14,
          minimap: { enabled: false },
          scrollbar: {
            verticalScrollbarSize: 10,
            horizontalScrollbarSize: 10,
          },
          scrollBeyondLastLine: false,
          automaticLayout: true, // Ensures editor resizes correctly
          wordWrap: "on", // Default word wrap on
          readOnly: readOnly, // Set readOnly option
          folding: true, // Enable code folding
          foldingStrategy: 'indentation', // Use indentation-based folding
          showFoldingControls: 'always', // Always show folding controls
        }}
      />
    </div>
  );
}

