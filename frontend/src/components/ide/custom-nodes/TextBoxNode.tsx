'use client';

import * as React from 'react';
import { type NodeProps, NodeResizeControl } from 'reactflow';
import { cn } from '@/lib/utils';
import { StickyNote } from 'lucide-react';

interface TextBoxNodeData {
  text: string;
}

export function TextBoxNode(props: NodeProps<TextBoxNodeData>) {
  const { data, selected } = props;
  const [isEditing, setIsEditing] = React.useState(false);
  const [text, setText] = React.useState(data.text || 'Double-click to edit');
  
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);

  const handleDoubleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setIsEditing(true);
    setTimeout(() => textareaRef.current?.focus(), 0);
  };

  const handleBlur = () => {
    setIsEditing(false);
    // Update node data
    if (data.text !== text) {
      data.text = text;
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setIsEditing(false);
    }
    // Allow Enter for new lines, don't close on Enter
  };

  // Prevent all mouse events from bubbling to ReactFlow
  const handleMouseDown = (e: React.MouseEvent) => {
    // Only stop propagation if not clicking on resize handle
    if (!(e.target as HTMLElement).closest('.react-flow__resize-control')) {
      e.stopPropagation();
    }
  };

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
  };

  return (
    <>
      {/* Resize control - only show when selected and not editing */}
      {selected && !isEditing && (
        <NodeResizeControl
          className="react-flow__resize-control"
          style={{
            background: 'transparent',
            border: 'none',
          }}
          minWidth={150}
          minHeight={100}
        >
          <div className="absolute bottom-0 right-0 w-6 h-6 cursor-nwse-resize flex items-end justify-end">
            <div className="text-yellow-600 dark:text-yellow-500 opacity-70 hover:opacity-100 transition-opacity">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M14 14L14 9M14 14L9 14M14 14L8 8M14 4L4 14" strokeLinecap="round"/>
              </svg>
            </div>
          </div>
        </NodeResizeControl>
      )}
      
      <div
        className={cn(
          'rounded-lg shadow-md border-2 relative w-full h-full',
          'p-3 flex flex-col',
          'bg-yellow-50 dark:bg-yellow-900/20',
          'border-yellow-300 dark:border-yellow-700',
          selected ? 'ring-2 ring-primary ring-offset-2' : '',
          'hover:shadow-lg transition-shadow',
          isEditing ? 'cursor-text' : 'cursor-pointer'
        )}
        onDoubleClick={handleDoubleClick}
        onClick={handleClick}
        onMouseDown={handleMouseDown}
      >
        {/* Sticky note icon header */}
        <div className="flex items-center gap-2 mb-2 pb-2 border-b border-yellow-300 dark:border-yellow-700">
          <StickyNote className="h-3 w-3 text-yellow-600 dark:text-yellow-500" />
          <span className="text-[0.65rem] font-medium text-yellow-700 dark:text-yellow-400">Note</span>
        </div>

        {/* Text content */}
        <div className="flex-1 overflow-hidden">
          {isEditing ? (
            <textarea
              ref={textareaRef}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onBlur={handleBlur}
              onKeyDown={handleKeyDown}
              className="w-full h-full resize-none bg-transparent border-none outline-none text-[0.75rem] text-yellow-900 dark:text-yellow-100 placeholder:text-yellow-500/50"
              placeholder="Type your note here..."
            />
          ) : (
            <div className="w-full h-full text-[0.75rem] text-yellow-900 dark:text-yellow-100 whitespace-pre-wrap overflow-auto">
              {text}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
