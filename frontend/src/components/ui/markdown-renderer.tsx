import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { cn } from '@/lib/utils';

interface MarkdownRendererProps {
  content: string;
  className?: string;
}

export function MarkdownRenderer({ content, className }: MarkdownRendererProps) {
  return (
    <div className={cn('prose prose-sm dark:prose-invert max-w-none', className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkBreaks]}
        components={{
        // Headings
        h1: ({ node, ...props }) => <h1 className="text-xl font-bold mt-4 mb-2" {...props} />,
        h2: ({ node, ...props }) => <h2 className="text-lg font-bold mt-3 mb-2" {...props} />,
        h3: ({ node, ...props }) => <h3 className="text-base font-bold mt-2 mb-1" {...props} />,
        
        // Paragraphs
        p: ({ node, ...props }) => <p className="mb-2 leading-relaxed" {...props} />,
        
        // Lists (improved spacing and nesting)
        ul: ({ node, ...props }) => <ul className="list-disc ml-4 mb-3 space-y-1.5" {...props} />,
        ol: ({ node, ...props }) => <ol className="list-decimal ml-4 mb-3 space-y-1.5" {...props} />,
        li: ({ node, children, ...props }: any) => {
          // Check if this is a task list item (GFM checkbox)
          const content = String(children);
          if (content.startsWith('[ ] ') || content.startsWith('[x] ') || content.startsWith('[X] ')) {
            const isChecked = content.startsWith('[x] ') || content.startsWith('[X] ');
            const text = content.slice(4);
            return (
              <li className="list-none flex items-start gap-2" {...props}>
                <input
                  type="checkbox"
                  checked={isChecked}
                  disabled
                  className="mt-1"
                />
                <span>{text}</span>
              </li>
            );
          }
          return <li className="leading-relaxed" {...props}>{children}</li>;
        },
        
        // Code with syntax highlighting
        code: ({ node, inline, className, children, ...props }: any) => {
          const match = /language-(\w+)/.exec(className || '');
          const language = match ? match[1] : '';
          const codeString = String(children).replace(/\n$/, '');

          if (inline) {
            return (
              <code
                className="bg-muted px-1.5 py-0.5 rounded text-sm font-mono text-primary"
                {...props}
              >
                {children}
              </code>
            );
          }

          // Use syntax highlighter for code blocks with language
          if (language) {
            return (
              <div className="my-3">
                <SyntaxHighlighter
                  language={language}
                  style={vscDarkPlus}
                  customStyle={{
                    margin: 0,
                    borderRadius: '0.375rem',
                    fontSize: '0.875rem',
                  }}
                  {...props}
                >
                  {codeString}
                </SyntaxHighlighter>
              </div>
            );
          }

          // Plain code block without language
          return (
            <pre className="bg-muted p-3 rounded-md text-sm font-mono overflow-x-auto my-3">
              <code {...props}>{children}</code>
            </pre>
          );
        },
        pre: ({ node, children, ...props }) => {
          // If children is already a code block with syntax highlighting, return as-is
          return <>{children}</>;
        },
        
        // Links
        a: ({ node, ...props }) => (
          <a
            className="text-primary hover:underline"
            target="_blank"
            rel="noopener noreferrer"
            {...props}
          />
        ),
        
        // Blockquotes
        blockquote: ({ node, ...props }) => (
          <blockquote
            className="border-l-4 border-primary pl-4 italic my-2 text-muted-foreground"
            {...props}
          />
        ),
        
        // Tables (enhanced styling)
        table: ({ node, ...props }) => (
          <div className="overflow-x-auto my-4 border border-border rounded-md">
            <table className="min-w-full divide-y divide-border" {...props} />
          </div>
        ),
        thead: ({ node, ...props }) => <thead className="bg-muted/50" {...props} />,
        tbody: ({ node, ...props }) => <tbody className="divide-y divide-border bg-card" {...props} />,
        tr: ({ node, ...props }) => <tr className="hover:bg-muted/30 transition-colors" {...props} />,
        th: ({ node, ...props }) => (
          <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider" {...props} />
        ),
        td: ({ node, ...props }) => <td className="px-4 py-2.5 text-sm" {...props} />,
        
        // Horizontal rule
        hr: ({ node, ...props }) => <hr className="my-4 border-border" {...props} />,
        
        // Strong/Bold
        strong: ({ node, ...props }) => <strong className="font-bold" {...props} />,
        
        // Emphasis/Italic
        em: ({ node, ...props }) => <em className="italic" {...props} />,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
