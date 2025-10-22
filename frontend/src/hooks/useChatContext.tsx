"use client";

import * as React from 'react';
import { chatAPI, type ChatMessage, type ComponentSuggestion, type ArchitectureDefinition, type ConfirmedSelections } from '@/lib/chat-api';

export interface ChatUIMessage {
  id: string;
  sender: 'user' | 'ai';
  content: string;
  timestamp: Date;
  isThinking?: boolean; // Placeholder message while waiting for AI response
  isGenerationProgress?: boolean; // Message shows generation progress (AI Analysis, etc.)
  progressData?: {
    stage: string;
    progress: number;
    message?: string;
    details?: any;
  }; // Saved progress data for completed generations (persists after refresh)
  suggestedComponents?: ComponentSuggestion[];
  architecturePreview?: ArchitectureDefinition;
  quickReplies?: string[];
  checkboxOptions?: string[];
  radioOptions?: string[];
  inputPrompt?: string | null;
  userSelections?: {
    checkboxes?: string[]; // User-selected checkbox options (persists after refresh)
    radio?: string;         // User-selected radio option (persists after refresh)
  };
}

export type ChatMode = 'concept' | 'architect' | 'code';

// Mode-specific prompts configuration
const MODE_PROMPTS = {
  concept: {
    welcome: (hasExisting: boolean) =>
      hasExisting
        ? "Welcome back! I've detected existing architecture files (arch_spec.md and arch_diagram.json) in your project. I'm ready to help you update and refine your architecture. What modifications would you like to make?"
        : "Hello! I'm your SoC architecture design assistant. Let's work together to design your custom chip architecture. Tell me about your requirements and I'll guide you through the process step by step.",
    generating: "Generating architecture files...",
    generated: "Architecture Generated!",
    filesText: "Created files:",
  },
  architect: {
    welcome: (hasArchitecture: boolean) =>
      hasArchitecture
        ? "Hello! I've loaded your current architecture design (arch_spec.md and arch_diagram.json). What modifications or optimizations would you like to make? I'll perform incremental updates."
        : "Hello! I'm your architecture editing assistant. Describe the changes you'd like to make to the architecture, and I'll help you update arch_spec.md and arch_diagram.json.",
    generating: "Updating architecture files...",
    generated: "Architecture Updated!",
    filesText: "Updated files:",
  },
  code: {
    welcome: () =>
      "Hello! I'm your coding assistant. I can help you write, debug, and optimize code. What would you like to work on?",
    generating: "Processing your request...",
    generated: "Done!",
    filesText: "Modified files:",
  },
};

// LocalStorage keys - mode-specific to separate sessions
const getStorageKey = (mode: ChatMode, key: string) => {
  return `soc-pilot:chat:${mode}:${key}`;
};

const STORAGE_KEY_NAMES = {
  CHAT_MESSAGES: 'messages',
  SESSION_ID: 'sessionId',
  CURRENT_ARCHITECTURE: 'architecture',
  CURRENT_PHASE: 'phase',
  CURRENT_PROJECT_ID: 'projectId',
  CURRENT_USER_ID: 'userId', // User ID for S3 storage
  SESSION_MODE_MAP: 'sessionModeMap', // Maps sessionId to mode
};

// Helper functions for localStorage
const saveToLocalStorage = (key: string, data: any) => {
  try {
    if (typeof window !== 'undefined') {
      localStorage.setItem(key, JSON.stringify(data));
    }
  } catch (error) {
    console.error(`Failed to save to localStorage (${key}):`, error);
  }
};

const loadFromLocalStorage = <T,>(key: string, isChatMessages = false): T | null => {
  try {
    if (typeof window !== 'undefined') {
      const data = localStorage.getItem(key);
      if (data) {
        const parsed = JSON.parse(data);
        // Convert timestamp strings back to Date objects if needed
        if (isChatMessages && Array.isArray(parsed)) {
          return parsed.map(msg => ({
            ...msg,
            timestamp: new Date(msg.timestamp)
          })) as T;
        }
        return parsed as T;
      }
    }
  } catch (error) {
    console.error(`Failed to load from localStorage (${key}):`, error);
  }
  return null;
};

const clearSessionStorage = (mode: ChatMode) => {
  try {
    if (typeof window !== 'undefined') {
      Object.values(STORAGE_KEY_NAMES).forEach(keyName => {
        localStorage.removeItem(getStorageKey(mode, keyName));
      });
    }
  } catch (error) {
    console.error('Failed to clear session storage:', error);
  }
};

/**
 * Clear all chat contexts for a specific project across all modes
 * This should be called when a project is deleted
 */
export const clearProjectChatContext = (projectId: string) => {
  try {
    if (typeof window !== 'undefined') {
      const modes: ChatMode[] = ['concept', 'architect', 'code'];

      modes.forEach(mode => {
        // Check if the stored projectId matches the one being deleted
        const storedProjectId = loadFromLocalStorage<string>(getStorageKey(mode, STORAGE_KEY_NAMES.CURRENT_PROJECT_ID));

        if (storedProjectId === projectId) {
          console.log(`[clearProjectChatContext] Clearing ${mode} mode context for project ${projectId}`);
          clearSessionStorage(mode);
        }
      });

      console.log(`[clearProjectChatContext] Completed clearing context for project ${projectId}`);
    }
  } catch (error) {
    console.error('Failed to clear project chat context:', error);
  }
};

