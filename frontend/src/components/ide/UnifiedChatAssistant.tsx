"use client";

import * as React from 'react';
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Bot,
  User,
  Send,
  Lightbulb,
  AlertCircle,
  Sparkles,
  CheckCircle,
  CheckCircle2,
  List,
  Radio as RadioIcon,
  Type,
  Plus,
  History,
  Loader2,
  MessageSquare,
  ArrowRight,
} from "lucide-react";
import { ScrollArea } from '@/components/ui/scroll-area';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { useConceptChat, useArchitectChat, useCodeChat, type ChatMode, type ChatUIMessage } from '@/hooks/useChatContext';
import { ComponentSuggestionCard } from './ComponentSuggestionCard';
import type { ComponentSuggestion } from '@/lib/chat-api';
import { MarkdownRenderer } from '@/components/ui/markdown-renderer';
import { GenerationTimeline } from './GenerationTimeline';
import { ConfirmedFeaturesWidget } from './ConfirmedFeaturesWidget';
import { useAuth } from '@/contexts/AuthContext';

export interface UnifiedChatAssistantProps {
  // Layout control
  layout: 'fullscreen' | 'sidebar';

  // Mode control - REQUIRED, determines which context hook to use
  mode: ChatMode;

  // Context
  userId?: string;  // User ID for S3 storage
  projectId?: string;
  isVisible?: boolean;
  selectedNode?: any; // Selected node on canvas (architect mode only)

  // Feature flags
  showHeader?: boolean;
  showExamples?: boolean;
  enableHistory?: boolean;
  enableNewChat?: boolean;

  // Title override
  title?: string;
  subtitle?: string;

  // Callbacks
  onProceedToArchitecture?: () => void;
}

