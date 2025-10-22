
"use client";

import * as React from "react";
import { DiffEditor, type Monaco } from "@monaco-editor/react";
import { useTheme } from "next-themes";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogClose,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { Language } from "@/types/ide";

interface AiDiffEditorDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  originalCode: string;
  modifiedCode: string;
  language?: Language;
  fileName?: string;
  onApply: () => void; // Callback when user confirms applying the changes
}

export function AiDiffEditorDialog({
  isOpen,
  onOpenChange,
  originalCode,
  modifiedCode,
  language = "text",
  fileName,
  onApply,
}: AiDiffEditorDialogProps) {
  const { theme: appTheme } = useTheme();
  const [editorTheme, setEditorTheme] = React.useState("vs");
  const [isLoading, setIsLoading] = React.useState(true);

  React.useEffect(() => {
    setEditorTheme(appTheme === "dark" ? "vs-dark" : "vs");
  }, [appTheme]);

  const handleEditorDidMount = (editor: any, monaco: Monaco) => {
    setIsLoading(false);
    // You can access the diff editor instance here if needed: editor.getModifiedEditor() or editor.getOriginalEditor()
    // For example, to ensure layout updates on dialog open/resize, though DiffEditor component handles much of this.
  };

  const handleApplyClick = () => {
    onApply();
    onOpenChange(false); // Close dialog after applying
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl h-[80vh] flex flex-col p-0">
        <DialogHeader className="p-4 border-b">
          <DialogTitle>Review Code Changes {fileName ? `for ${fileName}` : ""}</DialogTitle>
          <DialogDescription>
            The left side shows the original code, and the right side shows AI's suggestions.
          </DialogDescription>
        </DialogHeader>
        <div className="flex-grow overflow-hidden relative p-4 pt-0">
          {isLoading && <Skeleton className="w-full h-full absolute inset-0 z-10" />}
          <DiffEditor
            height="calc(100% - 1rem)" // Adjust height to fit within content padding
            language={language}
            original={originalCode}
            modified={modifiedCode}
            theme={editorTheme}
            onMount={handleEditorDidMount}
            options={{
              readOnly: false, // User might want to copy, but true for pure diff view
              minimap: { enabled: true },
              scrollbar: {
                verticalScrollbarSize: 10,
                horizontalScrollbarSize: 10,
              },
              scrollBeyondLastLine: false,
              automaticLayout: true,
              renderSideBySide: true,
            }}
          />
        </div>
        <DialogFooter className="p-4 border-t">
          <DialogClose asChild>
            <Button variant="outline">Cancel</Button>
          </DialogClose>
          <Button onClick={handleApplyClick}>Apply Changes</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
