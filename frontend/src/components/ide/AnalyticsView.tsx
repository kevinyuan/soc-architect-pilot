"use client";

import * as React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { AnalyticsPanel } from './AnalyticsPanel';
import { workspaceAPI } from '@/lib/workspace-api';
import { useCopyContextMenu } from '@/hooks/useCopyContextMenu';

const ARCH_DIAGRAM_FILENAME = "arch_diagram.json";

export interface AnalyticsViewHandles {
  toggleLeftPanel: () => void;
  setDiagram?: (diagram: any) => void;
  setComponentLibrary?: (library: any[]) => void;
}

interface AnalyticsViewProps {
  currentUser: string | null;
  currentProjectRoot: string | null;
  projectId?: string;
  getFileContent: (relativePath: string, projectCtx: string | null) => Promise<string | null>;
  diagram?: any;
  componentLibrary?: any[];
}

const AnalyticsView = React.forwardRef<AnalyticsViewHandles, AnalyticsViewProps>(
  (props, ref) => {
    const { currentProjectRoot, projectId, getFileContent } = props;
    const [isLeftPanelOpen, setIsLeftPanelOpen] = React.useState(true);
    const [diagram, setDiagram] = React.useState(props.diagram);
    const [componentLibrary, setComponentLibrary] = React.useState(props.componentLibrary);
    const [isLoading, setIsLoading] = React.useState(false);
    const { handleContextMenu, ContextMenu } = useCopyContextMenu();

    // Load diagram from project files
    React.useEffect(() => {
      const loadDiagram = async () => {
        if (!currentProjectRoot || !projectId || !getFileContent) {
          console.log('[AnalyticsView] Missing project context, skipping diagram load');
          return;
        }

        setIsLoading(true);
        try {
          // First try: Load arch_diagram.json from project root
          console.log('[AnalyticsView] Trying to load arch_diagram.json...');
          const archDiagramContent = await getFileContent(ARCH_DIAGRAM_FILENAME, currentProjectRoot);
          if (archDiagramContent && archDiagramContent.trim()) {
            const parsedDiagram = JSON.parse(archDiagramContent);
            console.log('[AnalyticsView] ✅ Loaded arch_diagram.json');
            setDiagram(parsedDiagram);
            return;
          }
        } catch (err) {
          console.log('[AnalyticsView] arch_diagram.json not found, trying backend API...');
        }

        // Second try: Load from backend diagram API
        try {
          const diagramData = await workspaceAPI.loadDiagram(projectId, 'main');
          console.log('[AnalyticsView] ✅ Loaded diagram from backend API');
          setDiagram(diagramData);
        } catch (err) {
          console.log('[AnalyticsView] No diagram found');
          setDiagram(null);
        } finally {
          setIsLoading(false);
        }
      };

      loadDiagram();
    }, [currentProjectRoot, projectId, getFileContent]);

    React.useEffect(() => {
      setDiagram(props.diagram);
    }, [props.diagram]);

    React.useEffect(() => {
      setComponentLibrary(props.componentLibrary);
    }, [props.componentLibrary]);

    React.useImperativeHandle(ref, () => ({
      toggleLeftPanel: () => setIsLeftPanelOpen(prev => !prev),
      setDiagram: (newDiagram: any) => setDiagram(newDiagram),
      setComponentLibrary: (library: any[]) => setComponentLibrary(library),
    }));

    // Show empty state if no diagram is available
    if (!isLoading && (!diagram || !diagram.nodes || diagram.nodes.length === 0)) {
      const { EmptyStatePrompt } = require('./EmptyStatePrompt');
      const { BarChart3 } = require('lucide-react');
      
      return (
        <div className="flex flex-col h-full w-full bg-background">
          <EmptyStatePrompt
            icon={BarChart3}
            title="No Architecture Data Available"
            description="Analytics requires an architecture diagram to analyze system performance, data flows, and potential bottlenecks."
            dependency="This view depends on the Architecture View. You need to create or load an architecture diagram first."
            actionLabel="Go to Architecture View"
            onAction={() => {
              // Navigate to architect view
              if (typeof window !== 'undefined') {
                window.dispatchEvent(new CustomEvent('navigate-to-view', { detail: { view: 'architect' } }));
              }
            }}
          />
        </div>
      );
    }

    return (
      <div className="flex flex-col h-full w-full bg-background" onContextMenu={handleContextMenu}>
        <AnalyticsPanel
          diagram={diagram}
          componentLibrary={componentLibrary}
          projectId={projectId}
        />
        {ContextMenu}
      </div>
    );
  }
);

AnalyticsView.displayName = 'AnalyticsView';

export default AnalyticsView;
