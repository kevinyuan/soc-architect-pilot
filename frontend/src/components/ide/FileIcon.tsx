
import type { FileSystemNode } from '@/types/ide';
import { File, Folder, FileCode2, FileJson2, FileType, Database, BrainCircuit, TerminalSquare, Cpu, FileTerminal, FileText, Blocks, Rocket } from 'lucide-react'; // Changed LayoutDashboard to Blocks

// A simple SVG for Python as Lucide's Py might not be ideal for all contexts
const PythonIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M13.83 8.67c0-4.48-3.5-8.17-3.5-8.17s-3.5 3.69-3.5 8.17a3.5 3.5 0 0 0 7 0Z M6.5 14.5A3.5 3.5 0 0 0 10 18c2.25 0 3.5-1.95 3.5-1.95S12.25 14.1 10 14.1c-2.72.01-3.5 2.3-3.5 2.3"></path>
    <path d="M10.17 14.67c0 4.48 3.5 8.17 3.5 8.17s3.5-3.69 3.5-8.17a3.5 3.5 0 0 0-7 0Z M17.5 9.5A3.5 3.5 0 0 0 14 6c-2.25 0-3.5 1.95-3.5 1.95S11.75 9.9 14 9.9c2.72-.01 3.5-2.3 3.5-2.3"></path>
  </svg>
);


interface FileIconProps {
  node: FileSystemNode;
  className?: string;
}

export const FileIcon: React.FC<FileIconProps> = ({ node, className = "h-4 w-4" }) => {
  if (node.type === 'folder') {
    return <Folder className={className} />;
  }

  switch (node.language) {
    case 'html':
      return <FileCode2 className={className} data-ai-hint="web design" />;
    case 'css':
      return <FileType className={className} data-ai-hint="stylesheet design" />; 
    case 'javascript':
      return <FileJson2 className={className} data-ai-hint="javascript code" />; 
    case 'python':
      return <PythonIcon />;
    case 'json':
      return <FileJson2 className={className} data-ai-hint="data structure" />;
    case 'c':
      return <FileCode2 className={className} data-ai-hint="c code" />;
    case 'assembly':
      return <Cpu className={className} data-ai-hint="assembly code" />;
    case 'shell':
      return <FileTerminal className={className} data-ai-hint="shell script" />;
    case 'markdown':
      return <FileText className={className} data-ai-hint="markdown document" />;
    case 'canvas':
      return <Blocks className={className} data-ai-hint="canvas blocks" />; // Changed LayoutDashboard to Blocks, updated hint
    case 'emulation':
      return <Rocket className={className} data-ai-hint="emulation launch" />;
    case 'text':
      return <File className={className} data-ai-hint="text document"/>;
    default:
      if (node.name.toLowerCase().includes('assistant')) return <BrainCircuit className={className} data-ai-hint="artificial intelligence"/>;
      if (node.name.toLowerCase().includes('terminal')) return <TerminalSquare className={className} data-ai-hint="command line"/>;
      return <File className={className} data-ai-hint="generic file" />;
  }
};

