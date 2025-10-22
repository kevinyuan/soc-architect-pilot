"use client";

import React, { useEffect, useRef } from 'react';
// Terminal functionality temporarily disabled during refactoring
// import 'xterm/css/xterm.css';
import { useTheme } from 'next-themes';
import { useContainer } from '@/hooks/useContainerContext';
import { useTerminal } from '@/hooks/useTerminalContext';

interface CodeTerminalViewProps {
  webSocketUrl: string | null | undefined;
  currentProjectRoot: string | null;
}

const CHANNEL_NAME = 'code_view';

export function CodeTerminalView({ webSocketUrl, currentProjectRoot }: CodeTerminalViewProps) {
  const { activeContainerId: containerId, currentUser } = useContainer();
  const { getOrCreateTerminal } = useTerminal();
  const terminalRef = useRef<HTMLDivElement>(null);
  const { resolvedTheme } = useTheme();

  useEffect(() => {
    const terminalDiv = terminalRef.current;
    // Defer terminal creation until all required props, including the user, are available.
    if (!terminalDiv || !webSocketUrl || !containerId || !currentUser) {
      return;
    }

    const projectFolder = currentProjectRoot ? currentProjectRoot.split('/').pop() : '';
    const { term, fitAddon } = getOrCreateTerminal(CHANNEL_NAME, {
      webSocketUrl,
      username: currentUser,
      containerId,
      projectFolder: projectFolder || '',
    });

    // Attach the persistent terminal to this component's div
    if (term.element?.parentElement !== terminalDiv) {
        term.open(terminalDiv);
    }
    // Initial fit after a short delay to ensure layout is stable
    setTimeout(() => {
        try {
            fitAddon.fit();
        } catch (e) {
            console.log("Failed to fit addon on initial load", e);
        }
    }, 100);

    // Debounce resize events to avoid flickering and performance issues
    let resizeTimer: ReturnType<typeof setTimeout>;
    const onResize = () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        try {
          fitAddon.fit();
        } catch (e) {
          console.error("Error fitting terminal on resize:", e);
        }
      }, 50);
    };

    const resizeObserver = new ResizeObserver(onResize);
    resizeObserver.observe(terminalDiv);

    return () => {
      // IMPORTANT: Do NOT destroy the terminal here.
      // The TerminalManager is responsible for its lifecycle.
      // We only detach the resize observer.
      resizeObserver.unobserve(terminalDiv);
    };
  }, [webSocketUrl, containerId, currentProjectRoot, getOrCreateTerminal, currentUser]);

  // Effect to update theme on change
  useEffect(() => {
    // Defer theme updates until the user is available.
    if (webSocketUrl && containerId && currentUser) {
      const managedTerminal = getOrCreateTerminal(CHANNEL_NAME, {
        webSocketUrl,
        username: currentUser,
        containerId,
        projectFolder: currentProjectRoot ? currentProjectRoot.split('/').pop() || '' : '',
      });
      const isDark = resolvedTheme === 'dark';
      managedTerminal.term.options.theme = {
        background: isDark ? '#000000' : '#FFFFFF',
        foreground: isDark ? '#FFFFFF' : '#000000',
        cursor: isDark ? '#FFFFFF' : '#000000',
        selectionBackground: isDark ? '#FFFFFF' : '#000000',
        selectionForeground: isDark ? '#000000' : '#FFFFFF',
        selectionInactiveBackground: '#555555'
      };
    }
  }, [resolvedTheme, webSocketUrl, containerId, getOrCreateTerminal, currentUser, currentProjectRoot]);

  // --- Render logic based on state ---
  if (!webSocketUrl) {
    return <div className="h-full flex items-center justify-center">URL not configured.</div>;
  }
  if (!currentProjectRoot) {
    return <div className="h-full flex items-center justify-center">Please open a project.</div>;
  }
  if (!containerId) {
    return <div className="h-full flex items-center justify-center">Waiting for container...</div>;
  }

  return <div ref={terminalRef} className="h-full w-full custom-xterm-container" />;
}