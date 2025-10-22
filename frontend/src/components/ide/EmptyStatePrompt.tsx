'use client';

import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AlertCircle, ArrowRight } from 'lucide-react';

interface EmptyStatePromptProps {
  icon?: React.ElementType;
  title: string;
  description: string;
  dependency?: string;
  actionLabel?: string;
  onAction?: () => void;
  actionIcon?: React.ElementType;
}

export function EmptyStatePrompt({
  icon: Icon = AlertCircle,
  title,
  description,
  dependency,
  actionLabel,
  onAction,
  actionIcon: ActionIcon = ArrowRight,
}: EmptyStatePromptProps) {
  return (
    <div className="flex items-center justify-center h-full w-full p-8">
      <Card className="max-w-2xl w-full border-2 border-dashed">
        <CardHeader className="text-center pb-4">
          <div className="flex justify-center mb-4">
            <div className="rounded-full bg-muted p-4">
              <Icon className="h-12 w-12 text-muted-foreground" />
            </div>
          </div>
          <CardTitle className="text-2xl">{title}</CardTitle>
          <CardDescription className="text-base mt-2">{description}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {dependency && (
            <div className="bg-muted/50 rounded-lg p-4">
              <p className="text-sm font-medium mb-1">Dependency:</p>
              <p className="text-sm text-muted-foreground">{dependency}</p>
            </div>
          )}
          {actionLabel && onAction && (
            <div className="flex justify-center pt-2">
              <Button onClick={onAction} size="lg">
                {actionLabel}
                <ActionIcon className="ml-2 h-4 w-4" />
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
