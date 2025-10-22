"use client";

import * as React from 'react';
import Editor from '@monaco-editor/react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Save, X, RotateCcw, AlertCircle } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface JsonEditorDialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  content: string;
  onSave: (newContent: string) => Promise<void>;
  readOnly?: boolean;
}

export function JsonEditorDialog({
  open,
  onClose,
  title,
  description,
  content,
  onSave,
  readOnly = false
}: JsonEditorDialogProps) {
  const [editorContent, setEditorContent] = React.useState(content);
  const [saving, setSaving] = React.useState(false);
  const [hasChanges, setHasChanges] = React.useState(false);
  const [validationError, setValidationError] = React.useState<string | null>(null);
  const { toast } = useToast();
  const editorRef = React.useRef<any>(null);

  // Update editor content when prop changes
  React.useEffect(() => {
    setEditorContent(content);
    setHasChanges(false);
    setValidationError(null);
  }, [content]);

  const handleEditorDidMount = (editor: any) => {
    editorRef.current = editor;
  };

  const handleEditorChange = (value: string | undefined) => {
    if (value === undefined) return;

    setEditorContent(value);
    setHasChanges(value !== content);

    // Validate JSON
    try {
      JSON.parse(value);
      setValidationError(null);
    } catch (error) {
      setValidationError((error as Error).message);
    }
  };

  const handleSave = async () => {
    if (validationError) {
      toast({
        title: 'Invalid JSON',
        description: 'Please fix JSON errors before saving',
        variant: 'destructive'
      });
      return;
    }

    try {
      setSaving(true);
      await onSave(editorContent);
      setHasChanges(false);
      toast({
        title: 'Success',
        description: 'File saved successfully'
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: (error as Error).message || 'Failed to save file',
        variant: 'destructive'
      });
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    setEditorContent(content);
    setHasChanges(false);
    setValidationError(null);
  };

  const handleClose = () => {
    if (hasChanges) {
      if (confirm('You have unsaved changes. Are you sure you want to close?')) {
        onClose();
      }
    } else {
      onClose();
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-6xl h-[90vh] flex flex-col p-0">
        <DialogHeader className="px-6 pt-6 pb-4 border-b">
          <DialogTitle className="flex items-center gap-2">
            {title}
            {hasChanges && (
              <span className="text-xs text-orange-500">• Modified</span>
            )}
          </DialogTitle>
          {description && (
            <DialogDescription>{description}</DialogDescription>
          )}
        </DialogHeader>

        {validationError && (
          <div className="px-6">
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription className="text-xs font-mono">
                {validationError}
              </AlertDescription>
            </Alert>
          </div>
        )}

        <div className="flex-1 px-6 pb-4 overflow-hidden">
          <Editor
            height="100%"
            defaultLanguage="json"
            value={editorContent}
            onChange={handleEditorChange}
            onMount={handleEditorDidMount}
            theme="vs-dark"
            options={{
              readOnly: readOnly,
              minimap: { enabled: true },
              scrollBeyondLastLine: false,
              fontSize: 13,
              tabSize: 2,
              wordWrap: 'on',
              formatOnPaste: true,
              formatOnType: true,
              autoClosingBrackets: 'always',
              autoClosingQuotes: 'always',
              bracketPairColorization: {
                enabled: true
              }
            }}
          />
        </div>

        <DialogFooter className="px-6 pb-6 pt-4 border-t flex items-center justify-between">
          <div className="flex gap-2">
            {hasChanges && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleReset}
                disabled={saving}
              >
                <RotateCcw className="h-4 w-4 mr-2" />
                Reset
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={handleClose}
              disabled={saving}
            >
              <X className="h-4 w-4 mr-2" />
              Close
            </Button>
            {!readOnly && (
              <Button
                onClick={handleSave}
                disabled={saving || !hasChanges || !!validationError}
              >
                <Save className="h-4 w-4 mr-2" />
                {saving ? 'Saving...' : 'Save'}
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
