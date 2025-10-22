// Chat API Client
// Handles communication with backend chat service

import { apiClient } from './api-client';

// Types matching backend API
export interface ChatMessage {
  id: string;
  sessionId: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  metadata?: Record<string, any>;
}

export interface ConfirmedSelections {
  selectedFeatures: string[];
  performanceChoices: Record<string, string>;
  detailedParameters: Record<string, any>;
}

export interface ChatSession {
  sessionId: string;
  userId?: string;
  projectId?: string;  // Project isolation
  phase: 'gathering' | 'refining' | 'confirming' | 'generating';
  startTime: Date;
  lastActivity: Date;
  conversationHistory: ChatMessage[];
  currentArchitecture?: ArchitectureDefinition;
  confirmedSelections?: ConfirmedSelections;
}

export interface ComponentSuggestion {
  component: any; // ArchitecturalComponent type from backend
  rationale: string;
  confidence: number;
  alternatives?: any[];
}

export interface ArchitectureDefinition {
  naturalLanguageSpec: string;
  selectedComponents: any[];
  customComponents: any[];
  performanceRequirements: string[];
  constraints: string[];
  designDecisions?: any[];
  componentRationale?: any[];
}

// Backend ChatResponse (from conversational-agent)
export interface BackendChatResponse {
  message: string;
  phase: 'gathering' | 'refining' | 'confirming' | 'generating';
  architecturePreview?: ArchitectureDefinition;
  suggestedComponents?: ComponentSuggestion[];
  clarificationQuestions?: string[];
  quickReplies?: string[];  // Quick reply options for user to click
  checkboxOptions?: string[];  // Multi-select options for feature selection
  radioOptions?: string[];  // Single-select options for performance/configuration
  inputPrompt?: string | null;  // Prompt for custom text input
  suggestedRefinements?: string[];
  readyToGenerate: boolean;
  sessionId: string;
  timestamp: Date;
}

// API Response format (what the endpoint returns)
export interface ChatResponse {
  response: BackendChatResponse & {
    metadata?: {
      suggestedComponents?: ComponentSuggestion[];
      architecturePreview?: ArchitectureDefinition;
      quickReplies?: string[];
      checkboxOptions?: string[];
      radioOptions?: string[];
      inputPrompt?: string | null;
    };
  };
  session: {
    id: string;
    phase: 'gathering' | 'refining' | 'confirming' | 'generating';
    timestamp: Date;
    currentArchitecture?: ArchitectureDefinition;
    confirmedSelections?: ConfirmedSelections;
  };
}

export interface SpecificationResult {
  format: 'markdown' | 'json';
  content?: string;
  specification: NaturalLanguageSpec;
  validation: any;
}

export interface NaturalLanguageSpec {
  title: string;
  overview: string;
  requirements: string[];
  architecture: string;
  components: any[];
  constraints: string[];
  designRationale: string[];
  generatedAt: Date;
}

export interface ChatSessionSummary {
  sessionId: string;
  userId?: string;
  projectId?: string;  // Project isolation
  startTime: Date;
  lastActivity: Date;
  phase: string;
  messageCount: number;
  hasArchitecture: boolean;
}

/**
 * Chat API Client
 */
