
"use client";
import * as LucideIcons from 'lucide-react';
import React from 'react';

interface IconRendererProps {
  iconName?: string;
  defaultIcon?: keyof typeof LucideIcons; // Ensures defaultIcon is a valid Lucide icon name
  className?: string;
  ['data-ai-hint']?: string; // Allow data-ai-hint
}

const IconRenderer: React.FC<IconRendererProps> = ({ iconName, defaultIcon = 'Shapes', className, 'data-ai-hint': aiHint }) => {
  // Get the icon component, ensuring it's a valid React component
  let IconComponent: React.ComponentType<{ className?: string; 'data-ai-hint'?: string }> | null = null;
  
  if (iconName && iconName in LucideIcons) {
    const icon = LucideIcons[iconName as keyof typeof LucideIcons];
    if (typeof icon === 'function' || (typeof icon === 'object' && icon !== null && '$$typeof' in icon)) {
      IconComponent = icon as React.ComponentType<{ className?: string; 'data-ai-hint'?: string }>;
    }
  }
  
  if (!IconComponent && defaultIcon in LucideIcons) {
    const icon = LucideIcons[defaultIcon];
    if (typeof icon === 'function' || (typeof icon === 'object' && icon !== null && '$$typeof' in icon)) {
      IconComponent = icon as React.ComponentType<{ className?: string; 'data-ai-hint'?: string }>;
    }
  }

  if (!IconComponent) {
    // Fallback if even defaultIcon is somehow invalid or not found
    return <LucideIcons.HelpCircle className={className} data-ai-hint={aiHint || "unknown icon"} />;
  }
  
  // Pass through data-ai-hint if provided
  const props = aiHint ? { className, 'data-ai-hint': aiHint } : { className };

  return <IconComponent {...props} />;
};

export default IconRenderer;
