"use client";

import * as React from 'react';
import { UnifiedChatAssistant } from './UnifiedChatAssistant';

export interface ConceptViewHandles {
  toggleLeftPanel: () => void;
}

interface ConceptViewProps {
  currentUser: string | null;
  currentProjectRoot: string | null;
  projectId?: string;
  onProceedToArchitecture?: () => void;
}

const ConceptView = React.forwardRef<ConceptViewHandles, ConceptViewProps>(
  (props, ref) => {
    const [isLeftPanelOpen, setIsLeftPanelOpen] = React.useState(true);

    React.useImperativeHandle(ref, () => ({
      toggleLeftPanel: () => setIsLeftPanelOpen(prev => !prev),
    }));

    return (
      <UnifiedChatAssistant
        layout="fullscreen"
        mode="concept"
        userId={props.currentUser || undefined}
        projectId={props.projectId}
        isVisible={true}
        showHeader={true}
        showExamples={true}
        enableHistory={true}
        enableNewChat={true}
        title="Concept & Requirements"
        subtitle="Chat with AI to define your SoC design requirements and concepts"
        onProceedToArchitecture={props.onProceedToArchitecture}
      />
    );
  }
);

ConceptView.displayName = 'ConceptView';

export default ConceptView;