// Helper functions for session-mode mapping (global, not mode-specific)
const saveSessionMode = (sessionId: string, mode: ChatMode) => {
  try {
    if (typeof window !== 'undefined') {
      const mapKey = 'soc-pilot:chat:sessionModeMap';
      const existingMap = localStorage.getItem(mapKey);
      const map = existingMap ? JSON.parse(existingMap) : {};
      map[sessionId] = mode;
      localStorage.setItem(mapKey, JSON.stringify(map));
    }
  } catch (error) {
    console.error('Failed to save session mode:', error);
  }
};

const getSessionMode = (sessionId: string): ChatMode | null => {
  try {
    if (typeof window !== 'undefined') {
      const mapKey = 'soc-pilot:chat:sessionModeMap';
      const existingMap = localStorage.getItem(mapKey);
      if (existingMap) {
        const map = JSON.parse(existingMap);
        return map[sessionId] || null;
      }
    }
  } catch (error) {
    console.error('Failed to get session mode:', error);
  }
  return null;
};

type DesignPhase = 'gathering' | 'refining' | 'confirming' | 'generating' | 'completed';
type AIStatus = 'available' | 'unavailable' | 'unknown';

export interface ChatContextType {
  // Session state
  sessionId: string | null;
  chatMessages: ChatUIMessage[];
  currentPhase: DesignPhase;
  currentArchitecture: ArchitectureDefinition | null;
  currentProjectId: string | null;
  mode: ChatMode;
  selectedNode: any | null;
  hasExistingArchitecture: boolean; // Whether project has existing architecture files
  confirmedSelections: ConfirmedSelections | null; // User's confirmed feature selections

  // Loading and error state
  isLoading: boolean;
  error: string | null;
  aiStatus: AIStatus;

  // Methods
  initializeSession: (projectId?: string, existingArchitecture?: ArchitectureDefinition, userId?: string) => Promise<void>;
  sendMessage: (message: string) => Promise<void>;
  acceptComponent: (suggestion: ComponentSuggestion) => void;
  rejectComponent: (suggestion: ComponentSuggestion) => void;
  generateArchitecture: () => Promise<void>;
  updateChatMessage: (messageId: string, updates: Partial<ChatUIMessage>) => void;
  addChatMessage: (message: ChatUIMessage) => void;
  completeGeneration: () => void;
  clearError: () => void;
  resetSession: () => void;
  loadSession: (sessionId: string) => Promise<void>;
  listSessions: (projectId?: string) => Promise<any[]>;
  newChat: () => void;
  setSelectedNode: (node: any | null) => void;
}