export function UnifiedChatAssistant({
  layout,
  mode,
  userId,
  projectId,
  isVisible = true,
  selectedNode,
  showHeader = true,
  showExamples = true,
  enableHistory = true,
  enableNewChat = true,
  title,
  subtitle,
  onProceedToArchitecture,
}: UnifiedChatAssistantProps) {
  // Get current user from auth context
  const { user } = useAuth();

  // Use the appropriate hook based on mode
  const useChat = mode === 'concept' ? useConceptChat : mode === 'architect' ? useArchitectChat : useCodeChat;

  const {
    sessionId,
    chatMessages,
    currentPhase,
    currentArchitecture,
    currentProjectId,
    hasExistingArchitecture,
    confirmedSelections,
    isLoading,
    error,
    initializeSession,
    sendMessage,
    acceptComponent,
    rejectComponent,
    loadSession,
    listSessions,
    newChat,
    generateArchitecture,
    updateChatMessage,
    addChatMessage,
    completeGeneration,
    setSelectedNode,
  } = useChat();

  const { toast } = useToast();
  const [userInput, setUserInput] = React.useState("");
  const [customInput, setCustomInput] = React.useState<string>('');
  const [showHistoryDialog, setShowHistoryDialog] = React.useState(false);
  const [historySessions, setHistorySessions] = React.useState<any[]>([]);
  const [showGenerateConfirmDialog, setShowGenerateConfirmDialog] = React.useState(false);

  const messagesEndRef = React.useRef<HTMLDivElement>(null);
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);
  const pendingMessageSentRef = React.useRef<boolean>(false);

  // Set selected node when prop changes (architect mode only)
  React.useEffect(() => {
    if (selectedNode !== undefined) {
      setSelectedNode(selectedNode);
    }
  }, [selectedNode, setSelectedNode]);

  // Initialize session when component mounts or projectId changes
  const initializationInProgressRef = React.useRef(false);
  
  React.useEffect(() => {
    if (isVisible && projectId) {
      const projectChanged = currentProjectId && currentProjectId !== projectId;

      // Re-initialize if:
      // 1. No session exists yet (!sessionId) AND no cached session in localStorage
      // 2. Project has changed (projectChanged)

      // Check localStorage for existing session to avoid duplicate initialization
      const cachedSessionId = typeof window !== 'undefined'
        ? localStorage.getItem(`soc-pilot:chat:${mode}:sessionId`)
        : null;

      const shouldInitialize = (!sessionId && !cachedSessionId) || projectChanged;

      // Debug logging to trace session recreation issue
      console.log(`[${mode}] 🔍 Init effect triggered:`, {
        isVisible,
        projectId,
        currentProjectId,
        sessionId,
        cachedSessionId,
        projectChanged,
        shouldInitialize,
        initializationInProgress: initializationInProgressRef.current,
        reason: !sessionId && !cachedSessionId ? 'no session' : projectChanged ? 'project changed' : 'no init needed'
      });

      if (shouldInitialize && !initializationInProgressRef.current) {
        // Use userId prop if provided, otherwise use user.id from auth context
        const effectiveUserId = userId || user?.id;

        if (!effectiveUserId) {
          console.warn(`[${mode}] Cannot initialize session: no userId available (prop: ${userId}, auth: ${user?.id})`);
          return;
        }

        console.log(`[${mode}] ⚡ Initializing session: projectId=${projectId}, userId=${effectiveUserId}, reason=${!sessionId && !cachedSessionId ? 'no session' : 'project changed'}`);
        initializationInProgressRef.current = true;
        
        initializeSession(projectId, undefined, effectiveUserId).finally(() => {
          initializationInProgressRef.current = false;
        });
      } else if (initializationInProgressRef.current) {
        console.log(`[${mode}] ⏸️  Initialization already in progress, skipping duplicate call`);
      } else if (!sessionId && cachedSessionId) {
        console.log(`[${mode}] ⏳ Session exists in localStorage (${cachedSessionId}), waiting for context to load...`);
      } else {
        console.log(`[${mode}] ✅ No initialization needed, session already active: ${sessionId}`);
      }
    }
  }, [isVisible, sessionId, currentProjectId, projectId, userId, user?.id, mode, initializeSession]);

  // Send pending message when session is ready
  React.useEffect(() => {
    if (mode === 'concept' && sessionId && !pendingMessageSentRef.current && !isLoading) {
      const storedPendingMsg = typeof window !== 'undefined'
        ? localStorage.getItem('soc-pilot:pendingMessage')
        : null;

      if (storedPendingMsg) {
        console.log(`[${mode}] 📨 Sending pending message: "${storedPendingMsg}"`);
        localStorage.removeItem('soc-pilot:pendingMessage');
        pendingMessageSentRef.current = true;

        // Wait a bit then send
        setTimeout(() => {
          sendMessage(storedPendingMsg).catch(err => {
            console.error(`[${mode}] ❌ Failed to send pending message:`, err);
            pendingMessageSentRef.current = false;
          });
        }, 500);
      }
    }
  }, [mode, sessionId, isLoading, sendMessage]);

  // Auto-scroll to latest message
  React.useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  // Auto-resize textarea
  React.useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [userInput]);

  const handleSendMessage = async (message?: string) => {
    const messageToSend = message || userInput.trim();
    if (messageToSend === "" || isLoading) return;

    setUserInput("");
    await sendMessage(messageToSend);
  };

  const handleQuickReply = async (reply: string) => {
    // Handle special quick replies
    if (reply === 'Open Architect Diagram' && onProceedToArchitecture) {
      onProceedToArchitecture();
      return;
    }

    if (reply === 'Start New Chat') {
      handleNewChat();
      return;
    }

    // Handle generation confirmation quick replies
    if (reply === 'Confirm Generation' || reply === 'Confirm Update') {
      await handleGenerateArchitecture();
      return;
    }

    // For other replies, send as message
    await handleSendMessage(reply);
  };

  const handleCheckboxToggle = (messageId: string, option: string) => {
    const message = chatMessages.find(m => m.id === messageId);
    if (!message) return;

    const currentSelections = message.userSelections?.checkboxes || [];
    const newSelections = currentSelections.includes(option)
      ? currentSelections.filter(item => item !== option)
      : [...currentSelections, option];

    updateChatMessage(messageId, {
      userSelections: {
        ...message.userSelections,
        checkboxes: newSelections,
      },
    });
  };

  const handleCheckboxSubmit = async (messageId: string) => {
    const message = chatMessages.find(m => m.id === messageId);
    if (!message) return;

    const selectedCheckboxes = message.userSelections?.checkboxes || [];
    const selected = selectedCheckboxes.join(', ');
    if (selected) {
      await handleSendMessage(selected);
      // Clear selections after submission
      updateChatMessage(messageId, {
        userSelections: {
          ...message.userSelections,
          checkboxes: [],
        },
      });
    }
  };

  const handleRadioSelect = async (messageId: string, option: string) => {
    const message = chatMessages.find(m => m.id === messageId);
    if (!message) return;

    // Save selection before sending
    updateChatMessage(messageId, {
      userSelections: {
        ...message.userSelections,
        radio: option,
      },
    });

    await handleSendMessage(option);
  };

  const handleCustomInputSubmit = async () => {
    if (customInput.trim()) {
      await handleSendMessage(customInput.trim());
      setCustomInput('');
    }
  };

  const handleNewChat = async () => {
    try {
      // newChat() will use currentUserId from context state, which was set during initializeSession
      newChat();
      toast({
        title: "New Chat",
        description: "Creating a new conversation session..."
      });
    } catch (error) {
      console.error('Failed to create new chat:', error);
      toast({
        title: "Error",
        description: "Failed to create new chat",
        variant: "destructive"
      });
    }
  };

  const handleGenerateArchitecture = async () => {
    // Prevent duplicate calls if already generating
    if (isLoading) {
      console.warn('[UnifiedChatAssistant] Generation already in progress, ignoring duplicate call');
      return;
    }

    // If in concept mode and existing architecture files, show confirmation dialog first
    if (mode === 'concept' && hasExistingArchitecture) {
      setShowGenerateConfirmDialog(true);
      return;
    }

    // Otherwise, generate directly
    await performGeneration();
  };

  const performGeneration = async () => {
    // Prevent duplicate calls if already generating
    if (isLoading) {
      console.warn('[UnifiedChatAssistant] Generation already in progress in performGeneration, ignoring duplicate call');
      return;
    }

    // Close dialog immediately to prevent multiple clicks
    setShowGenerateConfirmDialog(false);

    try {
      // The generateArchitecture function from context already has duplicate call protection
      await generateArchitecture();
      const actionText = mode === 'concept' && hasExistingArchitecture ? 'Updated' : 'Generated';
      toast({
        title: `Architecture ${actionText}`,
        description: `Files saved successfully. You can now adjust the architecture in Architect View either manually or through AI chat.`
      });
    } catch (error) {
      // Check if error is due to concurrent generation (409 Conflict)
      // If so, silently ignore - the original request is still in progress
      const apiError = error as any;
      const isConflictError = 
        (error instanceof Error && error.name === 'APIClientError') &&
        (apiError.type === 'CONFLICT_ERROR' || 
         apiError.code === 'GENERATION_IN_PROGRESS' ||
         apiError.statusCode === 409);
      
      if (isConflictError) {
        console.warn('[UnifiedChatAssistant] Duplicate generation request detected - original request still in progress');
        return;
      }
      
      // For other errors, log and show toast
      console.error('Failed to generate architecture:', error);
      toast({
        title: "Generation Failed",
        description: error instanceof Error ? error.message : "Failed to generate architecture",
        variant: "destructive"
      });
    }
  };

  const handleShowHistory = async () => {
    if (!projectId) {
      toast({
        title: "No Project",
        description: "Please open or create a project first",
        variant: "destructive"
      });
      return;
    }

    try {
      const sessions = await listSessions(projectId);
      setHistorySessions(sessions);
      setShowHistoryDialog(true);
    } catch (error) {
      console.error('Failed to load history:', error);
      toast({
        title: "Load Failed",
        description: "Failed to load chat history",
        variant: "destructive"
      });
    }
  };

  const handleLoadHistorySession = async (sessionToLoad: any) => {
    try {
      await loadSession(sessionToLoad.sessionId);
      setShowHistoryDialog(false);

      toast({
        title: "Session Loaded",
        description: `Loaded session with ${sessionToLoad.messageCount || 0} messages`
      });
    } catch (error) {
      console.error('Failed to load session:', error);
      toast({
        title: "Load Failed",
        description: "Failed to load session",
        variant: "destructive"
      });
    }
  };

  // Helper function to get phase display info
  const getPhaseInfo = (phase: typeof currentPhase) => {
    switch (phase) {
      case 'gathering':
        return { label: 'Gathering', color: 'bg-blue-500' };
      case 'refining':
        return { label: 'Refining', color: 'bg-purple-500' };
      case 'confirming':
        return { label: 'Confirming', color: 'bg-green-500' };
      case 'generating':
        return { label: 'Generating...', color: 'bg-orange-500' };
      case 'completed':
        return { label: 'Completed', color: 'bg-green-600' };
      default:
        return { label: 'In Progress', color: 'bg-gray-500' };
    }
  };

  if (!isVisible) {
    return null;
  }

  const phaseInfo = getPhaseInfo(currentPhase);
  const canProceed = currentArchitecture && (currentPhase === 'confirming' || currentPhase === 'completed');
  const isFullscreen = layout === 'fullscreen';

  // Fullscreen layout (for ConceptView)
  if (isFullscreen) {
    return (
      <>
        {/* Floating confirmed features widget - only show in concept mode */}
        {mode === 'concept' && <ConfirmedFeaturesWidget confirmedSelections={confirmedSelections || undefined} />}

        <div className="flex flex-col h-full w-full bg-background overflow-x-auto">
          {/* Header */}
          {showHeader && (
            <div className="border-b bg-card px-6 py-4 min-w-[50vw]">
              <div className="flex items-center justify-between">
                <div>
                  <h1 className="text-2xl font-bold tracking-tight flex items-center">
                    <Lightbulb className="mr-3 h-6 w-6 text-primary" />
                    {title || "Concept & Requirements"}
                  </h1>
                  <p className="text-sm text-muted-foreground mt-1">
                    {subtitle || "Chat with AI to define your SoC design requirements and concepts"}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <Badge variant="outline" className="flex items-center gap-2">
                    <div className={`h-2 w-2 rounded-full ${phaseInfo.color}`} />
                    {phaseInfo.label}
                  </Badge>
                  {enableNewChat && (
                    <Button
                      onClick={handleNewChat}
                      size="sm"
                      variant="outline"
                      className="h-8 px-3 gap-1.5"
                      title="Create new conversation"
                    >
                      <Plus className="h-4 w-4" />
                      <span className="text-xs">New Chat</span>
                    </Button>
                  )}
                  {enableHistory && (
                    <Button
                      onClick={handleShowHistory}
                      size="sm"
                      variant="outline"
                      className="h-8 px-3 gap-1.5"
                      title="View chat history"
                    >
                      <History className="h-4 w-4" />
                      <span className="text-xs">History</span>
                    </Button>
                  )}
                  {canProceed && (
                    <>
                      <Button
                        onClick={handleGenerateArchitecture}
                        size="sm"
                        disabled={isLoading}
                      >
                        <CheckCircle className="h-4 w-4 mr-2" />
                        {mode === 'concept'
                          ? (hasExistingArchitecture ? 'Confirm Update' : 'Confirm Generation')
                          : 'Generate Architecture'}
                      </Button>
                      {onProceedToArchitecture && (
                        <Button
                          onClick={onProceedToArchitecture}
                          size="sm"
                          variant="outline"
                        >
                          <ArrowRight className="h-4 w-4 mr-2" />
                          View Architecture
                        </Button>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Main Chat Area */}
          <div className="flex-1 flex flex-col min-h-0 min-w-[50vw]">
            {/* Messages */}
            <ScrollArea className="flex-1 px-6 py-4">
              <div className="max-w-4xl mx-auto space-y-4 min-w-[calc(50vw-3rem)]">
                {chatMessages.length === 0 && showExamples && (
                  <Card className="border-dashed">
                    <CardContent className="pt-6 pb-6">
                      <div className="text-center space-y-3">
                        <Sparkles className="h-12 w-12 mx-auto text-primary/50" />
                        <p className="text-muted-foreground">
                          Start chatting with AI to describe your SoC design requirements...
                        </p>
                        <div className="flex flex-wrap justify-center gap-2 mt-4">
                          <Badge
                            variant="secondary"
                            className="cursor-pointer"
                            onClick={() => setUserInput('I want to design a simple microcontroller system')}
                          >
                            <MessageSquare className="h-3 w-3 mr-1" />
                            Example: Microcontroller
                          </Badge>
                          <Badge
                            variant="secondary"
                            className="cursor-pointer"
                            onClick={() => setUserInput('Need an ARM processor system with DMA and multiple peripherals')}
                          >
                            <MessageSquare className="h-3 w-3 mr-1" />
                            Example: ARM + DMA System
                          </Badge>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {chatMessages.map((msg, index) => (
                  <div
                    key={msg.id}
                    className={`flex items-start gap-3 ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    {/* AI Icon (left side) */}
                    {msg.sender === 'ai' && (
                      <div className="flex-shrink-0 mt-1">
                        <Sparkles className="h-6 w-6 text-primary" />
                      </div>
                    )}

                    {/* Progress messages should be full width, regular messages max 80% */}
                    <div className={msg.isGenerationProgress ? 'w-full' : `max-w-[80%] ${msg.sender === 'user' ? 'ml-auto' : 'mr-auto'}`}>
                      {/* Render generation timeline for progress messages */}
                      {msg.isGenerationProgress ? (
                        <GenerationTimeline
                          sessionId={sessionId}
                          isGenerating={isLoading}
                          savedProgressData={msg.progressData}
                          onComplete={(finalProgressData) => {
                            console.log('[Chat] Generation completed, saving progress data:', finalProgressData);
                            // Update the progress message with final progress data
                            updateChatMessage(msg.id, { progressData: finalProgressData });
                            
                            // Clear loading state
                            completeGeneration();
                            
                            // Add success message with file information
                            const details = finalProgressData.details || {};
                            const successMessage: ChatUIMessage = {
                              id: `system-${Date.now()}-success`,
                              sender: 'ai',
                              content: `✅ Architecture generation completed!\n\n**Files Generated:**\n- arch_spec.md (Architecture Specification)\n- arch_diagram.json (Visual Architecture Diagram)\n\n**Summary:**\n- Components: ${details.components || 0}\n- Connections: ${details.connections || 0}\n\n${details.savedToS3 ? '✅ Files saved to S3' : '⚠️ Files not saved to S3'}\n\nWhat would you like to do next?`,
                              timestamp: new Date(),
                              quickReplies: ['Open Architect Diagram', 'Start New Chat', 'Refine Architecture'],
                            };
                            addChatMessage(successMessage);
                          }}
                        />
                      ) : (
                        <Card className={msg.sender === 'user' ? 'bg-primary text-primary-foreground' : ''}>
                          <CardContent className="pt-4 pb-3 px-4">
                            {msg.isThinking ? (
                              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                <Loader2 className="h-4 w-4 animate-spin" />
                                <span className="italic">{msg.content}</span>
                              </div>
                            ) : msg.sender === 'ai' ? (
                              <MarkdownRenderer content={msg.content} className="text-sm" />
                            ) : (
                              <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                            )}
                            {!msg.isThinking && (
                              <p className="text-xs opacity-70 mt-2">
                                {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </p>
                            )}
                          </CardContent>
                        </Card>
                      )}

                      {/* Component suggestions - DISABLED: Not relevant to response messages
                      {msg.suggestedComponents && msg.suggestedComponents.length > 0 && (
                        <div className="mt-3 space-y-2">
                          {msg.suggestedComponents.map((suggestion, idx) => (
                            <ComponentSuggestionCard
                              key={idx}
                              suggestion={suggestion}
                              sessionId={sessionId || undefined}
                              onAccept={acceptComponent}
                              onReject={rejectComponent}
                            />
                          ))}
                        </div>
                      )}
                      */}

                      {/* Architecture preview */}
                      {msg.architecturePreview && (
                        <Card className="mt-3 border-primary/50">
                          <CardContent className="pt-4 pb-3">
                            <div className="flex items-center gap-2 mb-2">
                              <CheckCircle2 className="h-4 w-4 text-green-500" />
                              <span className="text-sm font-medium">Architecture Preview</span>
                            </div>
                            <div className="text-xs text-muted-foreground space-y-1">
                              <p>Components: {msg.architecturePreview.selectedComponents?.length || 0}</p>
                            </div>
                          </CardContent>
                        </Card>
                      )}

                      {/* Go to Architecture View button - shown when phase is completed and this is the last message */}
                      {currentPhase === 'completed' && 
                       index === chatMessages.length - 1 &&
                       onProceedToArchitecture && (
                        <div className="mt-3">
                          <Button 
                            onClick={onProceedToArchitecture}
                            className="w-full"
                            size="sm"
                          >
                            <ArrowRight className="h-4 w-4 mr-2" />
                            Go to Architecture View
                          </Button>
                        </div>
                      )}

                      {/* Quick replies */}
                      {msg.quickReplies && msg.quickReplies.length > 0 && (
                        <div className="mt-3 flex flex-wrap gap-2">
                          {msg.quickReplies.map((reply, idx) => (
                            <Button
                              key={idx}
                              onClick={() => handleQuickReply(reply)}
                              disabled={isLoading}
                              size="sm"
                              variant="outline"
                              className="text-xs"
                            >
                              {reply}
                            </Button>
                          ))}
                        </div>
                      )}

                      {/* Checkbox options */}
                      {msg.checkboxOptions && msg.checkboxOptions.length > 0 && (
                        <div className="mt-3 space-y-2">
                          {msg.checkboxOptions.map((option, idx) => {
                            const isChecked = msg.userSelections?.checkboxes?.includes(option) || false;
                            return (
                              <div key={idx} className="flex items-center space-x-2">
                                <Checkbox
                                  id={`checkbox-${msg.id}-${idx}`}
                                  checked={isChecked}
                                  onCheckedChange={() => handleCheckboxToggle(msg.id, option)}
                                  disabled={isLoading}
                                />
                                <label
                                  htmlFor={`checkbox-${msg.id}-${idx}`}
                                  className="text-sm cursor-pointer"
                                >
                                  {option}
                                </label>
                              </div>
                            );
                          })}
                          <div className="flex gap-2">
                            <Button
                              onClick={() => handleCheckboxSubmit(msg.id)}
                              disabled={isLoading || (msg.userSelections?.checkboxes?.length || 0) === 0}
                              size="sm"
                            >
                              Confirm Selection ({msg.userSelections?.checkboxes?.length || 0})
                            </Button>
                            <Button
                              onClick={() => handleSendMessage("No other features required")}
                              disabled={isLoading}
                              size="sm"
                              variant="outline"
                            >
                              No Other Features
                            </Button>
                          </div>
                        </div>
                      )}

                      {/* Radio options */}
                      {msg.radioOptions && msg.radioOptions.length > 0 && (
                        <div className="mt-3 space-y-2">
                          {msg.radioOptions.map((option, idx) => {
                            const isSelected = msg.userSelections?.radio === option;
                            return (
                              <Button
                                key={idx}
                                onClick={() => handleRadioSelect(msg.id, option)}
                                disabled={isLoading}
                                size="sm"
                                variant={isSelected ? "default" : "outline"}
                                className="w-full justify-start"
                              >
                                {option}
                              </Button>
                            );
                          })}
                        </div>
                      )}

                      {/* Custom input */}
                      {msg.inputPrompt && (
                        <div className="mt-3 flex gap-2">
                          <Input
                            value={customInput}
                            onChange={(e) => setCustomInput(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                handleCustomInputSubmit();
                              }
                            }}
                            placeholder={msg.inputPrompt}
                            disabled={isLoading}
                          />
                          <Button
                            onClick={handleCustomInputSubmit}
                            disabled={isLoading || !customInput.trim()}
                            size="sm"
                          >
                            Submit
                          </Button>
                        </div>
                      )}
                    </div>

                    {/* User Icon (right side) */}
                    {msg.sender === 'user' && (
                      <div className="flex-shrink-0 mt-1">
                        <User className="h-6 w-6 text-primary" />
                      </div>
                    )}
                  </div>
                ))}

                {/* Loading fallback when no sessionId available */}
                {isLoading && !sessionId && (
                  <div className="flex justify-start">
                    <Card className="max-w-[80%]">
                      <CardContent className="pt-4 pb-3 px-4">
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          AI is thinking...
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                )}

                <div ref={messagesEndRef} />
              </div>
            </ScrollArea>

            {/* Input Area */}
            <div className="border-t bg-card px-6 py-4 min-w-[50vw]">
              <div className="max-w-4xl mx-auto min-w-[calc(50vw-3rem)]">
                {error && (
                  <div className="mb-3 p-2 bg-destructive/10 text-destructive text-sm rounded-md">
                    {error}
                  </div>
                )}
                <div className="relative">
                  <Textarea
                    ref={textareaRef}
                    value={userInput}
                    onChange={(e) => setUserInput(e.target.value)}
                    onKeyDown={(e) => {
                      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                        e.preventDefault();
                        if (userInput.trim() && !isLoading) {
                          handleSendMessage();
                        }
                      }
                    }}
                    placeholder="Describe your requirements, e.g.: I need a simple microcontroller system with CPU, memory, and peripheral bus..."
                    className="min-h-[80px] max-h-[120px] resize-none pr-24 pb-10"
                    disabled={isLoading}
                  />
                  <div className="absolute bottom-2 right-2 flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">
                      {navigator.platform.includes('Mac') ? '⌘' : 'Ctrl'}+Enter
                    </span>
                    <Button
                      onClick={() => handleSendMessage()}
                      disabled={!userInput.trim() || isLoading}
                      size="icon"
                      className="h-8 w-8"
                    >
                      {isLoading ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Send className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* History Dialog */}
        <Dialog open={showHistoryDialog} onOpenChange={setShowHistoryDialog}>
          <DialogContent className="max-w-2xl max-h-[80vh]">
            <DialogHeader>
              <DialogTitle>Chat History</DialogTitle>
              <DialogDescription>
                Select a previous session to continue the conversation
              </DialogDescription>
            </DialogHeader>
            <ScrollArea className="h-[500px] pr-4">
              {historySessions.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <History className="h-12 w-12 mx-auto mb-3 opacity-50" />
                  <p>No chat history for this project</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {historySessions.map((session) => (
                    <div
                      key={session.sessionId}
                      className="p-3 border rounded-lg hover:bg-accent cursor-pointer transition-colors"
                      onClick={() => handleLoadHistorySession(session)}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <Badge variant={session.phase === 'generating' ? 'default' : 'secondary'} className="text-xs">
                              {session.phase}
                            </Badge>
                            <span className="text-xs text-muted-foreground">
                              {session.messageCount || 0} messages
                            </span>
                          </div>
                          <p className="text-sm font-medium">
                            Session {session.sessionId.substring(0, 8)}...
                          </p>
                          <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
                            <span>Created: {new Date(session.startTime).toLocaleString()}</span>
                            <span>•</span>
                            <span>Last activity: {new Date(session.lastActivity).toLocaleString()}</span>
                          </div>
                        </div>
                        {session.hasArchitecture && (
                          <CheckCircle className="h-5 w-5 text-green-500 flex-shrink-0" />
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </DialogContent>
        </Dialog>

        {/* Generate/Update Confirmation Dialog */}
        <Dialog open={showGenerateConfirmDialog} onOpenChange={setShowGenerateConfirmDialog}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>
                {hasExistingArchitecture ? 'Confirm Architecture Update' : 'Confirm Architecture Generation'}
              </DialogTitle>
              <DialogDescription>
                {hasExistingArchitecture
                  ? 'Existing architecture files (arch_spec.md and arch_diagram.json) will be overwritten. This action cannot be undone.'
                  : 'This will generate new architecture files (arch_spec.md and arch_diagram.json) for your project.'}
              </DialogDescription>
            </DialogHeader>
            <div className="flex justify-end gap-2 mt-4">
              <Button
                variant="outline"
                onClick={() => setShowGenerateConfirmDialog(false)}
              >
                Cancel
              </Button>
              <Button
                onClick={performGeneration}
                disabled={isLoading}
              >
                {isLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                {hasExistingArchitecture ? 'Confirm Update' : 'Confirm Generation'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </>
    );
  }

  // Sidebar layout (for Architect/Code views)
  return (
    <>
      {/* Floating confirmed features widget - only show in concept mode */}
      {mode === 'concept' && <ConfirmedFeaturesWidget confirmedSelections={confirmedSelections || undefined} />}

      <Card className="w-full h-full shadow-none rounded-none border-0 border-l flex flex-col bg-sidebar text-sidebar-foreground">
        {showHeader && (
          <CardHeader className="pb-2 pt-2 border-b border-sidebar-border">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {/* Use chat icon instead of title text */}
                <MessageSquare className="h-5 w-5 text-primary" />
                {sessionId && (
                  <Badge variant="outline" className="text-xs">
                    <div className={cn("w-2 h-2 rounded-full mr-1.5", phaseInfo.color)} />
                    {phaseInfo.label}
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-2">
                {enableNewChat && (
                  <Button
                    onClick={handleNewChat}
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8"
                    title="Create new conversation"
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                )}
                {enableHistory && (
                  <Button
                    onClick={handleShowHistory}
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8"
                    title="View chat history"
                  >
                    <History className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>
          </CardHeader>
        )}

        <CardContent className="flex-1 p-3 overflow-hidden flex flex-col space-y-3 min-h-0">
          <ScrollArea className="flex-1 pr-2">
            <div className="space-y-4">
              {chatMessages.map((msg, index) => (
                <div
                  key={msg.id}
                  className={cn(
                    "flex items-start space-x-2",
                    msg.sender === 'user' ? "justify-end" : "justify-start"
                  )}
                >
                  {msg.sender === 'ai' && <Sparkles className="h-6 w-6 text-sidebar-primary flex-shrink-0 mt-1" />}

                  {/* Render generation timeline for progress messages */}
                  {msg.isGenerationProgress ? (
                    <GenerationTimeline
                      sessionId={sessionId}
                      isGenerating={isLoading}
                      savedProgressData={msg.progressData}
                      onComplete={(finalProgressData) => {
                        console.log('[Chat] Generation completed, saving progress data:', finalProgressData);
                        // Update the progress message with final progress data
                        updateChatMessage(msg.id, { progressData: finalProgressData });
                        
                        // Clear loading state
                        completeGeneration();
                        
                        // Add success message with file information
                        const details = finalProgressData.details || {};
                        const successMessage: ChatUIMessage = {
                          id: `system-${Date.now()}-success`,
                          sender: 'ai',
                          content: `✅ Architecture generation completed!\n\n**Files Generated:**\n- arch_spec.md (Architecture Specification)\n- arch_diagram.json (Visual Architecture Diagram)\n\n**Summary:**\n- Components: ${details.components || 0}\n- Connections: ${details.connections || 0}\n\n${details.savedToS3 ? '✅ Files saved to S3' : '⚠️ Files not saved to S3'}\n\nWhat would you like to do next?`,
                          timestamp: new Date(),
                          quickReplies: ['Open Architect Diagram', 'Start New Chat', 'Refine Architecture'],
                        };
                        addChatMessage(successMessage);
                      }}
                    />
                  ) : (
                    <div
                      className={cn(
                        "p-2.5 rounded-lg text-sm",
                        msg.sender === 'user'
                          ? "bg-primary text-primary-foreground self-end max-w-[90%]"
                          : "bg-card text-card-foreground self-start max-w-[90%]"
                      )}
                    >
                      {msg.isThinking ? (
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          <span className="italic">{msg.content}</span>
                        </div>
                      ) : msg.sender === 'ai' ? (
                        <MarkdownRenderer content={msg.content} className="text-sm" />
                      ) : (
                        <p className="whitespace-pre-wrap">{msg.content}</p>
                      )}

                    {/* Component suggestions - DISABLED: Not relevant to response messages
                    {msg.sender === 'ai' && msg.suggestedComponents && msg.suggestedComponents.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-card-foreground/20 space-y-2">
                        <p className="text-xs font-semibold text-card-foreground/70 flex items-center">
                          <Sparkles className="h-3 w-3 mr-1" />
                          Suggested Components:
                        </p>
                        {msg.suggestedComponents.map((suggestion, idx) => (
                          <ComponentSuggestionCard
                            key={idx}
                            suggestion={suggestion}
                            sessionId={sessionId || undefined}
                            onAccept={acceptComponent}
                            onReject={rejectComponent}
                            disabled={isLoading}
                          />
                        ))}
                      </div>
                    )}
                    */}

                    {/* Quick reply options */}
                    {msg.sender === 'ai' && msg.quickReplies && msg.quickReplies.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-card-foreground/20 space-y-2">
                        <p className="text-xs font-semibold text-card-foreground/70 flex items-center">
                          <Lightbulb className="h-3 w-3 mr-1" />
                          Quick Replies:
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {msg.quickReplies.map((reply, idx) => (
                            <Button
                              key={idx}
                              onClick={() => handleQuickReply(reply)}
                              disabled={isLoading}
                              size="sm"
                              variant="outline"
                              className="text-xs h-7 px-3"
                            >
                              {reply}
                            </Button>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Checkbox options */}
                    {msg.sender === 'ai' && msg.checkboxOptions && msg.checkboxOptions.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-card-foreground/20 space-y-2">
                        <p className="text-xs font-semibold text-card-foreground/70 flex items-center">
                          <List className="h-3 w-3 mr-1" />
                          Select Options (multiple):
                        </p>
                        <div className="space-y-2">
                          {msg.checkboxOptions.map((option, idx) => {
                            const isChecked = msg.userSelections?.checkboxes?.includes(option) || false;
                            return (
                              <div key={idx} className="flex items-center space-x-2">
                                <Checkbox
                                  id={`checkbox-${msg.id}-${idx}`}
                                  checked={isChecked}
                                  onCheckedChange={() => handleCheckboxToggle(msg.id, option)}
                                  disabled={isLoading}
                                />
                                <label
                                  htmlFor={`checkbox-${msg.id}-${idx}`}
                                  className="text-xs cursor-pointer select-none"
                                >
                                  {option}
                                </label>
                              </div>
                            );
                          })}
                          <div className="flex gap-2 mt-2">
                            <Button
                              onClick={() => handleCheckboxSubmit(msg.id)}
                              disabled={isLoading || (msg.userSelections?.checkboxes?.length || 0) === 0}
                              size="sm"
                              className="flex-1"
                            >
                              Confirm ({msg.userSelections?.checkboxes?.length || 0})
                            </Button>
                            <Button
                              onClick={() => handleSendMessage("No other features required")}
                              disabled={isLoading}
                              size="sm"
                              variant="outline"
                              className="flex-1"
                            >
                              No Others
                            </Button>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Radio options */}
                    {msg.sender === 'ai' && msg.radioOptions && msg.radioOptions.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-card-foreground/20 space-y-2">
                        <p className="text-xs font-semibold text-card-foreground/70 flex items-center">
                          <RadioIcon className="h-3 w-3 mr-1" />
                          Select One:
                        </p>
                        <div className="space-y-2">
                          {msg.radioOptions.map((option, idx) => {
                            const isSelected = msg.userSelections?.radio === option;
                            return (
                              <Button
                                key={idx}
                                onClick={() => handleRadioSelect(msg.id, option)}
                                disabled={isLoading}
                                size="sm"
                                variant={isSelected ? "default" : "outline"}
                                className="w-full justify-start text-xs"
                              >
                                {option}
                              </Button>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Custom input */}
                    {msg.sender === 'ai' && msg.inputPrompt && (
                      <div className="mt-3 pt-3 border-t border-card-foreground/20 space-y-2">
                        <p className="text-xs font-semibold text-card-foreground/70 flex items-center">
                          <Type className="h-3 w-3 mr-1" />
                          Enter Custom Value:
                        </p>
                        <div className="flex gap-2">
                          <Input
                            value={customInput}
                            onChange={(e) => setCustomInput(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                handleCustomInputSubmit();
                              }
                            }}
                            placeholder={msg.inputPrompt}
                            disabled={isLoading}
                            className="flex-1 text-xs"
                          />
                          <Button
                            onClick={handleCustomInputSubmit}
                            disabled={isLoading || !customInput.trim()}
                            size="sm"
                          >
                            Submit
                          </Button>
                        </div>
                      </div>
                    )}

                      {/* Go to Architecture View button - shown when phase is completed and this is the last message */}
                      {currentPhase === 'completed' &&
                       index === chatMessages.length - 1 &&
                       onProceedToArchitecture && (
                        <div className="mt-3 pt-3 border-t border-card-foreground/20">
                          <Button
                            onClick={onProceedToArchitecture}
                            className="w-full"
                            size="sm"
                          >
                            <ArrowRight className="h-4 w-4 mr-2" />
                            Go to Architecture View
                          </Button>
                        </div>
                      )}

                      <p className={cn(
                        "text-xs mt-1.5",
                        msg.sender === 'user' ? "text-primary-foreground/70 text-right" : "text-card-foreground/70 text-left"
                      )}>
                        {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                  )}
                  {msg.sender === 'user' && <User className="h-6 w-6 text-sidebar-primary flex-shrink-0 mt-1" />}
                </div>
              ))}
              {isLoading && (
                <div className="flex items-start space-x-2 justify-start">
                  <Sparkles className="h-6 w-6 text-sidebar-primary flex-shrink-0 mt-1 animate-pulse" />
                  <div className="p-2.5 rounded-lg bg-card text-card-foreground text-sm animate-pulse">
                    Typing...
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          </ScrollArea>
          {error && (
            <div className="text-destructive text-sm p-2 bg-destructive/10 rounded-md flex items-center">
              <AlertCircle className="h-4 w-4 mr-2" /> {error}
            </div>
          )}
        </CardContent>

        <CardFooter className="p-3 border-t border-sidebar-border">
          <div className="relative w-full">
            <Textarea
              ref={textareaRef}
              value={userInput}
              onChange={(e) => setUserInput(e.target.value)}
              onKeyDown={(e) => {
                if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                  e.preventDefault();
                  if (userInput.trim() && !isLoading) {
                    handleSendMessage();
                  }
                }
              }}
              placeholder="Describe your SoC architecture requirements..."
              className="w-full resize-none min-h-[100px] text-sm py-2 pr-20 pb-10 bg-card text-card-foreground placeholder:text-muted-foreground border-input focus:border-primary"
              rows={5}
              disabled={isLoading}
            />
            <div className="absolute bottom-2 right-2 flex items-center gap-2">
              <span className="text-xs text-muted-foreground">
                {navigator.platform.includes('Mac') ? '⌘' : 'Ctrl'}+Enter
              </span>
              <Button
                onClick={() => handleSendMessage()}
                disabled={isLoading || userInput.trim() === ""}
                size="icon"
                className="h-8 w-8 bg-sidebar-primary hover:bg-sidebar-primary/90 text-sidebar-primary-foreground"
              >
                {isLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>
        </CardFooter>
      </Card>

      {/* History Dialog */}
      <Dialog open={showHistoryDialog} onOpenChange={setShowHistoryDialog}>
        <DialogContent className="max-w-2xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>Chat History</DialogTitle>
            <DialogDescription>
              Select a previous session to continue the conversation
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="h-[500px] pr-4">
            {historySessions.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <History className="h-12 w-12 mx-auto mb-3 opacity-50" />
                <p>No chat history for this project</p>
              </div>
            ) : (
              <div className="space-y-2">
                {historySessions.map((session) => (
                  <div
                    key={session.sessionId}
                    className="p-3 border rounded-lg hover:bg-accent cursor-pointer transition-colors"
                    onClick={() => handleLoadHistorySession(session)}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <Badge variant={session.phase === 'generating' ? 'default' : 'secondary'} className="text-xs">
                            {session.phase}
                          </Badge>
                          <span className="text-xs text-muted-foreground">
                            {session.messageCount || 0} messages
                          </span>
                        </div>
                        <p className="text-sm font-medium">
                          Session {session.sessionId.substring(0, 8)}...
                        </p>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
                          <span>Created: {new Date(session.startTime).toLocaleString()}</span>
                          <span>•</span>
                          <span>Last activity: {new Date(session.lastActivity).toLocaleString()}</span>
                        </div>
                      </div>
                      {session.hasArchitecture && (
                        <CheckCircle className="h-5 w-5 text-green-500 flex-shrink-0" />
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>

      {/* Generate/Update Confirmation Dialog */}
      <Dialog open={showGenerateConfirmDialog} onOpenChange={setShowGenerateConfirmDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {hasExistingArchitecture ? 'Confirm Architecture Update' : 'Confirm Architecture Generation'}
            </DialogTitle>
            <DialogDescription>
              {hasExistingArchitecture
                ? 'Existing architecture files (arch_spec.md and arch_diagram.json) will be overwritten. This action cannot be undone.'
                : 'This will generate new architecture files (arch_spec.md and arch_diagram.json) for your project.'}
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2 mt-4">
            <Button
              variant="outline"
              onClick={() => setShowGenerateConfirmDialog(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={performGeneration}
              disabled={isLoading}
            >
              {isLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              {hasExistingArchitecture ? 'Confirm Update' : 'Confirm Generation'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