export const chatAPI = {
  /**
   * Start a new design session with project isolation
   */
  async startSession(userId?: string, projectId?: string, hasExistingArchitecture?: boolean): Promise<ChatSession> {
    const response = await apiClient.post<{ sessionId: string; phase: string; projectId?: string; isArchitectureGenerated?: boolean; message: string }>(
      '/chat/session',
      { userId, projectId, hasExistingArchitecture }
    );

    return {
      sessionId: response.sessionId,
      userId,
      projectId: response.projectId || projectId,
      phase: response.phase as any,
      startTime: new Date(),
      lastActivity: new Date(),
      conversationHistory: [],
    };
  },

  /**
   * Send a message and get response (non-streaming)
   */
  async sendMessage(sessionId: string, message: string): Promise<ChatResponse> {
    const response = await apiClient.post<ChatResponse>(
      '/chat/message',
      { sessionId, message, stream: false },
      { timeout: 60000 } // 60 seconds for AI chat responses
    );

    return response;
  },

  /**
   * Send a message with streaming response
   * @param sessionId Session ID
   * @param message User message
   * @param onChunk Callback for each text chunk
   * @param onComplete Callback when streaming completes
   * @param onError Callback for errors
   */
  async sendMessageStreaming(
    sessionId: string,
    message: string,
    onChunk: (text: string, metadata?: any) => void,
    onComplete?: (response: any, session?: any) => void,
    onError?: (error: string) => void
  ): Promise<void> {
    try {
      // Use the correct API base URL - chat is at /api/v1/chat
      const baseURL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api/v1';
      
      // Get auth token from localStorage
      const token = typeof window !== 'undefined' 
        ? localStorage.getItem('auth_token')
        : null;
      
      if (!token) {
        throw new Error('Authentication required. Please log in.');
      }
      
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      };
      
      const response = await fetch(`${baseURL}/chat/message`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ sessionId, message, stream: true })
      });

      if (!response.ok) {
        if (response.status === 401) {
          throw new Error('Authentication failed. Please log in again.');
        }
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('Response body is not readable');
      }

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        
        if (done) {
          break;
        }

        // Decode chunk and add to buffer
        buffer += decoder.decode(value, { stream: true });

        // Process complete lines
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // Keep incomplete line in buffer

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));

              if (data.type === 'connected') {
                console.log('📡 [CHAT_STREAM] Connected to stream');
              } else if (data.type === 'chunk') {
                onChunk(data.text, data.metadata);
              } else if (data.type === 'done') {
                console.log('✅ [CHAT_STREAM] Stream complete');
                // Pass both response and session data
                onComplete?.(data.response, data.session);
              } else if (data.type === 'error') {
                console.error('❌ [CHAT_STREAM] Stream error:', data.message);
                onError?.(data.message);
              }
            } catch (parseError) {
              console.error('Failed to parse SSE data:', line, parseError);
            }
          }
        }
      }
    } catch (error) {
      console.error('Streaming error:', error);
      onError?.(error instanceof Error ? error.message : 'Unknown streaming error');
    }
  },

  /**
   * Get session history
   */
  async getSession(sessionId: string): Promise<ChatSession> {
    const response = await apiClient.get<ChatSession>(
      `/chat/session/${sessionId}`
    );

    return response;
  },

  /**
   * Generate specification from session
   */
  async generateSpecification(
    sessionId: string,
    format: 'markdown' | 'json' = 'markdown',
    options?: any
  ): Promise<SpecificationResult> {
    const response = await apiClient.post<SpecificationResult>(
      `/chat/session/${sessionId}/specification`,
      { format, options }
    );

    return response;
  },

  /**
   * Generate complete architecture (arch_spec.md + arch_diagram.json)
   * Saves files to S3 and returns content
   */
  async generateArchitecture(
    sessionId: string,
    storeNewComponents: boolean = true
  ): Promise<{
    archSpec: {
      format: 'markdown';
      content: string;
    };
    archDiagram: {
      format: 'json';
      data: any;
    };
    savedToS3: boolean;
    s3Paths: {
      archSpec: string;
      archDiagram: string;
    } | null;
    summary: {
      totalComponents: number;
      totalConnections: number;
      generatedAt: string;
    };
  }> {
    // Global singleton guard to prevent duplicate requests at API level
    // This works across all React components and survives Strict Mode double-renders
    const globalKey = `generating_${sessionId}`;
    
    // CRITICAL: Check and set flag in single synchronous operation to prevent race condition
    if ((window as any)[globalKey]) {
      console.warn(`[chatAPI] Generation already in progress for session ${sessionId}, blocking duplicate request`);
      throw new Error('Generation already in progress');
    }
    
    // Set flag immediately (synchronously) before any await
    (window as any)[globalKey] = true;
    console.log(`[chatAPI] Generation lock acquired for session ${sessionId}`);

    try {
      
      const response = await apiClient.post<any>(
        `/chat/session/${sessionId}/generate-architecture`,
        {},
        { timeout: 10000 } // 10 seconds - just for HTTP request, actual generation is async
      );

      // Backend returns 202 Accepted immediately - generation happens in background
      // Frontend should listen to SSE for progress updates
      console.log(`[chatAPI] Generation started (202 Accepted), listening for SSE updates...`);

      // Keep flag set for 3 seconds after request to prevent accidental re-triggers
      setTimeout(() => {
        delete (window as any)[globalKey];
        console.log(`[chatAPI] Generation lock released for session ${sessionId}`);
      }, 3000);

      return response;
    } catch (error) {
      // On error, clear immediately
      delete (window as any)[globalKey];
      throw error;
    }
  },

  /**
   * List all sessions
   */
  async listSessions(): Promise<ChatSessionSummary[]> {
    const response = await apiClient.get<ChatSessionSummary[]>(
      '/chat/sessions'
    );

    return response;
  },

  /**
   * Delete a session
   */
  async deleteSession(sessionId: string): Promise<void> {
    await apiClient.delete(
      `/chat/session/${sessionId}`
    );
  },

  /**
   * Get component suggestions for current session
   */
  async getSuggestions(sessionId: string, query?: string): Promise<ComponentSuggestion[]> {
    const response = await apiClient.get<{ suggestions: ComponentSuggestion[] }>(
      `/chat/session/${sessionId}/suggestions`,
      { query }
    );

    return response.suggestions;
  },

  /**
   * WebSocket connection for real-time updates (future enhancement)
   */
  connectWebSocket(sessionId: string, onMessage: (msg: ChatMessage) => void): WebSocket | null {
    // TODO: Implement WebSocket connection when backend supports it
    console.warn('WebSocket support not yet implemented');
    return null;
  },
};
