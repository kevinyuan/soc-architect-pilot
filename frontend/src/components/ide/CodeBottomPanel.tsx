
"use client";

import * as React from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ProblemsView } from './ProblemsView';
import { CodeTerminalView } from './CodeTerminalView';
import type { AppSettings } from '@/types/ide';

interface CodeBottomPanelProps {
  activeBottomTab: string;
  setActiveBottomTab: (tab: string) => void;
  appSettings: AppSettings | null;
  currentProjectRoot: string | null;
}

export function CodeBottomPanel({ activeBottomTab, setActiveBottomTab, appSettings, currentProjectRoot }: CodeBottomPanelProps) {
  return (
    <div className="h-full border-t bg-card flex flex-col">
      <Tabs value={activeBottomTab} onValueChange={setActiveBottomTab} className="flex flex-col h-full w-full">
        <TabsList className="shrink-0 bg-card border-b rounded-none justify-start px-1 h-10">
          <TabsTrigger value="terminal" className="data-[state=active]:bg-background data-[state=active]:shadow-sm data-[state=active]:text-primary h-full rounded-none border-r px-3 py-1 text-sm">Terminal</TabsTrigger>
          <TabsTrigger value="problems" className="data-[state=active]:bg-background data-[state=active]:shadow-sm data-[state=active]:text-primary h-full rounded-none border-r px-3 py-1 text-sm">Problems</TabsTrigger>
        </TabsList>
        <TabsContent value="terminal" className="mt-0 p-0 flex-grow min-h-0 overflow-hidden">
          <CodeTerminalView
            key={appSettings?.codeViewTerminalWssUrl || 'terminal-view-key-default'}
            webSocketUrl={appSettings?.codeViewTerminalWssUrl}
            currentProjectRoot={currentProjectRoot}
          />
        </TabsContent>
        <TabsContent value="problems" className="mt-0 p-0 flex-grow min-h-0">
          <ProblemsView />
        </TabsContent>
      </Tabs>
    </div>
  );
}