// Factory function to create a chat context provider for a specific mode
function createChatProvider(fixedMode: ChatMode) {
  const ChatContext = React.createContext<ChatContextType | undefined>(undefined);

  function ChatProvider({ children }: { children: React.ReactNode }) {
    const [selectedNode, setSelectedNode] = React.useState<any | null>(null);

    // Ref to store sendMessage function to avoid circular dependency
    const sendMessageRef = React.useRef<((message: string) => Promise<void>) | null>(null);

    const [sessionId, setSessionIdInternal] = React.useState<string | null>(() => {
      return loadFromLocalStorage<string>(getStorageKey(fixedMode, STORAGE_KEY_NAMES.SESSION_ID));
    });
    
    // Wrapper to log all sessionId changes
    const setSessionId = React.useCallback((newSessionId: string | null) => {
      console.log(`[${fixedMode}] 🔄 setSessionId called:`, {
        oldSessionId: sessionId,
        newSessionId,
        stack: new Error().stack?.split('\n').slice(2, 5).join('\n')
      });
      setSessionIdInternal(newSessionId);
    }, [fixedMode, sessionId]);
    const [chatMessages, setChatMessages] = React.useState<ChatUIMessage[]>(() => {
      return loadFromLocalStorage<ChatUIMessage[]>(getStorageKey(fixedMode, STORAGE_KEY_NAMES.CHAT_MESSAGES), true) || [];
    });
    const [currentPhase, setCurrentPhase] = React.useState<DesignPhase>(() => {
      return loadFromLocalStorage<DesignPhase>(getStorageKey(fixedMode, STORAGE_KEY_NAMES.CURRENT_PHASE)) || 'gathering';
    });
    const [currentArchitecture, setCurrentArchitecture] = React.useState<ArchitectureDefinition | null>(() => {
      return loadFromLocalStorage<ArchitectureDefinition>(getStorageKey(fixedMode, STORAGE_KEY_NAMES.CURRENT_ARCHITECTURE));
    });
    const [currentProjectId, setCurrentProjectId] = React.useState<string | null>(() => {
      return loadFromLocalStorage<string>(getStorageKey(fixedMode, STORAGE_KEY_NAMES.CURRENT_PROJECT_ID));
    });
    const [currentUserId, setCurrentUserId] = React.useState<string | null>(() => {
      return loadFromLocalStorage<string>(getStorageKey(fixedMode, STORAGE_KEY_NAMES.CURRENT_USER_ID));
    });  // User ID for S3 storage
    const [isLoading, setIsLoading] = React.useState(false);
    const isGeneratingRef = React.useRef(false); // Track generation state to prevent concurrent calls
    const [error, setError] = React.useState<string | null>(null);
    const [aiStatus, setAiStatus] = React.useState<AIStatus>('unknown');
    const [hasExistingArchitecture, setHasExistingArchitecture] = React.useState(false);
    const [confirmedSelections, setConfirmedSelections] = React.useState<ConfirmedSelections | null>(null);

    // Save to localStorage whenever state changes
    React.useEffect(() => {
      if (sessionId) {
        saveToLocalStorage(getStorageKey(fixedMode, STORAGE_KEY_NAMES.SESSION_ID), sessionId);
      }
    }, [sessionId]);

    React.useEffect(() => {
      saveToLocalStorage(getStorageKey(fixedMode, STORAGE_KEY_NAMES.CHAT_MESSAGES), chatMessages);
    }, [chatMessages]);

    React.useEffect(() => {
      saveToLocalStorage(getStorageKey(fixedMode, STORAGE_KEY_NAMES.CURRENT_PHASE), currentPhase);
    }, [currentPhase]);

    // Track previous phase to detect transitions
    const prevPhaseRef = React.useRef<DesignPhase>(currentPhase);

    // Safety: Clear stale 'generating' phase on mount (from page refresh during generation)
    React.useEffect(() => {
      if (currentPhase === 'generating') {
        console.log(`[${fixedMode}] ⚠️ Detected stale 'generating' phase on page load - resetting to 'refining'`);
        setIsLoading(false);
        isGeneratingRef.current = false;
        // Reset phase to refining since generation was interrupted by page refresh
        setCurrentPhase('refining');
      }
    }, []); // Only run on mount

    // CRITICAL: Auto-detect when phase transitions to 'generating' and start timeline
    React.useEffect(() => {
      const prevPhase = prevPhaseRef.current;
      
      // Only trigger if transitioning FROM non-generating TO generating
      if (prevPhase !== 'generating' && currentPhase === 'generating' && !isGeneratingRef.current && sessionId) {
        console.log(`[${fixedMode}] 🚀 Phase transitioned from '${prevPhase}' to 'generating' - auto-starting timeline`);
        
        // Set loading state to show timeline
        setIsLoading(true);
        isGeneratingRef.current = true;
        
        // Add generation progress message that will show the timeline
        const progressMessageId = `auto-progress-${Date.now()}`;
        const progressMessage: ChatUIMessage = {
          id: progressMessageId,
          sender: 'ai',
          content: 'Architecture generation started automatically...', 
          timestamp: new Date(),
          isGenerationProgress: true, // Flag to render GenerationTimeline
          progressData: undefined, // Will be updated when generation completes
        };
        
        setChatMessages(prev => [...prev, progressMessage]);
        console.log(`[${fixedMode}] 📊 Added auto-generation progress message`);
      }
      
      // Update previous phase ref
      prevPhaseRef.current = currentPhase;
    }, [currentPhase, sessionId, fixedMode]);

    React.useEffect(() => {
      if (currentArchitecture) {
        saveToLocalStorage(getStorageKey(fixedMode, STORAGE_KEY_NAMES.CURRENT_ARCHITECTURE), currentArchitecture);
      }
    }, [currentArchitecture]);

    React.useEffect(() => {
      if (currentProjectId) {
        saveToLocalStorage(getStorageKey(fixedMode, STORAGE_KEY_NAMES.CURRENT_PROJECT_ID), currentProjectId);
      }
    }, [currentProjectId]);

    React.useEffect(() => {
      if (currentUserId) {
        saveToLocalStorage(getStorageKey(fixedMode, STORAGE_KEY_NAMES.CURRENT_USER_ID), currentUserId);
      }
    }, [currentUserId]);

    const initializeSession = React.useCallback(async (
      projectId?: string,
      existingArchitecture?: ArchitectureDefinition,
      userId?: string
    ) => {
      console.log(`[${fixedMode}] 🔍 initializeSession called:`, {
        projectId,
        existingSessionId: sessionId,
        currentProjectId,
        userId,
        currentUserId,
        existingArchitecture: !!existingArchitecture
      });

      // GUARD: Prevent re-initialization if session already exists for the same project
      if (sessionId && currentProjectId === projectId) {
        console.log(`[${fixedMode}] ⚠️  initializeSession called but session already exists for this project, skipping`);
        return;
      }

      try {
        setIsLoading(true);
        setError(null);

        // Reset hasExistingArchitecture at the start of initialization
        setHasExistingArchitecture(false);

        // Save current project ID and user ID
        if (projectId) {
          setCurrentProjectId(projectId);
        }
        // Update currentUserId if provided, otherwise keep existing value
        if (userId) {
          setCurrentUserId(userId);
        } else if (!currentUserId) {
          // If no userId provided and currentUserId is not set, this will cause an error later
          console.warn('[Chat] initializeSession called without userId and no currentUserId in state');
        }

        // Check if we have an existing session in localStorage
        const cachedSessionId = loadFromLocalStorage<string>(getStorageKey(fixedMode, STORAGE_KEY_NAMES.SESSION_ID));
        const cachedMessages = loadFromLocalStorage<ChatUIMessage[]>(getStorageKey(fixedMode, STORAGE_KEY_NAMES.CHAT_MESSAGES), true);
        const cachedProjectId = loadFromLocalStorage<string>(getStorageKey(fixedMode, STORAGE_KEY_NAMES.CURRENT_PROJECT_ID));

        // If projectId changed, clear cache and reset architecture detection
        if (projectId && cachedProjectId && projectId !== cachedProjectId) {
          console.log(`[${fixedMode}] Project changed from ${cachedProjectId} to ${projectId}, clearing session`);
          clearSessionStorage(fixedMode);
          setHasExistingArchitecture(false);
        }

        if (cachedSessionId && cachedMessages && cachedMessages.length > 0 &&
            (!projectId || projectId === cachedProjectId)) {
          console.log(`[${fixedMode}] Found cached session, verifying with backend...`);

          try {
            // Verify session exists on backend
            const backendSession = await chatAPI.getSession(cachedSessionId);

            if (backendSession) {
              console.log(`[${fixedMode}] Backend session found, checking consistency...`);

              // Compare message counts
              const backendMessageCount = backendSession.conversationHistory?.length || 0;
              const frontendMessageCount = cachedMessages.length;

              // Use whichever has more messages (frontend or backend)
              // This handles cases where messages are sent but AI response is still pending
              if (backendMessageCount >= frontendMessageCount) {
                console.log(`[${fixedMode}] Backend has ${backendMessageCount} messages, frontend has ${frontendMessageCount}, using backend data`);

                // Restore session from backend
                setSessionId(cachedSessionId);
                setCurrentPhase(backendSession.phase as DesignPhase);
                setCurrentArchitecture(backendSession.currentArchitecture || null);

                // Convert backend messages to UI format
                const uiMessages: ChatUIMessage[] = backendSession.conversationHistory.map((msg: any) => ({
                  id: msg.id,
                  sender: msg.role === 'user' ? 'user' : 'ai',
                  content: msg.content,
                  timestamp: new Date(msg.timestamp),
                  suggestedComponents: msg.metadata?.suggestedComponents,
                  architecturePreview: msg.metadata?.architecturePreview,
                  quickReplies: msg.metadata?.quickReplies,
                  checkboxOptions: msg.metadata?.checkboxOptions,
                  radioOptions: msg.metadata?.radioOptions,
                  inputPrompt: msg.metadata?.inputPrompt,
                }));

                setChatMessages(uiMessages);
                console.log(`[${fixedMode}] Session restored from backend`);
                setIsLoading(false);
                return;
              } else {
                // Frontend has more messages - this can happen when messages are sent but AI response hasn't arrived yet
                // Use frontend (localStorage) data instead of clearing it
                console.log(`[${fixedMode}] Frontend has ${frontendMessageCount} messages, backend has ${backendMessageCount}, using frontend data`);

                setSessionId(cachedSessionId);
                setCurrentPhase(loadFromLocalStorage<DesignPhase>(getStorageKey(fixedMode, STORAGE_KEY_NAMES.CURRENT_PHASE)) || 'gathering');
                setCurrentArchitecture(loadFromLocalStorage<ArchitectureDefinition>(getStorageKey(fixedMode, STORAGE_KEY_NAMES.CURRENT_ARCHITECTURE)));
                setChatMessages(cachedMessages);

                console.log(`[${fixedMode}] Session restored from localStorage (frontend)`);
                setIsLoading(false);
                return;
              }
            }
          } catch (err) {
            // Backend session not found, but we have valid localStorage data
            // Use it instead of clearing (this can happen when messages are sent but backend hasn't synced yet)
            console.log(`[${fixedMode}] Backend session not found, using localStorage data (${cachedMessages.length} messages)`);

            setSessionId(cachedSessionId);
            setCurrentPhase(loadFromLocalStorage<DesignPhase>(getStorageKey(fixedMode, STORAGE_KEY_NAMES.CURRENT_PHASE)) || 'gathering');
            setCurrentArchitecture(loadFromLocalStorage<ArchitectureDefinition>(getStorageKey(fixedMode, STORAGE_KEY_NAMES.CURRENT_ARCHITECTURE)));
            setChatMessages(cachedMessages);

            console.log(`[${fixedMode}] Session restored from localStorage (backend unavailable)`);
            setIsLoading(false);
            return;
          }
        }

        // No valid cached session, create new one
        console.log(`[${fixedMode}] Creating new session...`);

        // Check if project has existing architecture files (ONLY in concept mode)
        let hasExisting = false;
        if (projectId && fixedMode === 'concept') {
          try {
            const response = await fetch(`/api/v1/workspaces/${projectId}/files/arch_diagram.json`);
            if (response.ok) {
              hasExisting = true;
              setHasExistingArchitecture(true);
              console.log(`[${fixedMode}] Detected existing architecture files in project`);
            } else {
              setHasExistingArchitecture(false);
            }
          } catch (err) {
            console.log(`[${fixedMode}] No existing architecture files found, starting fresh`);
            setHasExistingArchitecture(false);
          }
        } else if (projectId && fixedMode === 'architect' && !existingArchitecture) {
          // For architect mode, try to load existing architecture
          try {
            const response = await fetch(`/api/v1/workspaces/${projectId}/files/arch_diagram.json`);
            if (response.ok) {
              const architectureData = await response.json();
              setCurrentArchitecture(architectureData);
              setCurrentPhase('refining');
              console.log(`[${fixedMode}] Loaded existing architecture from arch_diagram.json`);
            }
          } catch (err) {
            console.log(`[${fixedMode}] No existing architecture files found`);
          }
        }

        // If existing architecture provided, set it as current
        if (existingArchitecture) {
          setCurrentArchitecture(existingArchitecture);
          setCurrentPhase('refining');
          setHasExistingArchitecture(true);
        }

        // Start new chat session
        // Pass hasExisting flag to backend so AI knows whether this is first-time generation or update
        // userId is required for proper S3 storage paths - use currentUserId as fallback
        const effectiveUserId = userId || currentUserId;
        if (!effectiveUserId) {
          throw new Error('User ID is required to start a chat session. Please ensure you are logged in and a project is selected.');
        }
        const session = await chatAPI.startSession(effectiveUserId, projectId, hasExisting);
        setSessionId(session.sessionId);

        // Save session mode mapping
        saveSessionMode(session.sessionId, fixedMode);

        // Add welcome message using mode-specific prompt
        const prompts = MODE_PROMPTS[fixedMode];
        let welcomeContent: string;

        if (fixedMode === 'concept' || fixedMode === 'architect') {
          welcomeContent = prompts.welcome(existingArchitecture !== undefined || hasExisting);
        } else {
          welcomeContent = (prompts.welcome as () => string)();
        }

        const welcomeMessage: ChatUIMessage = {
          id: `ai-${Date.now()}`,
          sender: 'ai',
          content: welcomeContent,
          timestamp: new Date(),
        };

        setChatMessages([welcomeMessage]);

        setIsLoading(false);
      } catch (err) {
        console.error(`[${fixedMode}] Failed to initialize chat session:`, err);
        setError('Failed to start chat session. Please try again.');
        setIsLoading(false);
      }
    }, [fixedMode]); // Removed sendMessage from deps, using sendMessageRef instead

    const sendMessage = React.useCallback(async (message: string) => {
      if (!sessionId || !message.trim()) {
        console.log(`[${fixedMode}] sendMessage aborted: sessionId=${sessionId}, message.trim()=${message.trim()}`);
        return;
      }

      // Generate a unique ID for the thinking message
      const thinkingId = `thinking-${Date.now()}`;
      console.log(`[${fixedMode}] 📤 Sending message, will add thinking placeholder with ID: ${thinkingId}`);

      try {
        setIsLoading(true);
        setError(null);

        // Add user message to UI
        const userMessage: ChatUIMessage = {
          id: `user-${Date.now()}`,
          sender: 'user',
          content: message,
          timestamp: new Date(),
        };

        // Add thinking placeholder message immediately
        const thinkingMessage: ChatUIMessage = {
          id: thinkingId,
          sender: 'ai',
          content: 'Thinking...',
          timestamp: new Date(),
          isThinking: true,
        };

        console.log(`[${fixedMode}] 💭 Adding thinking message to UI:`, thinkingMessage);
        // Update state with both user message and thinking placeholder
        setChatMessages(prev => {
          console.log(`[${fixedMode}] Previous messages count: ${prev.length}`);
          const newMessages = [...prev, userMessage, thinkingMessage];
          console.log(`[${fixedMode}] New messages count: ${newMessages.length}, last message isThinking: ${newMessages[newMessages.length - 1].isThinking}`);
          return newMessages;
        });

        // For architect mode, include selectedNode context in the message
        let messageWithContext = message;
        if (fixedMode === 'architect' && selectedNode) {
          const nodeContext = `\n\n[Currently Selected Component]: ${selectedNode.data?.name || selectedNode.id}\nType: ${selectedNode.data?.type || 'Unknown'}\nProperties: ${JSON.stringify(selectedNode.data, null, 2)}`;
          messageWithContext = message + nodeContext;
        }

        // Send to backend (non-streaming mode for simplicity)
        const apiResponse = await chatAPI.sendMessage(sessionId, messageWithContext);
        const chatResponse = apiResponse.response;

        console.log(`[${fixedMode}] ✅ Received response from backend:`, chatResponse);

        // Mark AI as available
        setAiStatus('available');

        // Update current phase
        if (chatResponse.phase) {
          setCurrentPhase(chatResponse.phase as DesignPhase);
        }

        // Update current architecture
        if (chatResponse.architecturePreview) {
          setCurrentArchitecture(chatResponse.architecturePreview);
        }

        // Update confirmed selections from session
        if (apiResponse.session?.confirmedSelections) {
          console.log(`[${fixedMode}] 📋 BEFORE update - Current confirmedSelections:`, confirmedSelections);
          console.log(`[${fixedMode}] 📋 Received from API - New confirmedSelections:`, apiResponse.session.confirmedSelections);
          setConfirmedSelections(apiResponse.session.confirmedSelections);
          console.log(`[${fixedMode}] 📋 AFTER update - Updated confirmed selections:`, apiResponse.session.confirmedSelections);
        } else {
          console.log(`[${fixedMode}] ⚠️  No confirmedSelections in API response`);
        }

        // Replace thinking message with AI response
        setChatMessages(prev => {
          const messages = prev.filter(msg => msg.id !== thinkingId);

          const aiMsg: ChatUIMessage = {
            id: `ai-${Date.now()}`,
            sender: 'ai',
            content: chatResponse.message,
            suggestedComponents: chatResponse.suggestedComponents,
            architecturePreview: chatResponse.architecturePreview,
            quickReplies: chatResponse.quickReplies,
            checkboxOptions: chatResponse.checkboxOptions,
            radioOptions: chatResponse.radioOptions,
            inputPrompt: chatResponse.inputPrompt,
            timestamp: new Date(),
          };

          return [...messages, aiMsg];
        });

      } catch (err: any) {
        console.error(`[${fixedMode}] Failed to send message:`, err);

        // Detect if this is a Bedrock unavailable error
        const errorMessage = err?.message || String(err);
        const isBedrockError =
          errorMessage.includes('Bedrock') ||
          errorMessage.includes('ResourceNotFoundException') ||
          errorMessage.includes('Model use case') ||
          err?.statusCode === 500;

        if (isBedrockError) {
          setAiStatus('unavailable');
          setError('AI service temporarily unavailable');

          // Add detailed AI unavailability error message
          const errorMsg: ChatUIMessage = {
            id: `error-${Date.now()}`,
            sender: 'ai',
            content: '❌ AI Service Temporarily Unavailable\n\nPossible reasons:\n1. AWS Bedrock account requires model usage application\n2. Backend service configuration issues\n\nPlease contact the administrator to check backend logs and run diagnostic command:\n```\nnpm run test-bedrock\n```',
            timestamp: new Date(),
          };

          // Remove thinking placeholder and add error message
          console.log(`[${fixedMode}] ⚠️ Bedrock error, removing thinking message ID: ${thinkingId}`);
          setChatMessages(prev => {
            const withoutThinking = prev.filter(msg => msg.id !== thinkingId);
            console.log(`[${fixedMode}] Removed thinking on error, messages count: ${prev.length} → ${withoutThinking.length}`);
            return [...withoutThinking, errorMsg];
          });
        } else {
          setError('Failed to send message. Please try again.');

          // Add generic error message to chat
          const errorMsg: ChatUIMessage = {
            id: `error-${Date.now()}`,
            sender: 'ai',
            content: '❌ Sorry, an error occurred while sending the message. Please try again.',
            timestamp: new Date(),
          };

          // Remove thinking placeholder and add error message
          console.log(`[${fixedMode}] ❌ Generic error, removing thinking message ID: ${thinkingId}`);
          setChatMessages(prev => {
            const withoutThinking = prev.filter(msg => msg.id !== thinkingId);
            console.log(`[${fixedMode}] Removed thinking on error, messages count: ${prev.length} → ${withoutThinking.length}`);
            return [...withoutThinking, errorMsg];
          });
        }
      } finally {
        setIsLoading(false);
      }
    }, [sessionId, fixedMode, selectedNode]);

    // Update sendMessageRef whenever sendMessage changes
    React.useEffect(() => {
      sendMessageRef.current = sendMessage;
    }, [sendMessage]);

    const acceptComponent = React.useCallback((suggestion: ComponentSuggestion) => {
      // Update architecture with accepted component
      setCurrentArchitecture(prev => {
        const newArchitecture = prev || {
          naturalLanguageSpec: '',
          selectedComponents: [],
          customComponents: [],
          performanceRequirements: [],
          constraints: [],
          designDecisions: [],
          componentRationale: []
        };

        // Check if component already exists
        const exists = newArchitecture.selectedComponents.some(
          comp => comp.id === suggestion.component.id
        );

        if (exists) {
          return prev;
        }

        // Add component
        return {
          ...newArchitecture,
          selectedComponents: [...newArchitecture.selectedComponents, suggestion.component],
          componentRationale: [
            ...(newArchitecture.componentRationale || []),
            {
              componentId: suggestion.component.id,
              reason: suggestion.rationale,
              benefits: [],
              tradeoffs: [],
              alternatives: suggestion.alternatives?.map(alt => alt.name || alt.id) || []
            }
          ]
        };
      });

      // Add confirmation message
      const confirmMessage: ChatUIMessage = {
        id: `system-${Date.now()}`,
        sender: 'ai',
        content: `✅ Component accepted: **${suggestion.component.name}**\n\n${suggestion.rationale}`,
        timestamp: new Date(),
      };
      setChatMessages(prev => [...prev, confirmMessage]);
    }, []);

    const rejectComponent = React.useCallback((suggestion: ComponentSuggestion) => {
      // Add rejection message
      const rejectMessage: ChatUIMessage = {
        id: `system-${Date.now()}`,
        sender: 'ai',
        content: `❌ Component Rejected: **${suggestion.component.name}**\n\nI can recommend other alternatives for you. Do you have any specific requirements?`,
        timestamp: new Date(),
      };
      setChatMessages(prev => [...prev, rejectMessage]);
    }, []);

    const generateArchitecture = React.useCallback(async (onProgressComplete?: (finalProgressData: any) => void) => {
      if (!sessionId) {
        setError('No active session');
        return;
      }

      // Prevent concurrent architecture generation using ref (avoids closure issues)
      if (isGeneratingRef.current) {
        console.warn(`[${fixedMode}] Architecture generation already in progress, ignoring duplicate call`);
        return;
      }

      let shouldClearGeneratingFlag = true; // Only clear if not a conflict error

      try {
        isGeneratingRef.current = true;
        setIsLoading(true);
        setError(null);

        // Add system message - different wording based on mode
        const prompts = MODE_PROMPTS[fixedMode];

        // Add generation progress message that will remain in history
        const progressMessageId = `progress-${Date.now()}`;
        const progressMessage: ChatUIMessage = {
          id: progressMessageId,
          sender: 'ai',
          content: 'Generating architecture...', // Placeholder content
          timestamp: new Date(),
          isGenerationProgress: true, // Flag to render GenerationProgressMarquee
          progressData: undefined, // Will be updated when generation completes
        };
        setChatMessages(prev => [...prev, progressMessage]);

        // Call backend to start architecture generation (async - returns 202 immediately)
        await chatAPI.generateArchitecture(sessionId, true);

        // Backend returns 202 Accepted - generation happens in background
        // Keep isLoading=true until SSE completion event
        console.log(`[${fixedMode}] Architecture generation started (async), waiting for SSE completion...`);
        console.log(`[${fixedMode}] isLoading will remain true until SSE 'completed' event`);

        // Note: isLoading will be set to false by the SSE completion handler
        // Don't clear it in finally block for successful requests
        shouldClearGeneratingFlag = false; // Keep generating flag until SSE completion

      } catch (err) {
        // Check if error is due to concurrent generation (409 Conflict)
        // If so, silently ignore - the original request is still in progress
        const apiError = err as any;
        const isConflictError = 
          (err instanceof Error && err.name === 'APIClientError') &&
          (apiError.type === 'CONFLICT_ERROR' || 
           apiError.code === 'GENERATION_IN_PROGRESS' ||
           apiError.statusCode === 409);
        
        if (isConflictError) {
          console.warn(`[${fixedMode}] Duplicate generation request detected - original request still in progress`);
          shouldClearGeneratingFlag = false; // Keep flag set - original request still running
          return; // Don't show error message
        }

        // For other errors, log and show error message
        console.error(`[${fixedMode}] Failed to generate architecture:`, err);

        const prompts = MODE_PROMPTS[fixedMode];
        const errorActionText = `${prompts.generated} Failed`;

        const errorMessage: ChatUIMessage = {
          id: `system-${Date.now()}-error`,
          sender: 'ai',
          content: `❌ ${errorActionText}\n\n${err instanceof Error ? err.message : 'Unknown error'}\n\nPlease try again or contact support.`,
          timestamp: new Date(),
        };
        setChatMessages(prev => [...prev, errorMessage]);
        setError(errorActionText);
      } finally {
        if (shouldClearGeneratingFlag) {
          isGeneratingRef.current = false;
          setIsLoading(false);
        }
        // Note: For successful async generation, isLoading stays true until SSE completion
        // It will be cleared by completeGeneration() when SSE emits 'completed' event
      }
    }, [sessionId, fixedMode]);

    const updateChatMessage = React.useCallback((messageId: string, updates: Partial<ChatUIMessage>) => {
      setChatMessages(prev =>
        prev.map(msg =>
          msg.id === messageId
            ? { ...msg, ...updates }
            : msg
        )
      );
    }, []);

    const addChatMessage = React.useCallback((message: ChatUIMessage) => {
      setChatMessages(prev => [...prev, message]);
    }, []);

    const completeGeneration = React.useCallback(() => {
      console.log(`[${fixedMode}] Completing generation - clearing loading state`);
      isGeneratingRef.current = false;
      setIsLoading(false);
    }, [fixedMode]);

    const clearError = React.useCallback(() => {
      setError(null);
    }, []);

    const resetSession = React.useCallback(() => {
      setSessionId(null);
      setChatMessages([]);
      setCurrentPhase('gathering');
      setCurrentArchitecture(null);
      setError(null);
      // Clear localStorage for current mode
      clearSessionStorage(fixedMode);
    }, [fixedMode]);

    const loadSession = React.useCallback(async (targetSessionId: string) => {
      try {
        setIsLoading(true);
        setError(null);

        // Load session from backend
        const backendSession = await chatAPI.getSession(targetSessionId);

        if (!backendSession) {
          throw new Error('Session not found');
        }

        // Restore session
        setSessionId(backendSession.sessionId);
        setCurrentPhase(backendSession.phase as DesignPhase);
        setCurrentArchitecture(backendSession.currentArchitecture || null);
        setCurrentProjectId(backendSession.projectId || null);

        // Save session mode mapping
        saveSessionMode(backendSession.sessionId, fixedMode);

        // Convert backend messages to UI format
        const uiMessages: ChatUIMessage[] = backendSession.conversationHistory.map((msg: any) => ({
          id: msg.id,
          sender: msg.role === 'user' ? 'user' : 'ai',
          content: msg.content,
          timestamp: new Date(msg.timestamp),
          suggestedComponents: msg.metadata?.suggestedComponents,
          architecturePreview: msg.metadata?.architecturePreview,
          quickReplies: msg.metadata?.quickReplies,
          checkboxOptions: msg.metadata?.checkboxOptions,
          radioOptions: msg.metadata?.radioOptions,
          inputPrompt: msg.metadata?.inputPrompt,
        }));

        setChatMessages(uiMessages);

        // Explicitly save to localStorage
        saveToLocalStorage(getStorageKey(fixedMode, STORAGE_KEY_NAMES.SESSION_ID), backendSession.sessionId);
        saveToLocalStorage(getStorageKey(fixedMode, STORAGE_KEY_NAMES.CURRENT_PHASE), backendSession.phase);
        saveToLocalStorage(getStorageKey(fixedMode, STORAGE_KEY_NAMES.CURRENT_ARCHITECTURE), backendSession.currentArchitecture);
        saveToLocalStorage(getStorageKey(fixedMode, STORAGE_KEY_NAMES.CURRENT_PROJECT_ID), backendSession.projectId);
        saveToLocalStorage(getStorageKey(fixedMode, STORAGE_KEY_NAMES.CHAT_MESSAGES), uiMessages);

        console.log(`[${fixedMode}] Session loaded and saved successfully`);
      } catch (err) {
        console.error(`[${fixedMode}] Failed to load session:`, err);
        setError('Failed to load session. Please try again.');
      } finally {
        setIsLoading(false);
      }
    }, [fixedMode]);

    const listSessions = React.useCallback(async (projectId?: string): Promise<any[]> => {
      try {
        const sessions = await chatAPI.listSessions();

        // Filter by projectId and mode
        let filtered = sessions;

        if (projectId) {
          filtered = filtered.filter((s: any) => s.projectId === projectId);
        }

        // Filter by mode - only show sessions created in current mode
        filtered = filtered.filter((s: any) => {
          const sessionMode = getSessionMode(s.sessionId);
          // If no mode recorded (old sessions), exclude them
          // Only show sessions that match current mode
          return sessionMode === fixedMode;
        });

        return filtered;
      } catch (err) {
        console.error(`[${fixedMode}] Failed to list sessions:`, err);
        return [];
      }
    }, [fixedMode]);

    const newChat = React.useCallback(() => {
      // Clear current session
      resetSession();

      // Re-initialize with current project (if any)
      if (currentProjectId) {
        initializeSession(currentProjectId, undefined, currentUserId || undefined);
      }
    }, [currentProjectId, currentUserId, resetSession, initializeSession]);

    const value = React.useMemo(() => ({
      sessionId,
      chatMessages,
      currentPhase,
      currentArchitecture,
      currentProjectId,
      mode: fixedMode,
      selectedNode,
      hasExistingArchitecture,
      confirmedSelections,
      isLoading,
      error,
      aiStatus,
      initializeSession,
      sendMessage,
      acceptComponent,
      rejectComponent,
      generateArchitecture,
      updateChatMessage,
      addChatMessage,
      completeGeneration,
      clearError,
      resetSession,
      loadSession,
      listSessions,
      newChat,
      setSelectedNode,
    }), [
      sessionId,
      chatMessages,
      currentPhase,
      currentArchitecture,
      currentProjectId,
      fixedMode,
      selectedNode,
      hasExistingArchitecture,
      confirmedSelections,
      isLoading,
      error,
      aiStatus,
      initializeSession,
      sendMessage,
      acceptComponent,
      rejectComponent,
      generateArchitecture,
      updateChatMessage,
      addChatMessage,
      completeGeneration,
      clearError,
      resetSession,
      loadSession,
      listSessions,
      newChat,
    ]);

    return (
      <ChatContext.Provider value={value}>
        {children}
      </ChatContext.Provider>
    );
  }

  function useChat() {
    const context = React.useContext(ChatContext);
    if (!context) {
      throw new Error(`useChat must be used within ${fixedMode}ChatProvider`);
    }
    return context;
  }

  return { ChatProvider, useChat };
}

// Create three independent providers for each mode
const { ChatProvider: ConceptChatProvider, useChat: useConceptChat } = createChatProvider('concept');
const { ChatProvider: ArchitectChatProvider, useChat: useArchitectChat } = createChatProvider('architect');
const { ChatProvider: CodeChatProvider, useChat: useCodeChat } = createChatProvider('code');

// Export the providers and hooks
export { ConceptChatProvider, useConceptChat };
export { ArchitectChatProvider, useArchitectChat };
export { CodeChatProvider, useCodeChat };
