
"use client";

import * as React from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MonacoEditor } from "./MonacoEditor";
import type { OpenFile } from '@/types/ide';
import { XIcon, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react'; // Added Loader2
import { FileIcon } from './FileIcon';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';


interface EditorTabsProps {
  openFiles: OpenFile[];
  activeFileId: string | null;
  onFileSelect: (fileId: string) => void;
  onFileClose: (fileId: string) => void;
  onFileContentChange: (fileId: string, newContent: string) => void;
}

const SCROLL_AMOUNT = 150; // Pixels to scroll by

export function EditorTabs({
  openFiles,
  activeFileId,
  onFileSelect,
  onFileClose,
  onFileContentChange,
}: EditorTabsProps) {

  const scrollContainerRef = React.useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = React.useState(false);
  const [canScrollRight, setCanScrollRight] = React.useState(false);

  const handleTabChange = (value: string) => {
    onFileSelect(value);
  };

  const checkScrollability = React.useCallback(() => {
    const container = scrollContainerRef.current;
    if (container) {
      const { scrollLeft, scrollWidth, clientWidth } = container;
      setCanScrollLeft(scrollLeft > 0);
      setCanScrollRight(scrollLeft < scrollWidth - clientWidth -1); 
    }
  }, []);

  React.useEffect(() => {
    const container = scrollContainerRef.current;
    if (container) {
      checkScrollability(); 

      const resizeObserver = new ResizeObserver(() => {
        checkScrollability();
      });
      resizeObserver.observe(container);
      container.addEventListener('scroll', checkScrollability);

      return () => {
        resizeObserver.disconnect();
        if (container) { // Check if container still exists
            container.removeEventListener('scroll', checkScrollability);
        }
      };
    }
  }, [openFiles, checkScrollability]);

  React.useEffect(() => {
    if (activeFileId && scrollContainerRef.current) {
      const activeTabNode = scrollContainerRef.current.querySelector(`[data-state="active"]`) as HTMLElement;
      if (activeTabNode) {
        const container = scrollContainerRef.current;
        const tabRect = activeTabNode.getBoundingClientRect();
        const containerRect = container.getBoundingClientRect();

        if (tabRect.left < containerRect.left) {
          container.scrollLeft -= (containerRect.left - tabRect.left) + 10;
        } else if (tabRect.right > containerRect.right) {
          container.scrollLeft += (tabRect.right - containerRect.right) + 10;
        }
        setTimeout(checkScrollability, 50);
      }
    }
  }, [activeFileId, openFiles, checkScrollability]);


  const handleScroll = (direction: 'left' | 'right') => {
    const container = scrollContainerRef.current;
    if (container) {
      const scrollValue = direction === 'left' ? -SCROLL_AMOUNT : SCROLL_AMOUNT;
      container.scrollBy({ left: scrollValue, behavior: 'smooth' });
    }
  };

  const renderEditorContent = (file: OpenFile) => {
    if (file.isLoading) {
      return (
        <div className="flex flex-col items-center justify-center h-full text-muted-foreground p-4">
          <Loader2 className="h-8 w-8 animate-spin mb-2 text-primary" />
          <p>Loading {file.name}...</p>
        </div>
      );
    }
    if (file.content === undefined) { // Should not happen if not loading, but as a fallback
        return (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground p-4">
                <p>Content not available for {file.name}.</p>
            </div>
        );
    }

    return (
      <MonacoEditor
        filePath={file.path} 
        value={file.content}
        language={file.language}
        onChange={(newContent) => onFileContentChange(file.id, newContent || '')}
        readOnly={file.isReadOnly}
      />
    );
  };
  
  return (
    <Tabs
      value={activeFileId || ''}
      onValueChange={handleTabChange}
      className="flex flex-col h-full w-full"
    >
      {openFiles.length > 0 && (
        <div className="relative shrink-0 bg-card border-b h-10 flex items-center">
          {canScrollLeft && (
            <Button
              variant="ghost"
              size="icon"
              className="absolute left-0 top-1/2 -translate-y-1/2 z-10 h-8 w-8 p-1 bg-card hover:bg-accent/70"
              onClick={() => handleScroll('left')}
              aria-label="Scroll tabs left"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
          )}
          <div
            ref={scrollContainerRef}
            className="flex-grow overflow-x-auto scrollbar-hide h-full"
            style={{ WebkitOverflowScrolling: 'touch' }}
          >
            <TabsList
              className="shrink-0 bg-transparent rounded-none justify-start h-full p-0 m-0"
              style={{ minWidth: 'max-content' }}
            >
              {openFiles.map((file) => (
                <TabsTrigger
                  key={file.id}
                  value={file.id}
                  className="flex items-center justify-between data-[state=active]:bg-background data-[state=active]:shadow-sm data-[state=active]:text-primary data-[state=active]:font-bold h-full rounded-none border-r px-3 py-1 text-sm group"
                >
                  <div className="flex items-center overflow-hidden min-w-0 mr-2">
                    <FileIcon node={file} /> 
                    <span className="truncate">{file.name}</span>
                  </div>
                  <div
                    role="button"
                    tabIndex={0}
                    className="h-6 w-6 p-1 flex items-center justify-center opacity-0 group-hover:opacity-100 data-[state=active]:opacity-100 cursor-pointer rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring hover:bg-accent hover:text-accent-foreground shrink-0"
                    onClick={(e) => {
                      e.stopPropagation();
                      e.preventDefault();
                      onFileClose(file.id);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.stopPropagation();
                        e.preventDefault();
                        onFileClose(file.id);
                      }
                    }}
                    aria-label={`Close ${file.name}`}
                  >
                    <XIcon className="h-4 w-4" />
                  </div>
                </TabsTrigger>
              ))}
            </TabsList>
          </div>
          {canScrollRight && (
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-0 top-1/2 -translate-y-1/2 z-10 h-8 w-8 p-1 bg-card hover:bg-accent/70"
              onClick={() => handleScroll('right')}
              aria-label="Scroll tabs right"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          )}
        </div>
      )}

      {openFiles.map((file) => (
        <TabsContent key={file.id} value={file.id} className="flex-grow h-full overflow-auto mt-0 p-0">
          {renderEditorContent(file)}
        </TabsContent>
      ))}

      {openFiles.length === 0 && (
         <TabsContent value="" className="flex-grow h-full overflow-auto mt-0 p-0">
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
              <p className="text-lg">Welcome to SoC Pilot</p>
              <p>Select a file from the explorer to start editing.</p>
              <p className="text-sm mt-2">Or, choose a view from the Activity Bar.</p>
            </div>
         </TabsContent>
      )}
    </Tabs>
  );
}

