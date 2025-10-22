"use client";

import * as React from 'react';
import { Brain, AlertCircle, CheckCircle2, HelpCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { useArchitectChat } from "@/hooks/useArchitectChat";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

/**
 * AI Status Badge - Displays AI service availability status
 *
 * Status descriptions:
 * - available: AI service is running normally
 * - unavailable: AI service is unavailable (usually AWS Bedrock configuration issue)
 * - unknown: Unknown status (no messages sent yet)
 */
export function AIStatusBadge() {
  const { aiStatus } = useArchitectChat();

  const getStatusConfig = () => {
    switch (aiStatus) {
      case 'available':
        return {
          icon: CheckCircle2,
          text: 'AI Available',
          color: 'text-green-600',
          tooltip: 'AI service is running normally',
        };
      case 'unavailable':
        return {
          icon: AlertCircle,
          text: 'AI Unavailable',
          color: 'text-destructive',
          tooltip: 'AI service is temporarily unavailable\n\nPossible reasons:\n• AWS Bedrock account needs model access approval\n• Backend service configuration issue\n\nPlease contact administrator to check backend logs',
        };
      case 'unknown':
      default:
        return {
          icon: HelpCircle,
          text: 'AI Unknown',
          color: 'text-muted-foreground',
          tooltip: 'AI service status is unknown',
        };
    }
  };

  const config = getStatusConfig();
  const Icon = config.icon;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className={cn(
          "flex items-center gap-1 text-xs cursor-help",
          config.color
        )}>
          <Brain className="h-3 w-3" />
          <Icon className="h-3 w-3" />
          <span>{config.text}</span>
        </div>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-xs whitespace-pre-line">
        <p>{config.tooltip}</p>
      </TooltipContent>
    </Tooltip>
  );
}
