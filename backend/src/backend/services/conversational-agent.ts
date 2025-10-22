import {
  BedrockRuntimeClient,
  InvokeModelCommand,
  InvokeModelWithResponseStreamCommand
} from '@aws-sdk/client-bedrock-runtime';
import { awsErrorHandler } from './aws-error-handler';
import {
  ArchitecturalComponent,
  ComponentSuggestion,
  ConversationPhase,
  ChatResponse,
  DesignSession,
  ChatMessage,
  ArchitectureDefinition,
  ComponentMatch,
  ConfirmedSelections
} from '../../types/index';
import { getBedrockConfig } from '../config';
import { ComponentLibraryManager } from './component-library-manager';
import { ComponentGenerator, ComponentGenerationRequest } from './component-generator';
import { DynamoDBSessionPersistence } from './session-persistence-dynamodb';
import { GenerationProgressTracker } from './generation-progress';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';
import path from 'path';

export interface ConversationContext {
  requirements: string[];
  constraints: string[];
  targetApplications: string[];
  performanceNeeds: string[];
  powerRequirements: string[];
  currentComponents: ArchitecturalComponent[];
  phase: ConversationPhase;
}

export class ConversationalAgent {
  private bedrockClient: BedrockRuntimeClient;
  private componentLibrary: ComponentLibraryManager;
  private componentGenerator: ComponentGenerator;
  private sessions: Map<string, DesignSession> = new Map(); // In-memory cache
  private persistence: DynamoDBSessionPersistence;
  private progressTracker: GenerationProgressTracker;
  private config: any;
  private maxSpecAlignmentIterations: number;
  private specAlignmentThreshold: number;
  private activeGenerations: Map<string, boolean> = new Map(); // Track ongoing generations to prevent duplicates
  private componentSchemaForAI: string; // Component schema loaded from component_template_AI.json
  private architectureSchemaForAI: string; // Architecture schema loaded from design_template_AI.json

  /**
   * Check if generation is in progress for a session
   */
  isGenerationInProgress(sessionId: string): boolean {
    return this.activeGenerations.get(sessionId) === true;
  }

  constructor() {
    this.config = getBedrockConfig();
    this.bedrockClient = new BedrockRuntimeClient({
      region: this.config.region,
      credentials: this.config.credentials
    });
    this.componentLibrary = new ComponentLibraryManager();
    this.componentGenerator = new ComponentGenerator();
    this.persistence = new DynamoDBSessionPersistence(30); // 30-day TTL
    this.progressTracker = GenerationProgressTracker.getInstance();

    // Load AI schema templates from golden files
    this.componentSchemaForAI = this.loadSchemaTemplate('component_template_AI.json');
    this.architectureSchemaForAI = this.loadSchemaTemplate('design_template_AI.json');

    // Read spec alignment configuration from environment variables
    this.maxSpecAlignmentIterations = process.env.MAX_SPEC_ALIGNMENT_ITERATIONS
      ? parseInt(process.env.MAX_SPEC_ALIGNMENT_ITERATIONS, 10)
      : 5; // Default: 5 iterations
    this.specAlignmentThreshold = process.env.SPEC_ALIGNMENT_THRESHOLD
      ? parseInt(process.env.SPEC_ALIGNMENT_THRESHOLD, 10)
      : 70; // Default: 70/100 score

    console.log('💾 Using DynamoDB for session storage (secure & scalable)');
    console.log('📊 Sessions loaded on-demand, not at startup');
    console.log(`🎯 Spec alignment config: max ${this.maxSpecAlignmentIterations} iterations, threshold ${this.specAlignmentThreshold}/100`);
    console.log(`🤖 Default model: ${this.config.modelId}`);
    if (this.config.reasoningModelId && this.config.reasoningModelId !== this.config.modelId) {
      console.log(`🧠 Reasoning model: ${this.config.reasoningModelId} (for complex tasks)`);
    }
    console.log('📋 AI schema templates cached in memory (no file I/O during AI requests)');
  }

  /**
   * Start a new conversation session
   */
  async startSession(userId?: string, projectId?: string, hasExistingArchitecture?: boolean): Promise<DesignSession> {
    // Validate required fields
    if (!userId) {
      throw new Error('userId is required to start a session');
    }
    if (!projectId) {
      throw new Error('projectId is required to start a session');
    }

    const sessionId = uuidv4();
    const session: DesignSession = {
      sessionId,
      userId,
      projectId,  // Store projectId for session isolation
      startTime: new Date(),
      lastActivity: new Date(),
      phase: 'gathering',
      conversationHistory: [],
      requirements: [],
      constraints: [],
      // Initialize confirmedSelections to prevent undefined issues
      confirmedSelections: {
        selectedFeatures: [],
        performanceChoices: {},
        detailedParameters: {}
      },
      // Set isArchitectureGenerated flag if project has existing architecture files
      // This helps AI distinguish between first-time generation and architecture updates
      isArchitectureGenerated: hasExistingArchitecture === true
    };

    this.sessions.set(sessionId, session);

    // Persist session to disk
    await this.persistence.saveSession(session);

    console.log(`✅ [START_SESSION] New session created: ${sessionId}, hasExistingArchitecture=${hasExistingArchitecture}, isArchitectureGenerated=${session.isArchitectureGenerated}`);

    return session;
  }

  /**
   * Process a user message with streaming response
   * @param sessionId Session ID
   * @param userMessage User's message
   * @param onChunk Callback for each text chunk
   * @returns Complete ChatResponse
   */
  async processMessageStreaming(
    sessionId: string,
    userMessage: string,
    onChunk: (text: string, metadata?: any) => void
  ): Promise<ChatResponse> {
    console.log(`\n${'='.repeat(80)}`);
    console.log(`💬 [PROCESS_MSG_STREAM] Processing user message for session ${sessionId} (STREAMING)`);
    console.log(`💬 [PROCESS_MSG_STREAM] User message: "${userMessage.substring(0, 100)}${userMessage.length > 100 ? '...' : ''}"`);

    // Load session
    let session = this.sessions.get(sessionId);
    if (!session) {
      const loadedSession = await this.persistence.loadSession(sessionId);
      if (!loadedSession) {
        throw new Error(`Session ${sessionId} not found`);
      }
      session = loadedSession;

      // FIX: If confirmedSelections is missing (from old sessions), rebuild it from conversation history
      if (!session.confirmedSelections) {
        console.log(`🔧 [PROCESS_MSG_STREAM] confirmedSelections missing, rebuilding from history...`);
        session.confirmedSelections = this.rebuildConfirmedSelectionsFromHistory(session);
        console.log(`✅ [PROCESS_MSG_STREAM] Rebuilt confirmedSelections:`, session.confirmedSelections);
      }

      this.sessions.set(sessionId, session);
      console.log(`📖 [PROCESS_MSG_STREAM] Session loaded from DB, confirmedSelections:`, session.confirmedSelections);
    } else {
      console.log(`💾 [PROCESS_MSG_STREAM] Session from cache, confirmedSelections:`, session.confirmedSelections);
    }

    // Add user message to history
    const userChatMessage: ChatMessage = {
      id: uuidv4(),
      sessionId,
      role: 'user',
      content: userMessage,
      timestamp: new Date()
    };
    session.conversationHistory.push(userChatMessage);

    // Extract context
    this.extractUserSelections(userMessage, session);
    const context = this.extractConversationContext(session);
    const relevantComponents = await this.getRelevantComponents(userMessage, context);

    console.log(`🔍 [PROCESS_MSG_STREAM] Found ${relevantComponents.length} relevant components`);

    // Generate AI response with streaming
    const aiResponse = await this.generateAIResponseStreaming(
      userMessage,
      context,
      relevantComponents,
      session,
      onChunk
    );

    console.log(`🤖 [PROCESS_MSG_STREAM] AI response generated (streamed)`);

    // Add AI message to history
    const aiChatMessage: ChatMessage = {
      id: uuidv4(),
      sessionId,
      role: 'assistant',
      content: aiResponse.message,
      timestamp: new Date(),
      metadata: {
        phase: aiResponse.phase,
        suggestedComponents: aiResponse.suggestedComponents,
        clarificationQuestions: aiResponse.clarificationQuestions,
        checkboxOptions: aiResponse.checkboxOptions,
        radioOptions: aiResponse.radioOptions,
        quickReplies: aiResponse.quickReplies,
        inputPrompt: aiResponse.inputPrompt,
        initialRequirements: aiResponse.initialRequirements
      }
    };
    session.conversationHistory.push(aiChatMessage);

    // If AI extracted initial requirements from first message, store them in confirmedSelections
    if (aiResponse.initialRequirements && aiResponse.initialRequirements.length > 0) {
      if (!session.confirmedSelections) {
        session.confirmedSelections = {
          selectedFeatures: [],
          performanceChoices: {},
          detailedParameters: {}
        };
      }
      // Append initial requirements to confirmed features
      const existing = session.confirmedSelections.selectedFeatures || [];
      session.confirmedSelections.selectedFeatures = [...new Set([...existing, ...aiResponse.initialRequirements])];
      console.log(`📋 [PROCESS_MSG] Initial requirements extracted: ${aiResponse.initialRequirements.join(', ')}`);
      console.log(`📋 [PROCESS_MSG] Total confirmed features: ${session.confirmedSelections.selectedFeatures.join(', ')}`);
    }

    // Update session state
    const oldPhase = session.phase;
    session.phase = aiResponse.phase;
    session.lastActivity = new Date();
    console.log(`📝 [PROCESS_MSG_STREAM] Phase transition: ${oldPhase} → ${aiResponse.phase}`);
    
    this.updateSessionFromResponse(session, aiResponse);

    // Persist session
    console.log(`💾 [PROCESS_MSG_STREAM] BEFORE persist - confirmedSelections: [${session.confirmedSelections?.selectedFeatures?.join(', ') || 'none'}]`);
    await this.persistence.saveSession(session);
    console.log(`✅ [PROCESS_MSG_STREAM] Session persisted successfully`);
    console.log(`💾 [PROCESS_MSG_STREAM] AFTER persist - confirmedSelections: [${session.confirmedSelections?.selectedFeatures?.join(', ') || 'none'}]`);

    // CRITICAL: If phase transitioned to 'generating', automatically start architecture generation
    if (oldPhase !== 'generating' && aiResponse.phase === 'generating') {
      console.log(`🚀 [AUTO_GENERATION_STREAM] Phase transitioned to 'generating' - starting automatic architecture generation`);
      console.log(`🚀 [AUTO_GENERATION_STREAM] Session: ${sessionId}, User: ${session.userId}, Project: ${session.projectId}`);
      
      // Start generation in background (fire and forget)
      const requestId = `auto-stream-${Date.now()}`;
      this.finalizeArchitecture(sessionId, requestId)
        .then(({ archSpec, archDiagram }) => {
          console.log(`✅ [AUTO_GENERATION_STREAM] Architecture generated successfully for session ${sessionId}`);
          console.log(`✅ [AUTO_GENERATION_STREAM] Components: ${archDiagram.components?.length || 0}, Connections: ${archDiagram.connections?.length || 0}`);
        })
        .catch((error) => {
          console.error(`❌ [AUTO_GENERATION_STREAM] Failed for session ${sessionId}:`, error);
        });
    }

    console.log(`${'='.repeat(80)}\n`);

    return aiResponse;
  }

  /**
   * Process a user message and generate AI response with component suggestions (non-streaming)
   */
  async processMessage(sessionId: string, userMessage: string): Promise<ChatResponse> {
    console.log(`\n${'='.repeat(80)}`);
    console.log(`💬 [PROCESS_MSG] Processing user message for session ${sessionId}`);
    console.log(`💬 [PROCESS_MSG] User message: "${userMessage.substring(0, 100)}${userMessage.length > 100 ? '...' : ''}"`);

    // Load session from cache or DynamoDB
    let session = this.sessions.get(sessionId);
    if (!session) {
      // Lazy load from DynamoDB
      const loadedSession = await this.persistence.loadSession(sessionId);
      if (!loadedSession) {
        throw new Error(`Session ${sessionId} not found`);
      }
      session = loadedSession;

      // FIX: If confirmedSelections is missing (from old sessions), rebuild it from conversation history
      if (!session.confirmedSelections) {
        console.log(`🔧 [PROCESS_MSG] confirmedSelections missing, rebuilding from history...`);
        session.confirmedSelections = this.rebuildConfirmedSelectionsFromHistory(session);
        console.log(`✅ [PROCESS_MSG] Rebuilt confirmedSelections:`, session.confirmedSelections);
      }

      // Cache in memory
      this.sessions.set(sessionId, session);
      console.log(`📖 [PROCESS_MSG] Session loaded from DB, confirmedSelections:`, session.confirmedSelections);
    } else {
      console.log(`💾 [PROCESS_MSG] Session from cache, confirmedSelections:`, session.confirmedSelections);
    }

    console.log(`📊 [PROCESS_MSG] Session state: phase=${session.phase}, messages=${session.conversationHistory.length}, hasArchitecture=${!!session.currentArchitecture}`);
    if (session.currentArchitecture) {
      console.log(`📊 [PROCESS_MSG] Current architecture: ${session.currentArchitecture.selectedComponents?.length || 0} components`);
    }

    // Add user message to history
    const userChatMessage: ChatMessage = {
      id: uuidv4(),
      sessionId,
      role: 'user',
      content: userMessage,
      timestamp: new Date()
    };
    session.conversationHistory.push(userChatMessage);

    // Extract user selections from their message (IMPORTANT: preserves context!)
    this.extractUserSelections(userMessage, session);

    // Extract requirements and context from conversation
    const context = this.extractConversationContext(session);
    console.log(`🔍 [PROCESS_MSG] Extracted context: requirements=${context.requirements.length}, constraints=${context.constraints.length}, currentComponents=${context.currentComponents.length}`);

    // Get relevant components using RAG
    const relevantComponents = await this.getRelevantComponents(userMessage, context);
    console.log(`🔍 [PROCESS_MSG] Found ${relevantComponents.length} relevant components`);
    if (relevantComponents.length > 0) {
      console.log(`🔍 [PROCESS_MSG] Top relevant components: ${relevantComponents.slice(0, 3).map(c => c.component.name).join(', ')}`);
    }

    // Generate AI response using Bedrock with RAG context
    const aiResponse = await this.generateAIResponse(userMessage, context, relevantComponents, session);
    console.log(`🤖 [PROCESS_MSG] AI response generated: phase=${aiResponse.phase}, suggestedComponents=${aiResponse.suggestedComponents?.length || 0}`);
    console.log(`🤖 [PROCESS_MSG] AI message preview: "${aiResponse.message.substring(0, 150)}${aiResponse.message.length > 150 ? '...' : ''}"`);

    // Add AI message to history
    const aiChatMessage: ChatMessage = {
      id: uuidv4(),
      sessionId,
      role: 'assistant',
      content: aiResponse.message,
      timestamp: new Date(),
      metadata: {
        phase: aiResponse.phase,
        suggestedComponents: aiResponse.suggestedComponents,
        clarificationQuestions: aiResponse.clarificationQuestions,
        checkboxOptions: aiResponse.checkboxOptions,
        radioOptions: aiResponse.radioOptions,
        quickReplies: aiResponse.quickReplies,
        inputPrompt: aiResponse.inputPrompt,
        initialRequirements: aiResponse.initialRequirements
      }
    };
    session.conversationHistory.push(aiChatMessage);

    // If AI extracted initial requirements from first message, store them in confirmedSelections
    if (aiResponse.initialRequirements && aiResponse.initialRequirements.length > 0) {
      if (!session.confirmedSelections) {
        session.confirmedSelections = {
          selectedFeatures: [],
          performanceChoices: {},
          detailedParameters: {}
        };
      }
      // Append initial requirements to confirmed features
      const existing = session.confirmedSelections.selectedFeatures || [];
      session.confirmedSelections.selectedFeatures = [...new Set([...existing, ...aiResponse.initialRequirements])];
      console.log(`📋 [PROCESS_MSG] Initial requirements extracted: ${aiResponse.initialRequirements.join(', ')}`);
      console.log(`📋 [PROCESS_MSG] Total confirmed features: ${session.confirmedSelections.selectedFeatures.join(', ')}`);
    }

    // Update session state
    const oldPhase = session.phase;
    session.phase = aiResponse.phase;
    session.lastActivity = new Date();
    console.log(`📝 [PROCESS_MSG] Phase transition: ${oldPhase} → ${aiResponse.phase}`);

    this.updateSessionFromResponse(session, aiResponse);
    console.log(`📝 [PROCESS_MSG] After update: hasArchitecture=${!!session.currentArchitecture}, components=${session.currentArchitecture?.selectedComponents?.length || 0}`);

    // Persist session to disk after every message
    console.log(`💾 [PROCESS_MSG] BEFORE persist - confirmedSelections: [${session.confirmedSelections?.selectedFeatures?.join(', ') || 'none'}]`);
    await this.persistence.saveSession(session);
    console.log(`✅ [PROCESS_MSG] Session persisted successfully`);
    console.log(`💾 [PROCESS_MSG] AFTER persist - confirmedSelections: [${session.confirmedSelections?.selectedFeatures?.join(', ') || 'none'}]`);

    // CRITICAL: If phase transitioned to 'generating', automatically start architecture generation
    if (oldPhase !== 'generating' && aiResponse.phase === 'generating') {
      console.log(`🚀 [AUTO_GENERATION] Phase transitioned to 'generating' - starting automatic architecture generation`);
      console.log(`🚀 [AUTO_GENERATION] Session: ${sessionId}, User: ${session.userId}, Project: ${session.projectId}`);
      
      // Start generation in background (fire and forget)
      const requestId = `auto-${Date.now()}`;
      this.finalizeArchitecture(sessionId, requestId)
        .then(({ archSpec, archDiagram }) => {
          console.log(`✅ [AUTO_GENERATION] Architecture generated successfully for session ${sessionId}`);
          console.log(`✅ [AUTO_GENERATION] Components: ${archDiagram.components?.length || 0}, Connections: ${archDiagram.connections?.length || 0}`);
        })
        .catch((error) => {
          console.error(`❌ [AUTO_GENERATION] Failed for session ${sessionId}:`, error);
        });
    }

    console.log(`${'='.repeat(80)}\n`);

    return aiResponse;
  }

  /**
   * Extract conversation context from session history
   * Removed hardcoded application domain inference - AI will understand from conversation
   */
  private extractConversationContext(session: DesignSession): ConversationContext {
    const context: ConversationContext = {
      requirements: [...session.requirements],
      constraints: [...session.constraints],
      targetApplications: [],  // Let AI infer from conversation, no hardcoded rules
      performanceNeeds: [],
      powerRequirements: [],
      currentComponents: session.currentArchitecture?.selectedComponents || [],
      phase: session.phase
    };

    // AI will understand application domain, performance needs, and constraints
    // directly from the conversation history in the prompt
    // No need for brittle keyword matching that can cause false positives

    return context;
  }

  /**
   * Get relevant components using RAG (keyword-based matching)
   */
  private async getRelevantComponents(
    userMessage: string,
    context: ConversationContext
  ): Promise<ComponentMatch[]> {
    const searchTerms = this.extractSearchTerms(userMessage, context);
    const matches = await this.componentLibrary.searchComponents(searchTerms);

    // Score and rank components based on context
    return matches
      .map(match => ({
        ...match,
        matchScore: this.calculateContextualScore(match, context)
      }))
      .sort((a, b) => b.matchScore - a.matchScore)
      .slice(0, 5); // Top 5 matches
  }

  /**
   * Extract search terms from user message and context
   */
  private extractSearchTerms(userMessage: string, context: ConversationContext): string[] {
    const terms: string[] = [];
    const message = userMessage.toLowerCase();

    // Add explicit component mentions
    const componentKeywords = [
      'cpu', 'processor', 'core', 'arm', 'cortex', 'risc-v',
      'memory', 'ram', 'ddr', 'sram', 'flash',
      'wifi', 'bluetooth', 'ethernet', 'usb', 'pcie',
      'accelerator', 'gpu', 'npu', 'dsp',
      'controller', 'interface', 'bridge'
    ];

    componentKeywords.forEach(keyword => {
      if (message.includes(keyword)) {
        terms.push(keyword);
      }
    });

    // Add context-based terms
    context.targetApplications.forEach(app => {
      terms.push(app.toLowerCase());
    });

    context.performanceNeeds.forEach(need => {
      terms.push(need);
    });

    context.powerRequirements.forEach(req => {
      terms.push(req);
    });

    return [...new Set(terms)]; // Remove duplicates
  }

  /**
   * Calculate contextual relevance score for a component match
   */
  private calculateContextualScore(match: ComponentMatch, context: ConversationContext): number {
    let score = match.matchScore;

    // Boost score based on application context
    if (context.targetApplications.includes('IoT')) {
      if (match.component.tags.includes('iot') || match.component.tags.includes('low-power')) {
        score += 0.2;
      }
    }

    if (context.targetApplications.includes('AI/ML')) {
      if (match.component.category === 'Accelerator' || match.component.tags.includes('ai')) {
        score += 0.3;
      }
    }

    // Boost score for power requirements
    if (context.powerRequirements.includes('low-power')) {
      if (match.component.tags.includes('low-power') || match.component.tags.includes('efficient')) {
        score += 0.15;
      }
    }

    // Boost score for performance requirements
    if (context.performanceNeeds.includes('high-performance')) {
      if (match.component.tags.includes('high-performance') || match.component.category === 'CPU') {
        score += 0.15;
      }
    }

    return Math.min(score, 1.0); // Cap at 1.0
  }

  /**
   * Load schema template from golden files and cache in memory
   * This method is called once during constructor to load schemas into memory
   * @param filename Schema filename (e.g., 'component_template_AI.json')
   * @returns Formatted schema string for AI prompt (cached in memory)
   */
  private loadSchemaTemplate(filename: string): string {
    try {
      const startTime = Date.now();
      const schemaPath = path.join(__dirname, '../../data/golden', filename);

      if (!fs.existsSync(schemaPath)) {
        console.warn(`⚠️  Schema template not found: ${schemaPath}`);
        console.warn(`📋 Using empty schema for ${filename}`);
        return '{}';
      }

      const schemaContent = fs.readFileSync(schemaPath, 'utf-8');
      const schemaJson = JSON.parse(schemaContent);

      // Format JSON for AI readability: pretty-print with indentation
      const formattedSchema = JSON.stringify(schemaJson, null, 2);
      const loadTime = Date.now() - startTime;
      const sizeKB = Math.round(formattedSchema.length / 1024);

      console.log(`✅ Loaded ${filename} into memory (${loadTime}ms, ~${sizeKB}KB)`);

      return formattedSchema;
    } catch (error) {
      console.error(`❌ Failed to load schema template ${filename}:`, error);
      console.warn(`📋 Using empty schema fallback for ${filename}`);
      // Return fallback empty schema rather than crashing
      return '{}';
    }
  }

  /**
   * Generate AI response using Bedrock with RAG context (streaming)
   */
  private async generateAIResponseStreaming(
    userMessage: string,
    context: ConversationContext,
    relevantComponents: ComponentMatch[],
    session: DesignSession,
    onChunk: (text: string, metadata?: any) => void
  ): Promise<ChatResponse> {
    const prompt = this.buildRAGPrompt(userMessage, context, relevantComponents, session);

    console.log(`🚀 [AI_STREAM] Starting streaming response from Bedrock...`);

    // Call Bedrock with streaming - use reasoning model for complex architecture tasks
    const response = await this.callBedrockStreaming(prompt, (chunk) => {
      // Forward each chunk to the frontend immediately
      console.log(`📤 [AI_STREAM] Forwarding chunk to frontend: ${chunk.length} chars at ${new Date().toISOString()}`);
      onChunk(chunk, { type: 'ai', source: 'bedrock' });
    }, true); // Enable reasoning model

    console.log(`✅ [AI_STREAM] Streaming complete, parsing response...`);

    return this.parseBedrockResponse(response, relevantComponents, session);
  }

  /**
   * Generate AI response using Bedrock with RAG context (non-streaming)
   */
  private async generateAIResponse(
    userMessage: string,
    context: ConversationContext,
    relevantComponents: ComponentMatch[],
    session: DesignSession
  ): Promise<ChatResponse> {
    const prompt = this.buildRAGPrompt(userMessage, context, relevantComponents, session);

    // No fallback - let errors propagate to frontend
    // Use reasoning model for complex architecture tasks
    const response = await this.callBedrock(prompt, true);
    return this.parseBedrockResponse(response, relevantComponents, session);
  }

  /**
   * Build RAG-enhanced prompt for Bedrock
   */
  private buildRAGPrompt(
    userMessage: string,
    context: ConversationContext,
    relevantComponents: ComponentMatch[],
    session: DesignSession
  ): string {
    const componentContext = relevantComponents.map(match => {
      const comp = match.component;
      const interfaces = comp.interfaces?.map(i =>
        `${i.name} (${i.type}, ${i.direction}${i.width ? `, ${i.width}-bit` : ''})`
      ).join(', ') || 'N/A';
      const metrics = comp.estimatedMetrics;
      const metricsStr = metrics ?
        `[${metrics.clockFrequency || 'N/A'}, ${metrics.powerConsumption || 'N/A'}, ${metrics.bandwidth || 'N/A'}]` :
        '';
      return `- ${comp.name} (${comp.category}): ${comp.description}
  Interfaces: ${interfaces}
  Metrics: ${metricsStr}
  Compatibility: ${comp.compatibility?.join(', ') || 'N/A'}`;
    }).join('\n');

    // Include MORE conversation history to preserve user's original requirements
    // Especially critical when user clicks "Proceed with Generation" - we need the full context
    const conversationHistory = session.conversationHistory
      .slice(-20) // Last 10 exchanges to preserve original requirements
      .map(msg => `${msg.role}: ${msg.content}`)
      .join('\n');

    // Extract user's FIRST SUBSTANTIAL message (original requirement) to ensure it's never lost
    // Skip greetings and short messages, find the actual requirement description
    const originalRequirement = session.conversationHistory.length > 0
      ? (() => {
        // Find first user message that's substantial (>20 chars and not just greeting)
        const substantialMsg = session.conversationHistory.find(msg =>
          msg.role === 'user' &&
          msg.content.length > 20 &&
          !msg.content.toLowerCase().match(/^(hi|hello|hey|good|thanks|ok|yes|no)\b/)
        );
        return substantialMsg?.content || session.conversationHistory.find(msg => msg.role === 'user')?.content || '';
      })()
      : '';

    // Check if architecture has been actually generated (not just suggested in conversation)
    // Use session.isArchitectureGenerated flag to distinguish between:
    // 1. First-time generation: session started fresh, no prior architecture files
    // 2. Architecture update: session has existing generated architecture to modify
    const hasExistingArchitecture = session.isArchitectureGenerated === true;
    const modeText = hasExistingArchitecture ? 'modify and update existing architecture' : 'design new architecture';
    const actionVerb = hasExistingArchitecture ? 'update' : 'generate';
    const actionVerbIng = hasExistingArchitecture ? 'updating' : 'generating';

    // Determine if this is the first message or a follow-up
    const isFirstMessage = session.conversationHistory.length <= 2;
    const conversationStateInstruction = !isFirstMessage
      ? `\n**ATTENTION**: Conversation is ongoing (${session.conversationHistory.length} messages). Acknowledge user's response and proceed to next question.`
      : `\n**ATTENTION**: First exchange. Immediately ask about chip requirements.`;

    console.log(`🎯 [BUILD_PROMPT] Conversation history length: ${session.conversationHistory.length}, isFirstMessage: ${isFirstMessage}`);

    return `You are an expert SoC (System-on-Chip) architect helping ${hasExistingArchitecture ? 'modify and update existing' : 'design new'} custom silicon using a structured, progressive approach.
${conversationStateInstruction}

${hasExistingArchitecture ? `IMPORTANT: This is an ARCHITECTURE UPDATE session. The user has an existing architecture with ${session.currentArchitecture?.selectedComponents?.length || 0} components. Your role is to help them UPDATE, MODIFY, or REFINE the existing architecture, not create a new one from scratch.

EXISTING ARCHITECTURE CONTEXT:
${session.currentArchitecture?.selectedComponents?.map(c => `- ${c.name} (${c.type || c.category})`).join('\n') || ''}

When suggesting changes, always reference the existing architecture and explain how your suggestions will UPDATE or IMPROVE it.` : ''}

IMPORTANT CONSTRAINTS:
- You MUST stay focused on SoC/chip design topics only
- If user asks about unrelated topics, politely redirect to SoC design
- Only discuss: processors, memory, interconnects, IP blocks, chip architecture, hardware design, RTL, verification, etc.
- **CRITICAL: Use ONLY English for ALL responses, messages, and interactive options**
- **NEVER use Chinese or any other language - ALL text MUST be in English**
- **ALL checkbox options, radio options, quick replies, and button labels MUST be in English**
- NEVER generate ASCII diagrams, flowcharts, or visual representations in your responses
- Architecture diagrams will be generated separately as structured JSON files

**RESPONSE FORMATTING:**
- Use Markdown formatting for all responses to enhance readability
- Use headings (##, ###) to structure long explanations
- Use bullet points (-) and numbered lists (1., 2.) for clarity
- Use code blocks with language tags for technical examples (e.g., \`\`\`json, \`\`\`verilog)
- Use tables for comparing options, specifications, or component properties
- Use **bold** for emphasis and \`inline code\` for technical terms
- Use > blockquotes for important notes or warnings
- For long responses with multiple sections, always use proper heading hierarchy

**CRITICAL - CONVERSATION FLOW:**
- Start EVERY response by directly addressing the user's input
- First exchange: immediately ask about chip requirements
- Follow-up exchanges: acknowledge answer and proceed to next question
- Keep responses focused and concise

USER'S ORIGINAL REQUIREMENT (NEVER FORGET THIS):
${originalRequirement}

**CRITICAL**: All suggestions and architecture decisions MUST align with the user's original requirement above.
Do NOT deviate to a different use case or application domain unless explicitly requested by the user.

CONVERSATION CONTEXT:
Phase: ${context.phase}
Conversation History Length: ${session.conversationHistory.length} messages (${session.conversationHistory.length <= 2 ? 'FIRST EXCHANGE' : 'ONGOING CONVERSATION'})
Target Applications: ${context.targetApplications.join(', ') || 'Not specified'}
Performance Needs: ${context.performanceNeeds.join(', ') || 'Not specified'}
Power Requirements: ${context.powerRequirements.join(', ') || 'Not specified'}
Current Components: ${context.currentComponents.map(c => c.name).join(', ') || 'None'}

${session.confirmedSelections ? `
**USER'S CONFIRMED SELECTIONS (DO NOT OVERRIDE THESE):**
${session.confirmedSelections.selectedFeatures && session.confirmedSelections.selectedFeatures.length > 0 ?
          `✅ Selected Features: ${session.confirmedSelections.selectedFeatures.join(', ')}` : ''}
${session.confirmedSelections.performanceChoices && Object.keys(session.confirmedSelections.performanceChoices).length > 0 ?
          `\n✅ Performance Choices:\n${Object.entries(session.confirmedSelections.performanceChoices)
            .map(([feature, choice]) => `   - ${feature}: ${choice}`)
            .join('\n')}` : ''}
${session.confirmedSelections.detailedParameters && Object.keys(session.confirmedSelections.detailedParameters).length > 0 ?
          `\n✅ Detailed Parameters: ${JSON.stringify(session.confirmedSelections.detailedParameters, null, 2)}` : ''}

**CRITICAL INSTRUCTION**: The above selections are ALREADY CONFIRMED by the user.
- ✅ DO: Build upon these confirmed choices
- ✅ DO: Ask about UNCONFIRMED aspects only
- ❌ DO NOT: Ask again about already confirmed features
- ❌ DO NOT: Change or override confirmed selections
- ❌ DO NOT: Suggest different features than what user already selected
` : ''}

RELEVANT COMPONENTS FROM LIBRARY:
${componentContext}

COMPONENT SCHEMA CONSTRAINTS:
When generating or referencing components, follow this schema structure (loaded from component_template_AI.json):
${this.componentSchemaForAI}

CONVERSATION HISTORY (Last 10 exchanges):
${conversationHistory}

CURRENT USER MESSAGE: ${userMessage}

**REMINDER**: When user selects "Proceed with Generation":
1. ✅ **IMMEDIATELY** start architecture generation (set phase to 'generating')
2. ✅ **PRESERVE** all confirmed selections listed in "USER'S CONFIRMED SELECTIONS" above
3. ✅ **INFER** missing/unconfirmed details based on:
   - User's ORIGINAL REQUIREMENT
   - Confirmed selections already made
   - Common SoC architecture patterns for the use case
3. ❌ **DO NOT** change, override, or re-ask about confirmed selections
4. ❌ **DO NOT** change the use case or architecture direction

**Example**: If user confirmed "CPU Core, Memory" but didn't specify performance:
- ✅ Keep CPU Core and Memory as confirmed features
- ✅ Infer appropriate performance levels (e.g., Medium Performance)
- ❌ Don't add WiFi or other features user didn't select

PROGRESSIVE DESIGN METHODOLOGY:
Follow this structured approach to guide the user through architecture design:

**CRITICAL - FIRST MESSAGE ANALYSIS:**
When user provides their FIRST message (conversation history <= 2 messages), carefully analyze what they ALREADY specified:

1. **Extract Explicit Requirements** - Identify clearly stated features and parameters:
   - Components mentioned by name: "DDR5 controller", "CXL3 controller", "ARM Cortex-A78"
   - Quantities: "4 DDR5 controllers", "dual-core", "8 lanes"
   - Specifications: "CXL3", "DDR5-5600", "PCIe Gen4"
   - Application domain: "memory expander", "IoT device", "edge AI"

2. **Output Initial Requirements**:
   - ✅ **MANDATORY**: Use [INITIAL_REQUIREMENTS: component1 | component2 | ...] to mark recognized requirements
   - Format: [INITIAL_REQUIREMENTS: CXL3 Controller | DDR5 Controller x4 | Application: Memory Expander]
   - Include: component names, quantities, specifications, application domain
   - This tag will be hidden from user but preserved in backend for context

3. **Confirm + Focus Approach**:
   - ✅ **DO**: Acknowledge confirmed requirements in text (NOT with interactive options)
   - ✅ **DO**: Focus interactive questions on UNSPECIFIED aspects only
   - ❌ **DON'T**: Ask user to re-confirm what they already stated clearly
   - ❌ **DON'T**: Use checkbox/radio for features they already mentioned

4. **Example 1 - Good Response**:
   User: "Create a CXL3 memory expander SoC with 4 DDR5 controllers."

   AI Response:
   "[INITIAL_REQUIREMENTS: CXL3 Controller | DDR5 Controller x4 | Application: Memory Expander]

   Great! I understand you need a CXL3 memory expander with 4x DDR5 controllers.

   To complete the design, I need to know about additional features:

   [CHECKBOX: PCIe Interface | I2C/SMBus | Power Management | Temperature Sensors]"

   ✅ Used [INITIAL_REQUIREMENTS: ...] to mark recognized components
   ✅ Confirmed "4x DDR5" and "CXL3" in text
   ✅ Only asked about UNSPECIFIED features

5. **Example 2 - Bad Response (NEVER do this)**:
   User: "Create a CXL3 memory expander SoC with 4 DDR5 controllers."

   AI Response:
   "What features do you need?

   [CHECKBOX: CPU Core | DDR5 Controller | CXL Controller | PCIe]"

   ❌ Missing [INITIAL_REQUIREMENTS: ...] tag
   ❌ Asked about DDR5/CXL again (user already specified!)
   ❌ Ignored the "4x" quantity user mentioned

PHASE 1 - FEATURE SELECTION (gathering):
1. Ask about the chip's application domain (if not clear from first message)
2. Acknowledge any features user already mentioned in text
3. Use checkboxes ONLY for additional/unspecified features
4. Format: [CHECKBOX: Feature1 | Feature2 | Feature3 | Feature4]
5. Example features: "CPU Core | Memory Controller | WiFi | Bluetooth | USB Interface | AI Accelerator | Other (please specify)"
6. **CRITICAL**: DO NOT include "No other features required" or "Done" option in checkbox
7. User can skip checkbox to indicate no more features needed

**CRITICAL - When user completes feature selection:**
- If user indicates no more features needed (e.g., selects "No other features required" or similar)
- IMMEDIATELY show final confirmation with summary
- DO NOT continue asking about performance/parameters
- Display all confirmed features and parameters
- Provide [QUICK_REPLY: ${hasExistingArchitecture ? 'Proceed with Update' : 'Proceed with Generation'} | Add More Features | Modify Configuration]

Example Response (After user says "No other features required"):
"Perfect! Here's your chip configuration:

**Confirmed Features:**
- 4x DDR5-5600 Memory Controllers
- 1x CXL3 Controller
- PCIe Gen4 Interface
- I2C/SMBus Controller

Ready to ${actionVerb} architecture files?

[QUICK_REPLY: ${hasExistingArchitecture ? 'Proceed with Update' : 'Proceed with Generation'} | Add More Features | Modify Configuration]"

PHASE 2 - PERFORMANCE REQUIREMENTS (refining):
**ONLY reach this phase if user wants to refine performance specs**
1. **Skip components with specified parameters** - If user already stated specific specs (e.g., "DDR5-5600", "PCIe Gen4"), acknowledge in text and move on
2. For components WITHOUT specified performance, ask about performance level
3. Use radio buttons for performance tiers (low/medium/high)
4. ALWAYS include an option to skip directly to architecture ${actionVerb}
5. Format: [RADIO: Low Performance | Medium Performance | High Performance | ${hasExistingArchitecture ? 'Proceed with Update' : 'Proceed with Generation'}]
6. Ask ONE feature at a time, not all at once
7. Provide specific examples for each tier
8. If user selects "${hasExistingArchitecture ? 'Proceed with Update' : 'Proceed with Generation'}", generation starts IMMEDIATELY with all confirmed features
9. **IMPORTANT**: If you include "Proceed with Generation" in a RADIO button, do NOT include it again in QUICK_REPLY or anywhere else in the same response

**Example - Good approach for PHASE 2**:
User previously said: "4x DDR5-5600 controllers"

AI Response:
"Perfect! I've noted your DDR5-5600 specification for the memory controllers.

For the CXL3 controller, what performance level do you need?

[RADIO: Low (CXL 2.0, basic) | Medium (CXL 3.0, standard) | High (CXL 3.0, optimized) | Proceed with Generation]"

✅ Acknowledged "DDR5-5600" spec in text (didn't ask again)
✅ Only asked about CXL performance (not specified before)

**FINAL STEP - READY FOR GENERATION:**
When user indicates they're ready (e.g., "no more features needed", "that's all"):
1. Show comprehensive configuration summary:
   - All confirmed features and quantities
   - All confirmed performance specs
   - Any custom parameters user specified
2. Provide final action button:
   - [QUICK_REPLY: ${hasExistingArchitecture ? 'Proceed with Update' : 'Proceed with Generation'} | Add More Features | Modify Configuration]
3. **CRITICAL - FILE GENERATION PROTOCOL**:
   - ✅ DO: Tell user "Click the '${hasExistingArchitecture ? 'Proceed with Update' : 'Proceed with Generation'}' button above to ${actionVerb} the architecture files"
   - ✅ DO: Explain what files will be ${actionVerbIng} (arch_spec.md and arch_diagram.json)
   - ❌ NEVER say: "I'll create", "I will create", "Creating files", "Files are being generated"
   - **When user clicks the button, generation starts immediately - no additional confirmation needed**

PHASE 3 - ${actionVerb.toUpperCase()} (generating):
**CRITICAL**: This phase means generation is STARTING NOW - no more user input needed!
1. This phase is only reached AFTER user clicks the generation button in the UI
2. Provide a brief acknowledgment message ONLY (1-2 sentences)
3. **DO NOT show any buttons** (no QUICK_REPLY, no RADIO, no CHECKBOX, no INPUT_PROMPT)
4. **DO NOT ask questions** - generation is already confirmed
5. **DO NOT list detailed file contents** - just acknowledge generation is starting
6. DO NOT generate ASCII diagrams in chat responses
7. Files (arch_spec.md and arch_diagram.json) are created by the system backend
8. The frontend will automatically trigger generation and show progress timeline

**Example Response for generating phase:**
"Starting architecture generation with your confirmed specifications."

**DO NOT include any interactive elements or detailed explanations in this phase!**

ARCHITECTURE OUTPUT FORMAT (for your reference):
The system will generate arch_diagram.json using this schema structure (loaded from design_template_AI.json):
${this.architectureSchemaForAI}

When suggesting components, ensure they have compatible interfaces for connections.

INTERACTION FORMAT RULES:
1. **CRITICAL**: Use ONLY ONE interactive element per response - NEVER use multiple elements
   - ❌ WRONG: [CHECKBOX: ...] AND [QUICK_REPLY: ...] in same response
   - ✅ CORRECT: [CHECKBOX: ...] OR [QUICK_REPLY: ...] (choose one only)
2. **CRITICAL**: Each button/option should appear ONLY ONCE in your response
   - ❌ WRONG: Multiple "Proceed with Generation" buttons in same response
   - ✅ CORRECT: One "Proceed with Generation" button maximum
3. Available formats:
   - [CHECKBOX: opt1 | opt2 | opt3] - Multi-select features (PHASE 1 only)
   - [RADIO: opt1 | opt2 | opt3] - Single-select performance/option (PHASE 2 only)
   - [INPUT_PROMPT: hint text] - Text input for custom values (PHASE 3 only)
   - [QUICK_REPLY: opt1 | opt2] - Quick action buttons (confirmation/navigation)

3. **CRITICAL FORMAT REQUIREMENTS:**
   - ALL option text (opt1, opt2, opt3) MUST be in English ONLY
   - Use pipe character "|" to separate options
   - DO NOT use dashes "-" before option names
   - DO NOT use Markdown list format inside brackets
   - Each option should be plain text without special characters at start

4. **Examples of CORRECT format:**
   ✅ [RADIO: Low Performance | Medium Performance | High Performance]
   ✅ [CHECKBOX: CPU Core | Memory Controller | WiFi Module]

5. **Examples of WRONG format:**
   ❌ [RADIO: - Low Performance | - Medium Performance] (DO NOT use "-" before options)
   ❌ [RADIO: - Low - Medium - High] (NEVER merge options with dashes)
   ❌ [RADIO:\n- Low Performance\n- Medium Performance] (NO Markdown lists inside brackets)
   ❌ [RADIO: 低性能 | 中等性能] (NEVER use Chinese)
   ❌ [RADIO: ...] followed by [QUICK_REPLY: Proceed with Generation | ...] (NEVER duplicate "Proceed with Generation")

6. Keep text brief (2-3 sentences)
7. Ask ONE question at a time
8. Progress through phases systematically

RESPONSE GUIDELINES:
1. Check if message is SoC-related:
   - NO: Redirect politely to SoC design topics
   - YES: Continue with progressive methodology

2. **NEVER re-ask confirmed information**:
   - ✅ DO: Review conversation history before asking
   - ✅ DO: Acknowledge confirmed requirements in text
   - ✅ DO: Focus questions on UNSPECIFIED details only
   - ❌ DON'T: Use interactive options for already-stated features
   - ❌ DON'T: Ask about quantities user already specified

3. **CRITICAL - When user indicates "no more features/parameters needed"**:
   - ✅ DO: Immediately show final configuration summary
   - ✅ DO: List all confirmed features and parameters
   - ✅ DO: Provide [QUICK_REPLY: ${hasExistingArchitecture ? 'Proceed with Update' : 'Proceed with Generation'} | Add More Features | Modify Configuration]
   - ❌ DON'T: Continue asking about performance or parameters
   - ❌ DON'T: Move to next phase without showing summary
   - ❌ DON'T: Show "Proceed with Generation" button multiple times in same response

4. Based on current phase:
   - gathering: Feature selection with checkboxes (ONLY for unspecified features)
   - refining: Performance selection with radio buttons (SKIP if specs already stated)
   - generating: Architecture generation in progress
     * **NO buttons** (no QUICK_REPLY, RADIO, CHECKBOX, INPUT_PROMPT)
     * **NO questions** - just brief acknowledgment
     * **NO ASCII diagrams**
     * Generation happens automatically in backend

5. Always explain WHY you're asking each question
6. Keep responses conversational but structured
7. Suggest relevant components from library
8. NEVER include ASCII diagrams, flowcharts, or visual representations in chat
9. Architecture visualization will be handled by separate structured files

Example Response (When User Confirms Feature Selection):
"Thank you for selecting those features. Now let's determine the performance requirements for each component.

Let's start with the first feature you selected. What performance level do you need?

[RADIO: Low Performance | Medium Performance | High Performance | Proceed with Generation]"

Example Response (Performance Selection):
"Great, you selected CPU Core. Now let's determine the performance requirements.

What performance level do you need for the CPU core?

[RADIO: Low Power (MCU-level, e.g., Cortex-M4) | Medium Performance (Application Processor, e.g., Cortex-A53) | High Performance (Multi-core Processor, e.g., Cortex-A78) | ${hasExistingArchitecture ? 'Proceed with Update' : 'Proceed with Generation'}]"

Example Response (Parameter Details):
"Performance requirements confirmed. Do you need to specify detailed CPU parameters?

[QUICK_REPLY: Specify Parameters | Use Default Configuration | ${hasExistingArchitecture ? 'Proceed with Update' : 'Proceed with Generation'}]"

Example Response (User Ready for Generation):
"Perfect! Your architecture configuration is ready:

**Core Components:**
- CXL 3.0 Controller (64 GT/s, PCIe 6.0)
- DDR5-5600 Memory Controller (8GB capacity)

**Files to be ${actionVerbIng}:**
- arch_spec.md - Complete technical specification
- arch_diagram.json - Visual architecture data

Click the '${hasExistingArchitecture ? 'Proceed with Update' : 'Proceed with Generation'}' button above to ${actionVerb} these files.

[QUICK_REPLY: ${hasExistingArchitecture ? 'Proceed with Update' : 'Proceed with Generation'} | Modify Configuration | Add More Components]"

LANGUAGE ENFORCEMENT:
- ABSOLUTELY NO Chinese characters allowed in any part of the response
- ALL options must use English terms ONLY
- If you're tempted to use Chinese, STOP and use English equivalent
- Example translations for reference:
  - 低性能 → "Low Performance"
  - 中等性能 → "Medium Performance"
  - 高性能 → "High Performance"
  - 直接生成架构 → "Direct Generate Architecture"
  - 修改配置 → "Modify Configuration"
  - 跳过并生成 → "Skip and Generate"
- Remember: The user interface is in English, so ALL responses MUST be in English`;
  }

  /**
   * Call Bedrock API with error handling and retry logic (non-streaming)
   * @param prompt The prompt to send
   * @param useReasoning Whether to use the reasoning model for complex tasks
   */
  private async callBedrock(prompt: string, useReasoning: boolean = true): Promise<string> {
    return await awsErrorHandler.executeWithRetry(async () => {
      // Select model based on task complexity
      const modelId = useReasoning && this.config.reasoningModelId
        ? this.config.reasoningModelId
        : this.config.modelId;

      // Determine if using Claude or Nova/other models
      const isClaude = modelId.includes('anthropic.claude');
      const isNova = modelId.includes('amazon.nova');

      let requestBody: any;

      if (isClaude) {
        // Claude format
        requestBody = {
          anthropic_version: "bedrock-2023-05-31",
          max_tokens: this.config.maxTokens,
          temperature: this.config.temperature,
          messages: [
            {
              role: "user",
              content: prompt
            }
          ]
        };
      } else if (isNova) {
        // Amazon Nova format
        requestBody = {
          messages: [
            {
              role: "user",
              content: [{ text: prompt }]
            }
          ],
          inferenceConfig: {
            max_new_tokens: this.config.maxTokens,
            temperature: this.config.temperature,
            top_p: this.config.topP
          }
        };
      } else {
        // Generic format (works for most models)
        requestBody = {
          messages: [
            {
              role: "user",
              content: prompt
            }
          ],
          max_tokens: this.config.maxTokens,
          temperature: this.config.temperature
        };
      }

      const command = new InvokeModelCommand({
        modelId: modelId,
        body: JSON.stringify(requestBody),
        contentType: "application/json",
        accept: "application/json"
      });

      const response = await this.bedrockClient.send(command);
      const responseBody = JSON.parse(new TextDecoder().decode(response.body));

      // Parse response based on model type
      if (isClaude) {
        return responseBody.content[0].text;
      } else if (isNova) {
        return responseBody.output.message.content[0].text;
      } else {
        // Generic fallback
        return responseBody.content?.[0]?.text || responseBody.output?.text || responseBody.text || '';
      }
    }, {
      maxRetries: 3,
      baseDelay: 1000,
      maxDelay: 10000
    });
  }

  /**
   * Call Bedrock API with streaming response
   * @param prompt The prompt to send to Bedrock
   * @param onChunk Callback for each text chunk received
   * @param useReasoning Whether to use the reasoning model for complex tasks
   * @returns Complete response text
   */
  private async callBedrockStreaming(
    prompt: string,
    onChunk: (text: string) => void,
    useReasoning: boolean = true
  ): Promise<string> {
    return await awsErrorHandler.executeWithRetry(async () => {
      // Select model based on task complexity
      const modelId = useReasoning && this.config.reasoningModelId
        ? this.config.reasoningModelId
        : this.config.modelId;

      // Determine if using Claude or Nova/other models
      const isClaude = modelId.includes('anthropic.claude');
      const isNova = modelId.includes('amazon.nova');

      let requestBody: any;

      if (isClaude) {
        // Claude format
        requestBody = {
          anthropic_version: "bedrock-2023-05-31",
          max_tokens: this.config.maxTokens,
          temperature: this.config.temperature,
          messages: [
            {
              role: "user",
              content: prompt
            }
          ]
        };
      } else if (isNova) {
        // Amazon Nova format
        requestBody = {
          messages: [
            {
              role: "user",
              content: [{ text: prompt }]
            }
          ],
          inferenceConfig: {
            max_new_tokens: this.config.maxTokens,
            temperature: this.config.temperature,
            top_p: this.config.topP
          }
        };
      } else {
        // Generic format
        requestBody = {
          messages: [
            {
              role: "user",
              content: prompt
            }
          ],
          max_tokens: this.config.maxTokens,
          temperature: this.config.temperature
        };
      }

      const command = new InvokeModelWithResponseStreamCommand({
        modelId: modelId,
        body: JSON.stringify(requestBody),
        contentType: "application/json",
        accept: "application/json"
      });

      const response = await this.bedrockClient.send(command);
      let fullText = '';

      // Process the stream
      if (response.body) {
        for await (const event of response.body) {
          if (event.chunk) {
            const chunk = JSON.parse(new TextDecoder().decode(event.chunk.bytes));

            // Handle different event types based on model
            if (isClaude) {
              // Claude streaming format
              if (chunk.type === 'content_block_delta') {
                const text = chunk.delta?.text || '';
                if (text) {
                  fullText += text;
                  console.log(`📤 [BEDROCK_STREAM] Claude chunk: ${text.length} chars, total: ${fullText.length}`);
                  onChunk(text);
                }
              } else if (chunk.type === 'message_stop') {
                console.log('🎉 [BEDROCK_STREAM] Claude stream completed');
              }
            } else if (isNova) {
              // Amazon Nova streaming format - handle multiple possible structures
              let text = '';

              // Try different Nova streaming response structures
              if (chunk.contentBlockDelta?.delta?.text) {
                text = chunk.contentBlockDelta.delta.text;
              } else if (chunk.delta?.text) {
                text = chunk.delta.text;
              } else if (chunk.outputText) {
                text = chunk.outputText;
              }

              if (text) {
                fullText += text;
                // Log chunk size for debugging streaming performance
                console.log(`📤 [BEDROCK_STREAM] Nova chunk: ${text.length} chars, total: ${fullText.length}`);
                onChunk(text);
              } else if (chunk.messageStop || chunk['amazon-bedrock-invocationMetrics']) {
                console.log('🎉 [BEDROCK_STREAM] Nova stream completed');
              } else {
                // Log unknown chunk structure for debugging
                console.log('🔍 [BEDROCK_STREAM] Unknown Nova chunk structure:', JSON.stringify(chunk).substring(0, 200));
              }
            } else {
              // Generic streaming format
              const text = chunk.delta?.text || chunk.text || '';
              if (text) {
                fullText += text;
                onChunk(text);
              }
            }
          }
        }
      }

      return fullText;
    }, {
      maxRetries: 3,
      baseDelay: 1000,
      maxDelay: 10000
    });
  }

  /**
   * Parse Bedrock response into structured ChatResponse
   */
  private parseBedrockResponse(
    bedrockResponse: string,
    relevantComponents: ComponentMatch[],
    session: DesignSession
  ): ChatResponse {
    console.log(`\n🔍 [PARSE_AI] Parsing Bedrock response (${bedrockResponse.length} chars)`);
    console.log(`🔍 [PARSE_AI] Raw response: "${bedrockResponse.substring(0, 200)}${bedrockResponse.length > 200 ? '...' : ''}"`);

    // Check if Bedrock redirected the user (off-topic detection)
    const isRedirect = bedrockResponse.includes('specialize in helping design SoC chips') ||
      bedrockResponse.includes('can only answer questions about');

    if (isRedirect) {
      console.log(`⚠️  [PARSE_AI] Off-topic message detected, keeping current phase: ${session.phase}`);
      // Don't change phase or suggest components for off-topic messages
      return {
        message: bedrockResponse,
        phase: session.phase, // Keep current phase
        suggestedComponents: [],
        clarificationQuestions: [],
        suggestedRefinements: [],
        readyToGenerate: false,
        sessionId: session.sessionId,
        timestamp: new Date()
      };
    }

    // Determine next phase based on response content and conversation length
    const nextPhase = this.determineNextPhase(bedrockResponse, session);
    console.log(`📊 [PARSE_AI] Determined next phase: ${nextPhase} (current: ${session.phase})`);

    // Extract component suggestions from response
    const suggestedComponents = this.extractComponentSuggestions(bedrockResponse, relevantComponents);
    console.log(`📦 [PARSE_AI] Extracted ${suggestedComponents.length} suggested components`);
    if (suggestedComponents.length > 0) {
      console.log(`📦 [PARSE_AI] Suggested components: ${suggestedComponents.map(s => s.component.name).join(', ')}`);
    } else {
      console.log(`⚠️  [PARSE_AI] WARNING: No components suggested! This may prevent architecture generation.`);
    }

    // Extract clarification questions
    const clarificationQuestions = this.extractClarificationQuestions(bedrockResponse);
    console.log(`❓ [PARSE_AI] Extracted ${clarificationQuestions.length} clarification questions`);

    // Extract interactive elements
    const quickReplies = this.extractQuickReplies(bedrockResponse);
    const checkboxOptions = this.extractCheckboxOptions(bedrockResponse);
    const radioOptions = this.extractRadioOptions(bedrockResponse);
    const inputPrompt = this.extractInputPrompt(bedrockResponse);
    const initialRequirements = this.extractInitialRequirements(bedrockResponse);
    console.log(`🎮 [PARSE_AI] Interactive elements: quickReplies=${quickReplies.length}, checkbox=${checkboxOptions.length}, radio=${radioOptions.length}, inputPrompt=${!!inputPrompt}, initialRequirements=${initialRequirements.length}`);

    // Remove all interactive markers from the message
    let cleanedMessage = bedrockResponse
      .replace(/\[QUICK_REPLY:.*?\]/g, '')
      .replace(/\[CHECKBOX:.*?\]/g, '')
      .replace(/\[RADIO:.*?\]/g, '')
      .replace(/\[INPUT_PROMPT:.*?\]/g, '')
      .replace(/\[INITIAL_REQUIREMENTS:.*?\]/sg, '')  // 's' flag for multiline
      .trim();

    // Post-processing: Remove duplicate "Welcome" message if this is NOT the first message
    if (session.conversationHistory.length > 2 && cleanedMessage.match(/Welcome to.*?(Assistant|SoC|Design)/i)) {
      console.warn(`⚠️  [PARSE_AI] Detected "Welcome" message in non-first response (history=${session.conversationHistory.length}). Removing it.`);
      // Remove the welcome sentence and any following line breaks
      cleanedMessage = cleanedMessage
        .replace(/Welcome to.*?\.(\n\n?)?/i, '')
        .replace(/^Let's start by.*?\.(\n\n?)?/i, '')
        .trim();
      console.log(`✅ [PARSE_AI] Cleaned message: "${cleanedMessage.substring(0, 100)}..."`);
    }

    console.log(`✅ [PARSE_AI] Parsing complete: phase=${nextPhase}, components=${suggestedComponents.length}, readyToGenerate=${nextPhase === 'generating'}`);

    return {
      message: cleanedMessage,
      phase: nextPhase,
      suggestedComponents,
      clarificationQuestions,
      quickReplies,
      checkboxOptions,
      radioOptions,
      inputPrompt,
      initialRequirements,
      suggestedRefinements: [],
      readyToGenerate: nextPhase === 'generating',
      sessionId: session.sessionId,
      timestamp: new Date()
    };
  }

  /**
   * Determine next conversation phase
   */
  private determineNextPhase(response: string, session: DesignSession): ConversationPhase {
    const messageCount = session.conversationHistory.length;
    const currentPhase = session.phase;

    console.log(`📊 [DETERMINE_PHASE] Current phase: ${currentPhase}, Message count: ${messageCount}`);

    // Check if user selected "directly generate architecture" option
    const userMessage = session.conversationHistory.length > 0
      ? session.conversationHistory[session.conversationHistory.length - 1].content.toLowerCase()
      : '';

    // Check for explicit generation requests from user
    // "Proceed with Generation" directly triggers generation (no intermediate confirming phase)
    if (userMessage.toLowerCase().includes('proceed with generation') ||
      userMessage.toLowerCase().includes('proceed with update') ||
      userMessage.includes('generate architecture') ||
      userMessage.includes('generate files') ||
      userMessage.includes('generate arch') ||
      userMessage.includes('direct generation') ||
      userMessage.includes('direct architecture')) {
      console.log(`📊 [DETERMINE_PHASE] User selected "Proceed with Generation" → generating (direct generation)`);
      return 'generating';
    }

    // Simplified phase progression: only 2 conversational phases (gathering → refining)
    // The "generating" phase only happens when backend actually generates files
    if (currentPhase === 'gathering' && messageCount >= 4) {
      console.log(`📊 [DETERMINE_PHASE] Enough messages for refining phase (${messageCount} >= 4) → refining`);
      return 'refining';
    }

    console.log(`📊 [DETERMINE_PHASE] No phase change → ${currentPhase}`);
    return currentPhase;
  }

  /**
   * Extract component suggestions from Bedrock response
   */
  private extractComponentSuggestions(
    response: string,
    relevantComponents: ComponentMatch[]
  ): ComponentSuggestion[] {
    console.log(`📦 [EXTRACT_COMPS] Starting component extraction from response`);
    console.log(`📦 [EXTRACT_COMPS] Available relevant components: ${relevantComponents.length}`);

    const suggestions: ComponentSuggestion[] = [];
    const responseLower = response.toLowerCase();

    // Look for component names mentioned in the response
    relevantComponents.forEach(match => {
      const componentName = match.component.name.toLowerCase();
      if (responseLower.includes(componentName)) {
        console.log(`📦 [EXTRACT_COMPS] Found mention of "${match.component.name}" in AI response`);
        suggestions.push({
          component: match.component,
          rationale: `Suggested based on your requirements. ${match.matchReason}`,
          confidence: match.matchScore,
          matchScore: match.matchScore,
          matchReason: match.matchReason
        });
      }
    });

    console.log(`📦 [EXTRACT_COMPS] Found ${suggestions.length} components mentioned in response`);

    // If no specific mentions, include top matches
    if (suggestions.length === 0 && relevantComponents.length > 0) {
      console.log(`📦 [EXTRACT_COMPS] No direct mentions, using top relevant component: ${relevantComponents[0].component.name}`);
      suggestions.push({
        component: relevantComponents[0].component,
        rationale: relevantComponents[0].matchReason,
        confidence: relevantComponents[0].matchScore,
        matchScore: relevantComponents[0].matchScore,
        matchReason: relevantComponents[0].matchReason
      });
    } else if (suggestions.length === 0) {
      console.log(`⚠️  [EXTRACT_COMPS] WARNING: No relevant components available, returning empty suggestions!`);
    }

    const finalSuggestions = suggestions.slice(0, 3); // Max 3 suggestions
    console.log(`📦 [EXTRACT_COMPS] Final suggestions: ${finalSuggestions.length} components`);
    if (finalSuggestions.length > 0) {
      console.log(`📦 [EXTRACT_COMPS] Components: ${finalSuggestions.map(s => s.component.name).join(', ')}`);
    }

    return finalSuggestions;
  }

  /**
   * Extract clarification questions from response
   */
  private extractClarificationQuestions(response: string): string[] {
    const questions: string[] = [];
    const sentences = response.split(/[.!?]+/);

    sentences.forEach(sentence => {
      if (sentence.trim().includes('?')) {
        questions.push(sentence.trim() + '?');
      }
    });

    return questions.slice(0, 3); // Max 3 questions
  }

  /**
   * Extract quick reply options from response
   * Format: [QUICK_REPLY: option1 | option2 | option3]
   */
  private extractQuickReplies(response: string): string[] {
    const quickReplies: string[] = [];
    const match = response.match(/\[QUICK_REPLY:\s*([^\]]+)\]/);

    if (match && match[1]) {
      const options = match[1].split('|')
        .map(opt => opt.trim())
        // Remove leading dash and any whitespace after it
        .map(opt => opt.replace(/^-+\s*/, '').trim())
        .filter(opt => opt.length > 0);
      quickReplies.push(...options);
    }

    return quickReplies;
  }

  /**
   * Extract checkbox options from response
   * Format: [CHECKBOX: option1 | option2 | option3]
   *
   * Also handles malformed formats:
   * - [CHECKBOX: - opt1 | - opt2] -> Remove leading dashes
   * - [CHECKBOX:\n- opt1\n- opt2] -> Handle Markdown list format
   */
  /**
   * Extract initial requirements from first message response
   * Format: [INITIAL_REQUIREMENTS: component1 | component2 x4 | Application: domain]
   */
  private extractInitialRequirements(response: string): string[] {
    const requirements: string[] = [];
    const match = response.match(/\[INITIAL_REQUIREMENTS:\s*([^\]]+)\]/s);

    if (match && match[1]) {
      const content = match[1];

      // Split by pipe separator
      const items = content.split('|')
        .map(item => item.trim())
        .filter(item => item.length > 0);

      requirements.push(...items);
    }

    return requirements;
  }

  private extractCheckboxOptions(response: string): string[] {
    const options: string[] = [];
    const match = response.match(/\[CHECKBOX:\s*([^\]]+)\]/s); // 's' flag for multiline

    if (match && match[1]) {
      let content = match[1];

      // Check if using Markdown list format (newlines with dashes)
      if (content.includes('\n-') || content.includes('\n -')) {
        // Extract lines that start with "-" or " -"
        const lines = content.split('\n')
          .map(line => line.trim())
          .filter(line => line.startsWith('-'))
          .map(line => line.replace(/^-\s*/, '').trim())
          .filter(line => line.length > 0);

        if (lines.length > 0) {
          options.push(...lines);
          return options;
        }
      }

      // Standard pipe-separated format
      const opts = content.split('|')
        .map(opt => opt.trim())
        // Remove leading dash and any whitespace after it
        .map(opt => opt.replace(/^-+\s*/, '').trim())
        .filter(opt => opt.length > 0);
      options.push(...opts);
    }

    return options;
  }

  /**
   * Extract radio options from response
   * Format: [RADIO: option1 | option2 | option3]
   *
   * Also handles malformed formats:
   * - [RADIO: - opt1 | - opt2] -> Remove leading dashes
   * - [RADIO: - opt1 - opt2 - opt3] -> Split by dashes if no pipes
   * - [RADIO:\n- opt1\n- opt2] -> Handle Markdown list format
   */
  private extractRadioOptions(response: string): string[] {
    const options: string[] = [];
    const match = response.match(/\[RADIO:\s*([^\]]+)\]/s); // 's' flag for multiline

    if (match && match[1]) {
      let content = match[1];

      // Check if using Markdown list format (newlines with dashes)
      if (content.includes('\n-') || content.includes('\n -')) {
        // Extract lines that start with "-" or " -"
        const lines = content.split('\n')
          .map(line => line.trim())
          .filter(line => line.startsWith('-'))
          .map(line => line.replace(/^-\s*/, '').trim())
          .filter(line => line.length > 0);

        if (lines.length > 0) {
          options.push(...lines);
          return options;
        }
      }

      // Standard pipe-separated format
      if (content.includes('|')) {
        const opts = content.split('|')
          .map(opt => opt.trim())
          // Remove leading dash and any whitespace after it
          .map(opt => opt.replace(/^-+\s*/, '').trim())
          .filter(opt => opt.length > 0);
        options.push(...opts);
      } else {
        // Fallback: if no pipes, try splitting by dashes (malformed case: "- opt1 - opt2 - opt3")
        // But only if content starts with "-"
        if (content.trim().startsWith('-')) {
          const opts = content.split('-')
            .map(opt => opt.trim())
            .filter(opt => opt.length > 0);

          if (opts.length > 1) {
            options.push(...opts);
          } else {
            // Single option with leading dash
            options.push(content.replace(/^-+\s*/, '').trim());
          }
        } else {
          // No pipes, no dashes - single option
          options.push(content.trim());
        }
      }
    }

    return options;
  }

  /**
   * Extract input prompt from response
   * Format: [INPUT_PROMPT: hint text]
   */
  private extractInputPrompt(response: string): string | null {
    const match = response.match(/\[INPUT_PROMPT:\s*([^\]]+)\]/);
    return match && match[1] ? match[1].trim() : null;
  }

  /**
   * Extract user selections from their message based on previous AI question
   * This preserves context across conversation steps
   * ALSO extracts requirements from free-text messages (not just checkbox/radio responses)
   */
  private extractUserSelections(userMessage: string, session: DesignSession): void {
    console.log(`\n🔍 [EXTRACT_SELECT] === START ===`);
    console.log(`🔍 [EXTRACT_SELECT] User message: "${userMessage.substring(0, 100)}"`);

    // Initialize confirmed selections if not exists
    if (!session.confirmedSelections) {
      session.confirmedSelections = {
        selectedFeatures: [],
        performanceChoices: {},
        detailedParameters: {}
      };
      console.log(`🔍 [EXTRACT_SELECT] Initialized empty confirmedSelections`);
    } else {
      console.log(`🔍 [EXTRACT_SELECT] BEFORE extraction - Existing features: [${session.confirmedSelections.selectedFeatures?.join(', ') || 'none'}]`);
    }

    const userMessageLower = userMessage.toLowerCase();

    // Get the last AI message to see what question was asked
    const lastAIMessage = session.conversationHistory
      .slice()
      .reverse()
      .find(msg => msg.role === 'assistant');

    // CASE 1: User responded to CHECKBOX (feature selection)
    if (lastAIMessage?.metadata?.checkboxOptions && Array.isArray(lastAIMessage.metadata.checkboxOptions)) {
      console.log(`📋 [EXTRACT_SELECT] Detected checkbox response`);
      console.log(`📋 [EXTRACT_SELECT] Available checkbox options: [${lastAIMessage.metadata.checkboxOptions.join(', ')}]`);

      // Parse user's selected features from their message
      const selectedFeatures = lastAIMessage.metadata.checkboxOptions.filter((option: string) =>
        userMessage.includes(option) || userMessageLower.includes(option.toLowerCase())
      );

      console.log(`📋 [EXTRACT_SELECT] Matched features from user message: [${selectedFeatures.join(', ')}]`);

      if (selectedFeatures.length > 0) {
        // Append new selections (don't replace existing ones)
        const existing = session.confirmedSelections.selectedFeatures || [];
        console.log(`📋 [EXTRACT_SELECT] BEFORE append - Existing: [${existing.join(', ')}]`);
        console.log(`📋 [EXTRACT_SELECT] BEFORE append - New: [${selectedFeatures.join(', ')}]`);

        session.confirmedSelections.selectedFeatures = [...new Set([...existing, ...selectedFeatures])];

        console.log(`📋 [EXTRACT_SELECT] AFTER append - Total: [${session.confirmedSelections.selectedFeatures.join(', ')}]`);
        console.log(`📋 [EXTRACT_SELECT] Selected features: ${selectedFeatures.join(', ')}`);
        console.log(`📋 [EXTRACT_SELECT] Total confirmed features: ${session.confirmedSelections.selectedFeatures.join(', ')}`);
      } else {
        console.log(`📋 [EXTRACT_SELECT] No features matched from checkbox options`);
      }
    }

    // CASE 2: User responded to RADIO (performance/option selection)
    if (lastAIMessage?.metadata?.radioOptions && Array.isArray(lastAIMessage.metadata.radioOptions)) {
      console.log(`🔘 [EXTRACT_SELECT] Detected radio response`);

      // Find which radio option the user selected
      const selectedOption = lastAIMessage.metadata.radioOptions.find((option: string) =>
        userMessage.includes(option) || userMessageLower.includes(option.toLowerCase())
      );

      if (selectedOption) {
        // Determine what feature this performance choice is for
        // Look for feature mentions in the last AI message
        const aiMessage = lastAIMessage.content.toLowerCase();
        const features = session.confirmedSelections.selectedFeatures || [];

        let targetFeature: string | null = null;
        for (const feature of features) {
          if (aiMessage.includes(feature.toLowerCase())) {
            targetFeature = feature;
            break;
          }
        }

        if (targetFeature) {
          session.confirmedSelections.performanceChoices![targetFeature] = selectedOption;
          console.log(`🔘 [EXTRACT_SELECT] ${targetFeature}: ${selectedOption}`);
        } else {
          // Generic performance choice
          session.confirmedSelections.performanceChoices!['_general'] = selectedOption;
          console.log(`🔘 [EXTRACT_SELECT] General choice: ${selectedOption}`);
        }
      }
    }

    // CASE 3: Check if user selected "Proceed with Generation"
    // Note: This is handled by phase transition logic, not as a parameter
    // The _proceedWithGeneration flag is NOT added to detailedParameters
    // because it's a UI action, not a feature requirement
    if (userMessageLower.includes('proceed with generation') ||
      userMessageLower.includes('proceed with update') ||
      userMessageLower.includes('直接生成') ||
      userMessageLower.includes('generate architecture')) {
      console.log(`🚀 [EXTRACT_SELECT] User requested architecture generation (handled by phase transition)`);
      // Do NOT add to detailedParameters - this is a UI action, not a requirement
    }

    // CASE 4: FREE-TEXT REQUIREMENT EXTRACTION (NEW!)
    // Extract requirements from user's free-text message when they don't use checkboxes
    // This prevents confirmed requirements from being lost
    console.log(`📝 [EXTRACT_SELECT] Checking for free-text requirements in message`);

    // Component/feature keywords to detect
    const componentKeywords = [
      { pattern: /\b(cpu|processor|core)\b/i, feature: 'CPU Core' },
      { pattern: /\b(memory|ram|ddr|sram)\b/i, feature: 'Memory Controller' },
      { pattern: /\b(wifi|wireless)\b/i, feature: 'WiFi' },
      { pattern: /\b(bluetooth|ble)\b/i, feature: 'Bluetooth' },
      { pattern: /\b(usb)\b/i, feature: 'USB Interface' },
      { pattern: /\b(ethernet|eth)\b/i, feature: 'Ethernet' },
      { pattern: /\b(pcie|pci\s*express)\b/i, feature: 'PCIe' },
      { pattern: /\b(cxl)\b/i, feature: 'CXL Controller' },
      { pattern: /\b(gpu|graphics)\b/i, feature: 'GPU' },
      { pattern: /\b(npu|neural|ai\s*accelerator)\b/i, feature: 'AI Accelerator' },
      { pattern: /\b(dma)\b/i, feature: 'DMA Controller' },
      { pattern: /\b(uart|serial)\b/i, feature: 'UART' },
      { pattern: /\b(spi)\b/i, feature: 'SPI' },
      { pattern: /\b(i2c|iic)\b/i, feature: 'I2C' },
      { pattern: /\b(gpio)\b/i, feature: 'GPIO' },
      { pattern: /\b(timer)\b/i, feature: 'Timer' },
      { pattern: /\b(watchdog|wdt)\b/i, feature: 'Watchdog' },
      { pattern: /\b(rtc|real\s*time\s*clock)\b/i, feature: 'RTC' },
      { pattern: /\b(adc|analog)\b/i, feature: 'ADC' },
      { pattern: /\b(dac)\b/i, feature: 'DAC' },
      { pattern: /\b(pwm)\b/i, feature: 'PWM' },
      { pattern: /\b(can\s*bus|can)\b/i, feature: 'CAN Bus' },
      { pattern: /\b(flash)\b/i, feature: 'Flash Controller' },
      { pattern: /\b(cache)\b/i, feature: 'Cache' },
      { pattern: /\b(interconnect|crossbar|bus)\b/i, feature: 'Interconnect' }
    ];

    const detectedFeatures: string[] = [];
    for (const { pattern, feature } of componentKeywords) {
      if (pattern.test(userMessage)) {
        detectedFeatures.push(feature);
        console.log(`📝 [EXTRACT_SELECT] Detected feature from free text: ${feature}`);
      }
    }

    if (detectedFeatures.length > 0) {
      // Append detected features (don't replace existing ones)
      const existing = session.confirmedSelections.selectedFeatures || [];
      session.confirmedSelections.selectedFeatures = [...new Set([...existing, ...detectedFeatures])];
      console.log(`📝 [EXTRACT_SELECT] Added ${detectedFeatures.length} features from free text`);
      console.log(`📝 [EXTRACT_SELECT] Total confirmed features: ${session.confirmedSelections.selectedFeatures.join(', ')}`);
    } else {
      console.log(`📝 [EXTRACT_SELECT] No component keywords detected in free text`);
    }

    console.log(`🔍 [EXTRACT_SELECT] === END ===`);
    console.log(`🔍 [EXTRACT_SELECT] FINAL STATE - Features: [${session.confirmedSelections.selectedFeatures?.join(', ') || 'none'}]`);
    console.log(`🔍 [EXTRACT_SELECT] FINAL STATE - Performance: ${JSON.stringify(session.confirmedSelections.performanceChoices)}`);
    console.log(`🔍 [EXTRACT_SELECT] FINAL STATE - Parameters: ${JSON.stringify(session.confirmedSelections.detailedParameters)}\n`);
  }

  /**
   * Rebuild confirmedSelections from conversation history
   * This is used when loading old sessions that didn't have confirmedSelections persisted
   */
  private rebuildConfirmedSelectionsFromHistory(session: DesignSession): ConfirmedSelections {
    console.log(`🔧 [REBUILD] Rebuilding confirmedSelections from ${session.conversationHistory.length} messages`);

    const confirmedSelections: ConfirmedSelections = {
      selectedFeatures: [],
      performanceChoices: {},
      detailedParameters: {}
    };

    // Iterate through conversation history and extract all selections
    for (let i = 0; i < session.conversationHistory.length; i++) {
      const msg = session.conversationHistory[i];

      // Extract initialRequirements from AI messages
      if (msg.role === 'assistant' && msg.metadata?.initialRequirements) {
        const reqs = msg.metadata.initialRequirements as string[];
        confirmedSelections.selectedFeatures.push(...reqs);
        console.log(`🔧 [REBUILD] Found ${reqs.length} initial requirements in message ${i}`);
      }

      // Extract user selections from user messages responding to checkboxes
      if (msg.role === 'user' && i > 0) {
        const prevMsg = session.conversationHistory[i - 1];
        if (prevMsg.role === 'assistant' && prevMsg.metadata?.checkboxOptions) {
          const checkboxOptions = prevMsg.metadata.checkboxOptions as string[];
          const userMessageLower = msg.content.toLowerCase();

          const selectedFeatures = checkboxOptions.filter((option: string) =>
            msg.content.includes(option) || userMessageLower.includes(option.toLowerCase())
          );

          if (selectedFeatures.length > 0) {
            confirmedSelections.selectedFeatures.push(...selectedFeatures);
            console.log(`🔧 [REBUILD] Found ${selectedFeatures.length} checkbox selections in message ${i}`);
          }
        }
      }
    }

    // Remove duplicates
    confirmedSelections.selectedFeatures = [...new Set(confirmedSelections.selectedFeatures)];
    console.log(`✅ [REBUILD] Rebuilt ${confirmedSelections.selectedFeatures.length} total features`);

    return confirmedSelections;
  }

  /**
   * Update session state from AI response
   */
  private updateSessionFromResponse(session: DesignSession, response: ChatResponse): void {
    console.log(`📝 [UPDATE_SESSION] Updating session with AI response`);
    console.log(`📝 [UPDATE_SESSION] Suggested components: ${response.suggestedComponents?.length || 0}`);

    // Update architecture with suggested components
    if (response.suggestedComponents && response.suggestedComponents.length > 0) {
      const hadArchitecture = !!session.currentArchitecture;
      const oldComponentCount = session.currentArchitecture?.selectedComponents?.length || 0;

      if (!session.currentArchitecture) {
        console.log(`📝 [UPDATE_SESSION] Initializing new architecture structure`);
        session.currentArchitecture = {
          naturalLanguageSpec: '',
          selectedComponents: [],
          customComponents: [],
          performanceRequirements: [],
          constraints: [],
          designDecisions: [],
          componentRationale: []
        };
      }

      // Add new component suggestions (don't duplicate)
      let addedCount = 0;
      response.suggestedComponents.forEach(suggestion => {
        const exists = session.currentArchitecture!.selectedComponents
          .some(comp => comp.id === suggestion.component.id);

        if (!exists) {
          console.log(`📝 [UPDATE_SESSION] Adding component: ${suggestion.component.name} (${suggestion.component.id})`);
          session.currentArchitecture!.selectedComponents.push(suggestion.component);
          session.currentArchitecture!.componentRationale.push({
            componentId: suggestion.component.id,
            reason: suggestion.rationale,
            benefits: [],
            tradeoffs: [],
            alternatives: []
          });
          addedCount++;
        } else {
          console.log(`📝 [UPDATE_SESSION] Component already exists: ${suggestion.component.name}`);
        }
      });

      const newComponentCount = session.currentArchitecture.selectedComponents.length;
      console.log(`📝 [UPDATE_SESSION] Architecture updated: ${oldComponentCount} → ${newComponentCount} components (added ${addedCount})`);
      console.log(`📝 [UPDATE_SESSION] Architecture now exists: ${!hadArchitecture ? 'newly created' : 'updated'}`);
    } else {
      console.log(`⚠️  [UPDATE_SESSION] No components to add - architecture unchanged`);
      if (!session.currentArchitecture) {
        console.log(`⚠️  [UPDATE_SESSION] WARNING: No architecture exists and no components added! This will prevent generation.`);
      }
    }
  }

  /**
   * Get session by ID (with lazy loading from DynamoDB)
   */
  async getSession(sessionId: string): Promise<DesignSession | undefined> {
    // Check cache first
    let session = this.sessions.get(sessionId);
    if (session) {
      return session;
    }

    // Lazy load from DynamoDB
    const loadedSession = await this.persistence.loadSession(sessionId);
    if (loadedSession) {
      // Cache in memory
      this.sessions.set(sessionId, loadedSession);
      return loadedSession;
    }

    return undefined;
  }

  /**
   * List all sessions
   */
  getAllSessions(): DesignSession[] {
    return Array.from(this.sessions.values());
  }

  /**
   * Get sessions by project ID (efficient DynamoDB query)
   */
  async getSessionsByProjectId(projectId: string): Promise<DesignSession[]> {
    // Query DynamoDB directly (more efficient than loading all sessions)
    return await this.persistence.getSessionsByProjectId(projectId, 50);
  }

  /**
   * Delete a session
   */
  async deleteSession(sessionId: string): Promise<boolean> {
    const deleted = this.sessions.delete(sessionId);
    if (deleted) {
      // Also delete from disk
      await this.persistence.deleteSession(sessionId);
    }
    return deleted;
  }

  /**
   * Generate architecture specification (arch_spec.md)
   * Creates natural language overview of the architecture
   */
  /**
   * Generate simple initial arch_spec.md (requirements + components + basic connections)
   */
  async generateArchSpec(sessionId: string): Promise<string> {
    console.log(`📝 [GEN_SPEC] Starting simple arch_spec.md generation for session ${sessionId}`);

    const session = await this.getSession(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    const architecture = session.currentArchitecture;
    if (!architecture) {
      throw new Error('No architecture defined in session');
    }

    console.log(`📝 [GEN_SPEC] Session requirements: ${session.requirements.length}, constraints: ${session.constraints.length}`);
    console.log(`📝 [GEN_SPEC] Architecture components: ${architecture.selectedComponents?.length || 0}`);

    // Collect all requirements
    const allRequirements = new Set<string>();
    session.requirements.forEach(req => allRequirements.add(req));
    if (session.confirmedSelections?.selectedFeatures) {
      session.confirmedSelections.selectedFeatures.forEach(feature => allRequirements.add(feature));
    }

    // Build simple spec
    let spec = '# SoC Architecture Specification\n\n';

    spec += '## Overview\n';
    spec += `This SoC architecture was designed through an interactive conversation process.\n`;
    spec += `Generated on: ${new Date().toISOString()}\n\n`;

    if (allRequirements.size > 0) {
      spec += '## Requirements\n';
      Array.from(allRequirements).forEach(req => {
        spec += `- ${req}\n`;
      });
      spec += '\n';
    }

    if (session.constraints.length > 0) {
      spec += '## Constraints\n';
      session.constraints.forEach(constraint => {
        spec += `- ${constraint}\n`;
      });
      spec += '\n';
    }

    if (architecture.selectedComponents && architecture.selectedComponents.length > 0) {
      spec += '## Components\n\n';
      architecture.selectedComponents.forEach(component => {
        spec += `### ${component.name}\n`;
        spec += `- **Type:** ${component.type}\n`;
        if (component.description) {
          spec += `- **Description:** ${component.description}\n`;
        }
        spec += '\n';
      });
    }

    if (architecture.connections && architecture.connections.length > 0) {
      spec += '## Connections\n\n';
      architecture.connections.forEach((conn: any) => {
        spec += `- ${conn.source} → ${conn.target} (${conn.type || conn.protocol || 'N/A'})\n`;
      });
      spec += '\n';
    }

    console.log(`✅ [GEN_SPEC] Simple spec generated (${spec.length} chars)`);
    return spec;
  }

  /**
   * Refine arch_spec.md with use cases, data flows, and detailed connection descriptions
   * Based on industry best practices and common design patterns
   */
  async refineArchSpec(
    sessionId: string,
    initialSpec: string,
    maxIterations: number = 5,
    qualityThreshold: number = 80
  ): Promise<string> {
    console.log(`🔍 [REFINE_SPEC] Starting spec refinement (max ${maxIterations} iterations, threshold: ${qualityThreshold})`);

    let currentSpec = initialSpec;
    let iteration = 0;

    while (iteration < maxIterations) {
      iteration++;
      console.log(`\n📊 [REFINE_SPEC] Iteration ${iteration}/${maxIterations}`);

      const refinePrompt = `You are an expert SoC architect. Refine the architecture specification by adding use cases, data flows, and detailed connection descriptions based on industry best practices.

CURRENT SPEC (Iteration ${iteration}):
${currentSpec}

═══════════════════════════════════════════════════════════════
CRITICAL ARCHITECTURAL PRINCIPLES - READ CAREFULLY:
═══════════════════════════════════════════════════════════════

**PRINCIPLE 1: Minimal Necessary Inference (with Mandatory Interconnects)**
- ✅ ONLY infer components that are ABSOLUTELY NECESSARY for basic connectivity
- ✅ Infrastructure components (interconnects, bridges) are MANDATORY when needed:
  * If multiple masters need to access one slave → MUST add crossbar/arbiter
  * If one master needs to access multiple slaves → MUST add crossbar/multiplexer
  * If protocol conversion needed → MUST add bridge
  * These are NOT optional - they are REQUIRED for valid connections
- ❌ DO NOT infer optional/extended features not explicitly requested
- ❌ DO NOT add peripheral modules, accelerators, or features beyond basic requirements
- Example CORRECT: User has 3 CPUs + 1 Memory → MUST add crossbar (3 masters to 1 slave requires arbitration)
- Example WRONG: User has CPU + Memory → Adding GPU, DSP (not requested)

**PRINCIPLE 2: Data Flow Initiators and Targets**
- ✅ Data flows MUST start from I/O modules OR processor/CPU modules (initiators)
- ✅ Data flows MUST end at I/O modules OR processor/CPU modules (targets)
- ❌ NEVER start or end data flows at intermediate/infrastructure modules
- ❌ Interconnects, bridges, crossbars are PASS-THROUGH only, not initiators/targets
- Example CORRECT: "CPU → Interconnect → Memory" (CPU is initiator, Memory is target)
- Example WRONG: "Interconnect → CPU → Memory" (Interconnect cannot be initiator)

**PRINCIPLE 3: Interconnects are Internal Infrastructure**
- ✅ Interconnects (NoC/Crossbar/Bus) are inferred in the MIDDLE of the design
- ✅ They connect internal components together (CPU ↔ Memory, CPU ↔ Peripherals)
- ❌ Interconnects are NOT at the boundary/edge with I/O modules
- ❌ DO NOT place interconnects between external I/O and internal components
- Example: CPU ↔ Interconnect ↔ Memory (interconnect in middle, not at I/O boundary)

**PRINCIPLE 4: Port Sharing Resolution (CRITICAL - Prevents DRC Violations)**
- ✅ NEVER allow multiple connections to the same port at design level
- ✅ If multiple masters need one slave → MUST add crossbar/arbiter in spec
- ✅ If one master needs multiple slaves → MUST add crossbar/multiplexer in spec
- ✅ Crossbars/interconnects have sufficient ports for all connections
- ❌ DO NOT create direct N-to-1 or 1-to-N connections (causes DRC violations)
- ❌ DO NOT add extra I/O modules to solve port sharing issues
- Example CORRECT: "3 CPUs + Crossbar (3 slave ports, 1 master port) + Memory"
- Example WRONG: "3 CPUs → Memory" (3 connections to same Memory port - INVALID)

**PRINCIPLE 5: Component Necessity Check**
Before including ANY component in use cases or data flows, ask:
1. Is this component explicitly requested by user? → Include it
2. Is this component NECESSARY for basic connectivity? → Include it only if answer is YES
3. Is this an optional/extended feature? → EXCLUDE it
4. Would the system still function without it? → If YES, EXCLUDE it

═══════════════════════════════════════════════════════════════

TASK: Enhance the specification with:

1. **Use Cases and Data Flows** section (if missing or incomplete):
   - Identify use cases based ONLY on explicitly requested components
   - For each use case, describe data flows following PRINCIPLE 2:
     * Flow #N: [I/O or CPU Initiator] → Interconnect(s) → [I/O or CPU Target]
     * NEVER start/end flows at interconnects or bridges
     * Processing at each stage (input at initiator, pass-through at interconnect, output at target)
     * Bandwidth and latency requirements
   - DO NOT infer use cases for components not explicitly requested
   - Example CORRECT: "CPU reads from DDR Memory: CPU → AXI Crossbar → DDR Controller → DDR Memory"
   - Example WRONG: "Crossbar initiates DMA transfer" (crossbar cannot initiate)

2. **Detailed Connection Descriptions** (enhance existing Connections section):
   - Group connections by purpose (e.g., "Memory Access Path", "Peripheral Control Path")
   - For each group, specify:
     * Components involved (ONLY necessary components)
     * Reference to data flow (with correct initiator/target)
     * Protocol details (AXI4, APB, etc.)
     * Interface specifications (master/slave, width, speed)
     * Bandwidth requirements
     * Interconnect details (crossbar, NoC, bridges) - positioned in MIDDLE, not at boundaries
   
   **CRITICAL - Port Count and Connection Format Rules:**
   
   **Rule 1: Preserve Component Library Port Counts**
   - ✅ NEVER change the number of ports/interfaces defined in the component library
   - ✅ If a component has 2 master ports in the library, it MUST have exactly 2 in the design
   - ❌ DO NOT add or remove ports from library components when instantiating
   - Example: If "ARM Cortex-A53" has 1 AXI master port in library, use exactly 1 in design
   
   **Rule 2: Use Interconnection Modules for 1-to-N or N-to-1 Connections**
   - ✅ For 1-to-N connections: Use multiplexer/crossbar/bridge/NoC as intermediate module
   - ✅ For N-to-1 connections: Use arbiter/crossbar/bridge/NoC as intermediate module
   - ✅ ONLY interconnection modules (crossbar, NoC, bridge, multiplexer, arbiter) allow internal 1-to-N or N-to-1
   - ❌ NEVER create 1-to-N or N-to-1 connections at the design level (between regular components)
   - Example CORRECT: "CPU → Crossbar (1-to-3 internal) → Memory, Peripheral, DMA"
   - Example WRONG: "CPU → Memory, Peripheral, DMA" (direct 1-to-3 not allowed)
   
   **Rule 3: Direct Connection Format**
   - ✅ Format: "From [Node A]'s [interface_name] to [Node B]'s [interface_name]"
   - ✅ Always specify exact interface names from component library
   - ✅ Example: "From CPU_0's axi_master_0 to DDR_Controller's axi_slave"
   - ❌ DO NOT use vague descriptions like "CPU connects to Memory"
   
   **Rule 4: Indirect Connection Format (via Interconnect)**
   - ✅ Format: "From [Node A]'s [interface_name], via [Node B]'s [input_interface] and [output_interface], to [Node C]'s [interface_name]"
   - ✅ Specify both input and output interfaces of the intermediate module
   - ✅ Example: "From CPU_0's axi_master_0, via Crossbar's slave_port_0 and master_port_1, to Memory's axi_slave"
   - ❌ DO NOT omit intermediate module interface names
   
   **Rule 5: Design-Level Connection Restrictions**
   - ✅ At design level, ONLY 1-to-1 connections are allowed (except for interconnection modules)
   - ✅ Interconnection modules (crossbar/NoC/bridge/mux/arbiter) handle internal fan-out/fan-in
   - ❌ Regular components (CPU, Memory, Peripheral, etc.) CANNOT have 1-to-N or N-to-1 at design level
   - Example: If 3 masters need to access 1 slave, insert a crossbar between them

3. **Performance Analysis** section (if missing):
   - Expected throughput for explicitly requested components only
   - Latency characteristics for actual data paths
   - Potential bottlenecks in necessary infrastructure

**VALIDATION CHECKLIST:**
Before finalizing, verify:
- [ ] All data flows start from I/O or CPU (not interconnects)
- [ ] All data flows end at I/O or CPU (not interconnects)
- [ ] Interconnects are positioned in the middle (not at boundaries)
- [ ] NO optional/extended features inferred beyond user requirements
- [ ] Component port counts match library definitions (not modified)
- [ ] All direct connections use format: "From [Node A]'s [interface] to [Node B]'s [interface]"
- [ ] All indirect connections use format: "From [A]'s [if], via [B]'s [in] and [out], to [C]'s [if]"
- [ ] NO 1-to-N or N-to-1 connections at design level (only via interconnects)
- [ ] Interconnection modules (crossbar/NoC/bridge) used for fan-out/fan-in
- [ ] Only NECESSARY components included in use cases

EVALUATION CRITERIA (Score 0-100):
- Architectural Principles Compliance (25 points): Follows all 5 principles above?
- Data Flow Correctness (20 points): Initiators/targets are I/O or CPU only?
- Port Count Preservation (20 points): Component ports match library definitions?
- Connection Format (20 points): Uses correct format with interface names?
- Design-Level Restrictions (15 points): No 1-to-N/N-to-1 except via interconnects?

RESPONSE FORMAT - Return ONLY valid JSON:
{
  "score": <number 0-100>,
  "refined": <boolean, true if score >= ${qualityThreshold}>,
  "refinedSpec": "<complete refined spec in markdown>",
  "improvements": ["List of improvements made"],
  "remainingIssues": ["List of issues still to address"]
}

Return ONLY the JSON, no other text.`;

      try {
        const refineResponse = await this.callBedrock(refinePrompt);

        // Extract JSON
        let jsonStr = refineResponse.trim();
        if (jsonStr.startsWith('```json')) jsonStr = jsonStr.substring(7);
        if (jsonStr.startsWith('```')) jsonStr = jsonStr.substring(3);
        if (jsonStr.endsWith('```')) jsonStr = jsonStr.substring(0, jsonStr.length - 3);
        jsonStr = jsonStr.trim();

        const result = JSON.parse(jsonStr);
        const score = result.score || 0;
        const refined = result.refined || false;

        console.log(`📊 [REFINE_SPEC] Quality Score: ${score}/100 (threshold: ${qualityThreshold})`);
        console.log(`📊 [REFINE_SPEC] Status: ${refined ? '✅ REFINED' : '❌ NEEDS WORK'}`);

        if (result.improvements && result.improvements.length > 0) {
          console.log(`   ✅ Improvements: ${result.improvements.join(', ')}`);
        }
        if (result.remainingIssues && result.remainingIssues.length > 0) {
          console.log(`   ⚠️  Remaining issues: ${result.remainingIssues.join(', ')}`);
        }

        // Save intermediate iteration to S3 (spec only, not diagram)
        if (result.refinedSpec) {
          currentSpec = result.refinedSpec;
          await this.saveIntermediateFiles(sessionId, 'refine_spec', iteration, currentSpec, null);
        }

        // If quality threshold met, we're done
        if (refined && score >= qualityThreshold) {
          console.log(`✅ [REFINE_SPEC] Spec refinement completed (score: ${score}/${qualityThreshold})`);
          return currentSpec;
        }

        // Continue to next iteration
        continue;

      } catch (error) {
        console.error(`❌ [REFINE_SPEC] Iteration ${iteration} failed:`, error);
        if (iteration >= maxIterations) {
          console.warn(`⚠️  [REFINE_SPEC] Max iterations reached, returning current spec`);
          return currentSpec;
        }
      }
    }

    console.log(`⚠️  [REFINE_SPEC] Max iterations (${maxIterations}) reached`);
    return currentSpec;
  }

  /**
   * Generate basic architecture diagram JSON (arch_diagram.json) without DRC validation
   * Creates structured diagram with components, connections, and layout
   */
  async generateArchDiagramBasic(sessionId: string): Promise<any> {
    console.log(`📊 [GEN_DIAGRAM_BASIC] Starting basic arch_diagram.json generation for session ${sessionId}`);

    const session = await this.getSession(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    const architecture = session.currentArchitecture;
    if (!architecture) {
      throw new Error('No architecture defined in session');
    }

    console.log(`📊 [GEN_DIAGRAM_BASIC] Architecture has ${architecture.selectedComponents?.length || 0} components`);

    // Build basic diagram structure without DRC validation
    return this.buildDiagramFallback(architecture);
  }

  /**
   * Run DRC validation on existing diagram with iterative fixes
   */
  async runDRCValidationOnDiagram(sessionId: string, diagram: any): Promise<any> {
    console.log(`🔍 [DRC_VALIDATION] Starting DRC validation for session ${sessionId}`);

    try {
      const session = await this.getSession(sessionId);
      if (!session) {
        throw new Error(`Session ${sessionId} not found`);
      }

      const architecture = session.currentArchitecture;
      if (!architecture) {
        throw new Error('No architecture defined in session');
      }

      // Normalize diagram format before DRC check to ensure it has both nodes/edges and components/connections
      const normalizedDiagram = this.normalizeDiagramFormat(diagram);
      console.log(`📐 [DRC_VALIDATION] Diagram normalized: ${normalizedDiagram.nodes?.length || 0} nodes, ${normalizedDiagram.edges?.length || 0} edges`);

      // Import DRC generation service
      const { AIGenerationWithDRC } = await import('./ai-generation-with-drc');

      // Get max DRC iterations from environment or use default (5)
      const maxDrcIterations = process.env.MAX_DRC_ITERATIONS
        ? parseInt(process.env.MAX_DRC_ITERATIONS, 10)
        : 5;

      const drcGenerator = new AIGenerationWithDRC(maxDrcIterations);

      console.log(`🎯 [DRC_VALIDATION] Running DRC validation (max ${maxDrcIterations} iterations)...`);

      // Run DRC validation on the normalized diagram
      const result = await drcGenerator.validateAndFixDiagram(normalizedDiagram, sessionId);

      if (!result.success) {
        console.warn('⚠️  [DRC_VALIDATION] DRC validation completed with remaining violations:');
        console.warn(`   Critical: ${result.drcResult?.summary.critical || 0}`);
        console.warn(`   Warnings: ${result.drcResult?.summary.warning || 0}`);
        console.warn(`   Info: ${result.drcResult?.summary.info || 0}`);
        console.warn(`   Iterations: ${result.iterations}`);

        if (result.errors && result.errors.length > 0) {
          console.warn('   Errors during fixes:', result.errors);
        }
      } else {
        console.log('✅ [DRC_VALIDATION] DRC validation passed');
        console.log(`   Iterations: ${result.iterations}`);
        console.log(`   Critical: ${result.drcResult?.summary.critical || 0}`);
        console.log(`   Warnings: ${result.drcResult?.summary.warning || 0}`);
        console.log(`   Info: ${result.drcResult?.summary.info || 0}`);
      }

      // Store DRC result in session
      session.drcResult = {
        passed: result.success,
        summary: result.drcResult?.summary,
        iterations: result.iterations,
        errors: result.errors,
      };
      await this.persistence.saveSession(session);

      // Return the validated/fixed diagram (ensure it's normalized)
      return result.architecture ? this.normalizeDiagramFormat(result.architecture) : normalizedDiagram;

    } catch (error) {
      console.error(`❌ [DRC_VALIDATION] DRC validation failed with error:`, error);
      console.error(`   Error type: ${error instanceof Error ? error.constructor.name : typeof error}`);
      console.error(`   Error message: ${error instanceof Error ? error.message : String(error)}`);

      // Store error in session but continue flow
      const session = await this.getSession(sessionId);
      if (session) {
        session.drcResult = {
          passed: false,
          summary: { critical: 0, warning: 0, info: 0 },
          iterations: 0,
          errors: [error instanceof Error ? error.message : String(error)],
        };
        await this.persistence.saveSession(session);
      }

      // Emit error progress but don't throw - allow flow to continue
      this.progressTracker.emitStage(
        sessionId,
        'drc_check',
        `DRC check skipped due to error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        75,
        {
          error: true,
          errorMessage: error instanceof Error ? error.message : String(error)
        }
      );

      // Return the input diagram unchanged (normalized)
      console.log(`⚠️  [DRC_VALIDATION] Continuing with diagram despite DRC error`);
      return this.normalizeDiagramFormat(diagram);
    }
  }

  /**
   * Fallback diagram builder (without DRC)
   */
  private buildDiagramFallback(architecture: any): any {
    const nodes: any[] = [];
    const edges: any[] = [];

    // Add nodes (components) with layout positions
    if (architecture.selectedComponents) {
      architecture.selectedComponents.forEach((component: any, index: number) => {
        const col = index % 3;
        const row = Math.floor(index / 3);

        const nodeWidth = component.visualization?.width || 180;
        const nodeHeight = component.visualization?.height || 100;

        nodes.push({
          id: component.id,
          type: 'dynamicNode',
          position: {
            x: 100 + (col * 350),
            y: 100 + (row * 200)
          },
          data: {
            label: component.name,
            model_type: component.type,
            componentId: component.id,
            iconName: component.visualization?.icon || 'Box',
            interfaces: component.interfaces || [],  // CRITICAL: Copy interfaces array
            width: nodeWidth,
            height: nodeHeight,
            target_addr_base: component.addressMapping?.baseAddress || '',
            target_addr_space: component.addressMapping?.addressSpace || '',
            visualization: component.visualization || { icon: 'Box', width: nodeWidth, height: nodeHeight },
            createdAt: component.createdAt || new Date().toISOString(),
            updatedAt: component.updatedAt || new Date().toISOString(),
            ...component.properties
          },
          width: nodeWidth,
          height: nodeHeight
        });
      });
    }

    // Add edges (connections)
    if (architecture.connections) {
      architecture.connections.forEach((conn: any, index: number) => {
        edges.push({
          id: `edge-${index + 1}`,
          source: conn.sourceComponentId || conn.source,
          target: conn.targetComponentId || conn.target,
          type: 'smoothstep',
          label: conn.connectionType || conn.type || '',
          animated: false,
          sourceHandle: conn.sourceInterface,
          targetHandle: conn.targetInterface
        });
      });
    }

    // Return complete structure with standardized metadata
    return this.addStandardMetadata({
      nodes,
      edges,
      components: nodes,  // Alias for API compatibility
      connections: edges  // Alias for API compatibility
    });
  }

  /**
   * Add standardized metadata to diagram
   * Ensures consistent format across all diagram generation flows
   */
  private addStandardMetadata(diagram: any): any {
    return {
      ...diagram,
      metadata: {
        generatedAt: new Date().toISOString(),
        version: '1.0',
        source: 'conversation',
        componentCount: diagram.nodes?.length || diagram.components?.length || 0,
        connectionCount: diagram.edges?.length || diagram.connections?.length || 0
      }
    };
  }

  /**
   * Enrich architecture with AI-inferred connections based on conversation
   * Now uses RAG to find similar architecture templates for guidance
   */
  private async enrichArchitectureFromConversation(sessionId: string): Promise<void> {
    const session = await this.getSession(sessionId);
    if (!session) {
      console.warn(`⚠️  [ENRICH_ARCH] Session ${sessionId} not found`);
      return;
    }

    // Create initial architecture if it doesn't exist
    if (!session.currentArchitecture) {
      console.log(`📦 [ENRICH_ARCH] No existing architecture, creating new one from conversation`);
      session.currentArchitecture = {
        naturalLanguageSpec: '',
        selectedComponents: [],
        customComponents: [],
        performanceRequirements: [],
        constraints: [],
        designDecisions: [],
        componentRationale: [],
        connections: [],
        metadata: {
          createdAt: new Date().toISOString(),
          source: 'ai_inference'
        }
      };
    }

    const architecture = session.currentArchitecture!; // Non-null assertion: we just created it above if it didn't exist
    const components = architecture.selectedComponents || [];

    // Allow AI to infer components even if none are currently selected
    console.log(`🔍 [ENRICH_ARCH] Starting with ${components.length} existing components`);
    if (components.length === 0) {
      console.log(`🤖 [ENRICH_ARCH] No components yet, AI will infer from conversation`);
    }

    // Build conversation summary (full history for better RAG matching)
    const conversationSummary = session.conversationHistory
      .map(msg => `${msg.role}: ${msg.content}`)
      .join('\n');

    // Extract user's original requirement (skip greetings)
    const originalRequirement = (() => {
      const substantialMsg = session.conversationHistory.find(msg =>
        msg.role === 'user' &&
        msg.content.length > 20 &&
        !msg.content.toLowerCase().match(/^(hi|hello|hey|good|thanks|ok|yes|no)\b/)
      );
      return substantialMsg?.content || session.conversationHistory.find(msg => msg.role === 'user')?.content || '';
    })();

    console.log(`📄 [ENRICH_ARCH] Original requirement: "${originalRequirement.substring(0, 100)}..."`);

    // ========================================
    // RAG STEP 1: Search Similar Templates
    // ========================================
    const { ArchitectureExamplesService } = await import('./architecture-examples');
    const examplesService = ArchitectureExamplesService.getInstance();
    const similarArchitectures = await examplesService.searchSimilarArchitectures(
      originalRequirement,
      conversationSummary
    );

    console.log(`🔍 [RAG Templates] Found ${similarArchitectures.length} similar architecture templates`);
    similarArchitectures.forEach((arch, idx) => {
      console.log(`   ${idx + 1}. ${arch.name} (${arch.useCases?.join(', ') || 'General Purpose'})`);
    });

    // ========================================
    // RAG STEP 2: Search Available Components
    // ========================================
    // Extract search terms from requirement and conversation
    const searchTerms = this.extractSearchTerms(originalRequirement + ' ' + conversationSummary, {
      requirements: session.requirements,
      constraints: session.constraints,
      targetApplications: [],
      performanceNeeds: [],
      powerRequirements: [],
      currentComponents: components,
      phase: session.phase
    });

    console.log(`🔍 [RAG Components] Searching component library with terms: ${searchTerms.join(', ')}`);
    const availableComponents = await this.componentLibrary.searchComponents(searchTerms);

    console.log(`🔍 [RAG Components] Found ${availableComponents.length} matching components from library`);
    availableComponents.slice(0, 10).forEach((match, idx) => {
      console.log(`   ${idx + 1}. ${match.component.name} (${match.component.category}, score: ${match.matchScore.toFixed(2)})`);
    });

    // Format RAG templates for AI prompt
    const ragTemplatesContext = similarArchitectures.length > 0
      ? `
REFERENCE ARCHITECTURE TEMPLATES (Use these as guidance):
${similarArchitectures.map((arch, idx) => {
        // Extract component info from diagram nodes
        const nodes = arch.diagram?.nodes || [];
        const edges = arch.diagram?.edges || [];

        const componentSummary = nodes.slice(0, 3).map(n =>
          `- ${n.data?.label || n.id} (${n.data?.model_type || 'Component'})`
        ).join('\n');

        const connectionSummary = edges.slice(0, 3).map(e => {
          const sourceNode = nodes.find(n => n.id === e.source);
          const targetNode = nodes.find(n => n.id === e.target);
          return `- ${sourceNode?.data?.label || e.source} → ${targetNode?.data?.label || e.target}${e.label ? ` (${e.label})` : ''}`;
        }).join('\n');

        return `
Template ${idx + 1}: ${arch.name}
Description: ${arch.description}
Use Cases: ${arch.useCases?.join(', ') || 'General Purpose'}
Components: ${nodes.length}
Connections: ${edges.length}

Example Components:
${componentSummary || '  (No component details available)'}

Example Connections:
${connectionSummary || '  (No connection details available)'}
`;
      }).join('\n')}

**IMPORTANT**: ${similarArchitectures.length > 0 && similarArchitectures[0].useCases?.some(uc =>
        originalRequirement.toLowerCase().includes(uc.toLowerCase())
      )
        ? `The top template "${similarArchitectures[0].name}" is a STRONG MATCH for the user's requirement. Use it as primary reference for connection patterns and topology.`
        : `Use these templates as HEURISTIC INSPIRATION to generate appropriate connections. Adapt the patterns to match the user's specific requirements.`}
`
      : `
NO CLOSE TEMPLATE MATCH FOUND - Use general SoC design principles:
- Connect masters (CPU, DMA) to slaves (Memory, Peripherals) via appropriate interconnects
- Use AXI Crossbar for multi-master scenarios
- Use APB Bridge for low-bandwidth peripherals
- Ensure protocol compatibility (AXI4 ↔ AXI4, APB ↔ APB)
`;

    // Schema constraints from golden templates
    const schemaConstraints = `
═══════════════════════════════════════════════════════════════
COMPONENT & DIAGRAM SCHEMA (STRICT CONTRACT - MUST FOLLOW)
═══════════════════════════════════════════════════════════════

**COMPONENT SCHEMA**:

Required Component Fields:
- id: string (format: "{type}-{name}-{version}", e.g., "pcie-gen4-x16-001", kebab-case)
- name: string (human-readable display name)
- category: "CPU" | "Memory" | "Interconnect" | "IO" | "Accelerator" | "Custom"
- version: string (semver format: "1.0.0")
- createdAt: string (ISO 8601 timestamp)
- updatedAt: string (ISO 8601 timestamp)
- interfaces: Interface[] (at least 1 interface required)

Required Interface Fields (within each interface):
- id: string (kebab-case, e.g., "axi-master", "ddr-channel-0")
- name: string (human-readable interface name)
- direction: "master" | "slave" | "in" | "out" | "input" | "output" | "bidirectional"
- busType: "PCIe" | "DDR" | "AXI4" | "AXI4-Lite" | "AXI4-Stream" | "AHB" | "APB" | "GPIO" | "SPI" | "I2C" | "UART" | "Ethernet" | "WiFi" | "USB" | "CXL" | "Custom"
- dataWidth: number (REQUIRED, data bus width in bits, e.g., 32, 64, 128, 256)
- speed: string (REQUIRED, default: "1 GHz", examples: "1.5 GHz", "16 GT/s", "10 Gbps")

Optional Interface Fields:
- addrWidth: number (address bus width in bits, e.g., 32, 40, 64)
- idWidth: number (ID width for AXI protocols, e.g., 4, 6, 8)
- placement: "north" | "south" | "east" | "west" (visual placement on node)
- voltage: string (operating voltage, e.g., "1.8V", "3.3V")
- optional: boolean (whether interface is optional, default: false)

**DIAGRAM TEMPLATE SCHEMA**:

Required Node Fields:
- id: string (unique node ID, kebab-case)
- type: "dynamicNode" (always use this for component nodes)
- position: { x: number, y: number } (canvas coordinates in pixels)
- data: object (see required data fields below)

Required Node Data Fields:
- label: string (display label for this node instance)
- model_type: "CPU" | "Memory" | "Interconnect" | "IO" | "Accelerator" | "Custom"
- iconName: string (Lucide icon name: "Cpu", "Network", "Database", "Zap", "Cable", "HardDrive")
- componentId: string (reference to component in library)

Required Edge Fields:
- id: string (unique edge ID)
- source: string (source node ID)
- target: string (target node ID)
- type: string (edge type, e.g., "smoothstep", "straight")
- sourceHandle: string (source interface ID)
- targetHandle: string (target interface ID)

**CRITICAL VALIDATION RULES**:
1. ❌ NEVER omit dataWidth or speed from interfaces - they are MANDATORY
2. ❌ NEVER use undefined/null for dataWidth or speed
3. ✅ ALWAYS provide dataWidth as a number (e.g., 64, not "64")
4. ✅ ALWAYS provide speed as a string with units (e.g., "1 GHz", not just "1")
5. ✅ ALWAYS use valid enum values for direction, busType, category
6. ✅ ALWAYS use kebab-case for IDs (e.g., "pcie-gen4-x16-001", not "PCIe_Gen4_x16_001")
7. ✅ ALWAYS use ISO 8601 format for timestamps

**DEFAULT VALUES** (use if user doesn't specify):
- dataWidth: 64 (for most bus interfaces)
- speed: "1 GHz" (standard default clock)
- direction: Infer from context (CPU→Memory = master→slave)
- placement: Distribute evenly (north, south, east, west)

═══════════════════════════════════════════════════════════════
`;

    // Format available components from library for AI prompt
    const availableComponentsContext = availableComponents.length > 0
      ? `
AVAILABLE COMPONENTS FROM LIBRARY (Top ${Math.min(20, availableComponents.length)} matches):
${availableComponents.slice(0, 20).map((match, idx) => {
        const comp = match.component;
        const interfaces = comp.interfaces?.slice(0, 3).map(i =>
          `    - ${i.name} (${i.type || i.protocol}, ${i.direction}${i.width ? `, ${i.width}-bit` : ''})`
        ).join('\n') || '    - No interfaces';

        return `${idx + 1}. ${comp.name} (ID: ${comp.id})
   Category: ${comp.category} | Type: ${comp.type}
   Match Score: ${match.matchScore.toFixed(2)} | Reason: ${match.matchReason}
   Key Interfaces:
${interfaces}`;
      }).join('\n\n')}

**IMPORTANT - Component Selection Rules**:
1. ✅ **REUSE**: Prefer selecting components from the library above (use exact componentId)
2. ✅ **CUSTOMIZE**: If library component needs modification, reference it and specify changes
3. ✅ **INSPIRED**: If no exact match, base new component on similar library component
4. ❌ **NEVER**: Create components from scratch without referencing library
`
      : `
NO MATCHING COMPONENTS FOUND IN LIBRARY
- Design components based on common SoC patterns
- Ensure realistic interface definitions
`;

    // Build currently selected components list (if any from conversation)
    const selectedComponentsList = components.length > 0 ? components.map((comp, idx) => {
      const interfaces = comp.interfaces?.map(i =>
        `  - ${i.name} (${i.type}, ${i.direction}, ${i.width}-bit, ${i.protocol || 'N/A'})`
      ).join('\n') || '  - No interfaces defined';

      return `${idx + 1}. ${comp.name} (${comp.id})
   Type: ${comp.category} - ${comp.type}
   Interfaces:
${interfaces}`;
    }).join('\n\n') : 'None (AI will select from library)';

    const enrichmentPrompt = `You are an expert SoC architect. Based on the user's requirements, you need to design a complete SoC architecture.

USER'S ORIGINAL REQUIREMENT:
${originalRequirement}

${schemaConstraints}

${ragTemplatesContext}

${availableComponentsContext}

CONVERSATION SUMMARY:
${conversationSummary}

COMPONENTS SUGGESTED IN CONVERSATION (if any):
${selectedComponentsList}

═══════════════════════════════════════════════════════════════
CRITICAL DESIGN PRINCIPLES - READ CAREFULLY:
═══════════════════════════════════════════════════════════════

**PRINCIPLE 1: User-Confirmed Requirements are MANDATORY**
- Any requirement explicitly confirmed by the user in conversation is MANDATORY
- User-confirmed components MUST be included
- User-confirmed parameters (e.g., "4x DDR5", "DDR5-5600") MUST be exact

**PRINCIPLE 2: AI Inference Must Follow Necessity Rule**
For requirements NOT explicitly confirmed by user, AI can infer ONLY if:
- ✅ NECESSARY: Without this component, data path would be BLOCKED or performance SEVERELY DEGRADED
- ✅ CRITICAL: Component is essential for basic functionality (e.g., interconnect to connect CPU to memory)
- ❌ DO NOT infer: Peripheral modules that are optional/nice-to-have
- ❌ DO NOT infer: Non-critical parameters (e.g., specific cache size unless user mentioned it)
- ❌ DO NOT over-specify: Avoid introducing unnecessary/wrong/redundant features

**Examples of NECESSARY vs UNNECESSARY inference:**
✅ NECESSARY: User wants CPU + Memory → AI infers AXI Crossbar (data path would be blocked without it)
✅ NECESSARY: User wants CXL memory expander → AI infers CXL controller (critical for functionality)
❌ UNNECESSARY: User wants basic IoT SoC → AI adds GPU (not necessary for basic IoT)
❌ UNNECESSARY: User wants memory controller → AI specifies "L1 cache 64KB" (user didn't confirm cache details)
❌ UNNECESSARY: User wants USB → AI adds "USB 3.2 Gen 2x2" when user only mentioned "USB"

**PRINCIPLE 3: Minimize Over-Engineering**
- Focus on user's explicit requirements
- Add only CRITICAL infrastructure components
- Avoid gold-plating with extra features
- Keep peripheral modules minimal unless user requested them
- Keep parameters generic unless user specified exact values

═══════════════════════════════════════════════════════════════

TASK - Design Complete Architecture:
You must complete TWO sub-tasks in this order:

**SUB-TASK 1: Component Selection & Customization**
1. Review the AVAILABLE COMPONENTS FROM LIBRARY above
2. Review the REFERENCE ARCHITECTURE TEMPLATES for architectural patterns
3. Select appropriate components for the user's requirement:
   a) MANDATORY: Include ALL user-confirmed components (exact as user specified)
   b) CRITICAL: Add only NECESSARY infrastructure (interconnects, bridges required for data path)
   c) AVOID: Optional peripherals, gold-plating features, over-specified parameters
   - ✅ **First priority**: Reuse exact components from library (use componentId)
   - ✅ **Second priority**: Customize library component (reference base component + specify changes)
   - ✅ **Third priority**: Create inspired by library component (state which component inspired it)
   - ❌ **Never**: Create component without library reference
4. If conversation already suggested some components, validate them against library

**SUB-TASK 2: Connection Inference & Interconnect Components**

CRITICAL: Connections are MANDATORY - an architecture without connections is INCOMPLETE and UNUSABLE.

**Step 1: Analyze Data Paths & Control Paths**
Based on the use case, identify NECESSARY data paths and control paths:
- Data Path: How data flows between components (e.g., CPU ↔ Memory, CPU ↔ Accelerator)
- Control Path: How components are configured/controlled (e.g., CPU → Peripheral registers)
- Both paths MUST be connected for the system to function

**Step 2: Infer Obvious Connections (Common Design Practice)**
Apply standard SoC design patterns - these are IMPLICIT requirements:
1. **CPU to Memory**: ALWAYS connect CPU master interface to memory slave interface
   - If multiple memory controllers → add AXI Crossbar or NoC
2. **CPU to Peripherals**: ALWAYS connect CPU to peripheral control interfaces
   - High-bandwidth peripherals (DMA, GPU) → AXI4 interconnect
   - Low-bandwidth peripherals (UART, GPIO) → APB bridge
3. **DMA to Memory**: If DMA exists → MUST connect to memory for data transfer
4. **Accelerators to Memory**: If accelerators exist → MUST connect to memory for data access
5. **Multi-Master Scenarios**: If >1 master → MUST add arbitration component

**Step 3: Add Required Interconnect Components**
Based on connection analysis, ADD these components if needed:
- **AXI Crossbar**: When multiple AXI masters need to access multiple AXI slaves
  - Example: CPU + DMA + GPU all accessing Memory + Peripherals
  - Provides arbitration and routing
- **AXI Interconnect/NoC**: For complex multi-master systems (>4 masters)
  - Better scalability than crossbar
  - Example: Multi-core CPU + multiple accelerators
- **APB Bridge**: When AXI masters need to access APB peripherals
  - Converts AXI4 protocol to APB protocol
  - Example: CPU (AXI) → APB Bridge → UART/GPIO (APB)
- **Protocol Bridges**: When different protocols need to communicate
  - AXI-to-AHB, AHB-to-APB, etc.
- **Multiplexers**: When multiple sources share a single destination
  - Example: Multiple interrupt sources → Interrupt controller

**Step 4: Create Connection List**
For each connection, specify:
- Source component + interface
- Target component + interface
- Protocol/bus type
- Bandwidth (if performance-critical)
- Rationale (why this connection exists)

**Connection Rules**:
1. ✅ ALWAYS connect masters to slaves (never master-to-master or slave-to-slave)
2. ✅ ALWAYS match protocols (AXI4 ↔ AXI4, APB ↔ APB) or add bridge
3. ✅ ALWAYS ensure data path completeness (CPU must reach memory)
4. ✅ ALWAYS add interconnects for multi-master scenarios
5. ❌ NEVER leave components unconnected (unless explicitly optional)
6. ❌ NEVER create connections that violate protocol rules

CRITICAL REQUIREMENTS:
- Create a **functional architecture** with NECESSARY components AND connections
- Include ALL user-confirmed components (MANDATORY)
- Add ONLY critical infrastructure components (NECESSARY for data path)
- **CONNECTIONS ARE MANDATORY** - architecture without connections is INCOMPLETE
- Infer obvious connections based on common design practice (CPU↔Memory, CPU↔Peripherals)
- Add interconnect components (Crossbar, NoC, Bridges) as needed for multi-master scenarios
- Connect masters to slaves (CPU/DMA → Memory, Peripherals)
- Match interface types (AXI4 ↔ AXI4, APB ↔ APB, etc.) or add protocol bridges
- Ensure data path completeness - every component must be reachable
- Avoid unnecessary peripherals and over-specified parameters
- Prefer simplicity over complexity, but ensure functionality

RESPONSE FORMAT - Return ONLY valid JSON:
{
  "components": [
    // List ALL components needed for this architecture
    // For each component, specify its source:
    {
      "componentId": "exact-library-component-id",  // If reusing from library
      "source": "library",                          // "library" | "customized" | "inspired" | "new"
      "name": "Component Name",
      "category": "CPU" | "Memory" | "Interconnect" | "IO" | "Accelerator",
      "type": "Specific Type",
      "baseComponentId": "library-component-id",    // If customized/inspired, reference base
      "customizations": "What was changed",         // If customized
      "rationale": "Why this component was selected/created"
    }
  ],
  "connections": [
    {
      "id": "conn-1",
      "source": "component-id-1",
      "target": "component-id-2",
      "sourceInterface": "interface-name",
      "targetInterface": "interface-name",
      "connectionType": "AXI4" | "APB" | "AHB" | "Custom",
      "protocol": "AXI4" | "APB" | "AHB" | etc,
      "bandwidth": "e.g., 25.6 GB/s",
      "rationale": "Why this connection makes sense"
    }
  ]
}

IMPORTANT:
- Return ONLY the JSON, no explanations before or after
- "components" array must include ALL components (from library + any interconnects/bridges needed)
- For library components, use exact componentId from AVAILABLE COMPONENTS list
- Ensure all component IDs in connections match the components in "components" array
- Create a realistic, complete architecture that aligns with the user's conversation
- Maximize reuse of library components`;

    try {
      const enrichmentResponse = await this.callBedrock(enrichmentPrompt);
      console.log(`🤖 [ENRICH_ARCH] Received AI enrichment response (${enrichmentResponse.length} chars)`);

      // Extract JSON from response (handle potential markdown formatting)
      let jsonStr = enrichmentResponse.trim();
      if (jsonStr.startsWith('```json')) {
        jsonStr = jsonStr.substring(7);
      }
      if (jsonStr.startsWith('```')) {
        jsonStr = jsonStr.substring(3);
      }
      if (jsonStr.endsWith('```')) {
        jsonStr = jsonStr.substring(0, jsonStr.length - 3);
      }
      jsonStr = jsonStr.trim();

      const enrichment = JSON.parse(jsonStr);

      // Process AI-selected components
      if (enrichment.components && Array.isArray(enrichment.components)) {
        console.log(`📦 [ENRICH_ARCH] AI selected ${enrichment.components.length} components`);

        const finalComponents: any[] = [];

        for (const aiComp of enrichment.components) {
          console.log(`📦 [ENRICH_ARCH] Processing: ${aiComp.name} (source: ${aiComp.source})`);

          if (aiComp.source === 'library' && aiComp.componentId) {
            // Load full component from library
            const libraryComponent = await this.componentLibrary.getComponentById(aiComp.componentId);
            if (libraryComponent) {
              console.log(`  ✅ Loaded from library: ${libraryComponent.name}`);
              finalComponents.push(libraryComponent);
            } else {
              console.warn(`  ⚠️  Component ${aiComp.componentId} not found in library, using AI definition`);
              finalComponents.push(aiComp);
            }
          } else if ((aiComp.source === 'customized' || aiComp.source === 'inspired') && aiComp.baseComponentId) {
            // Load base component and apply customizations
            const baseComponent = await this.componentLibrary.getComponentById(aiComp.baseComponentId);
            if (baseComponent) {
              console.log(`  ✅ Based on: ${baseComponent.name}, customizations: ${aiComp.customizations || 'N/A'}`);
              const customizedComponent = {
                ...baseComponent,
                id: aiComp.componentId || `${baseComponent.id}-custom-${Date.now()}`,
                name: aiComp.name || `${baseComponent.name} (Custom)`,
                description: `${baseComponent.description}\nCustomizations: ${aiComp.customizations || 'Modified for this architecture'}`,
                baseComponentId: aiComp.baseComponentId,
                customizations: aiComp.customizations
              };
              finalComponents.push(customizedComponent);
            } else {
              console.warn(`  ⚠️  Base component ${aiComp.baseComponentId} not found, using AI definition`);
              finalComponents.push(aiComp);
            }
          } else {
            // New component not from library
            console.log(`  ℹ️  New component: ${aiComp.name}`);
            finalComponents.push(aiComp);
          }
        }

        // Replace architecture components with AI-selected ones
        session.currentArchitecture!.selectedComponents = finalComponents;
        console.log(`✅ [ENRICH_ARCH] Final component count: ${finalComponents.length}`);
      }

      // Add connections to architecture
      if (enrichment.connections && Array.isArray(enrichment.connections)) {
        session.currentArchitecture!.connections = enrichment.connections.map((conn: any) => ({
          id: conn.id || `conn-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          sourceComponentId: conn.source,
          targetComponentId: conn.target,
          sourceInterface: conn.sourceInterface,
          targetInterface: conn.targetInterface,
          connectionType: conn.connectionType || conn.protocol || 'Custom',
          protocol: conn.protocol,
          bandwidth: conn.bandwidth,
          latency: conn.latency,
          description: conn.rationale || `${conn.protocol || 'Custom'} connection`
        }));

        console.log(`✅ [ENRICH_ARCH] Added ${session.currentArchitecture!.connections?.length || 0} connections to architecture`);
      }

      // Save enriched architecture
      await this.persistence.saveSession(session);
      console.log(`✅ [ENRICH_ARCH] Architecture enriched and saved: ${session.currentArchitecture!.selectedComponents?.length || 0} components, ${session.currentArchitecture!.connections?.length || 0} connections`);

    } catch (error) {
      console.error(`❌ [ENRICH_ARCH] Failed to enrich architecture:`, error);
      console.error(`❌ [ENRICH_ARCH] Will proceed with existing architecture (may have no connections)`);
    }
  }

  /**
   * STEP 3: Verify and fix spec alignment with conversation
   */
  private async verifyAndFixSpecAlignment(
    sessionId: string,
    initialSpec: string,
    maxIterations: number = 5,
    alignThreshold: number = 70
  ): Promise<string> {
    console.log(`🔍 [VERIFY_SPEC] Starting spec alignment check (max ${maxIterations} iterations, threshold: ${alignThreshold})`);

    const session = await this.getSession(sessionId);
    if (!session) {
      return initialSpec;
    }

    // Build conversation summary
    const conversationSummary = session.conversationHistory
      .map(msg => `${msg.role}: ${msg.content}`)
      .join('\n');

    let currentSpec = initialSpec;
    let iteration = 0;

    while (iteration < maxIterations) {
      iteration++;
      console.log(`\n📊 [VERIFY_SPEC] Iteration ${iteration}/${maxIterations}`);

      // Note: Progress will be emitted after verification completes (with score and issues)

      const verificationPrompt = `You are an expert SoC architect. Your task is to verify that the generated architecture specification aligns with the user's confirmed requirements from the conversation.

CONVERSATION HISTORY:
${conversationSummary}

CURRENT ARCH_SPEC.MD (Iteration ${iteration}):
${currentSpec}

═══════════════════════════════════════════════════════════════
CRITICAL VERIFICATION PRINCIPLES - READ CAREFULLY:
═══════════════════════════════════════════════════════════════

**PRINCIPLE 1: User-Confirmed Requirements are MANDATORY**
- Any component/parameter explicitly confirmed by user MUST be in spec
- Missing user-confirmed items = CRITICAL issue (major score penalty)
- Wrong parameters for user-confirmed items = CRITICAL issue

**PRINCIPLE 2: AI-Inferred Components Must Be NECESSARY**
For components NOT explicitly mentioned by user, evaluate necessity:
- ✅ ACCEPT: Component is NECESSARY (without it, data path blocked or performance degraded)
- ✅ ACCEPT: Critical infrastructure (e.g., interconnect to connect CPU to memory)
- ❌ PENALIZE: Optional peripheral modules not requested by user
- ❌ PENALIZE: Over-specified parameters (e.g., specific cache size when user didn't mention)
- ❌ PENALIZE: Unnecessary/redundant features that add complexity

**PRINCIPLE 3: Prefer Simplicity Over Complexity**
- Spec should include ONLY what user requested + NECESSARY infrastructure
- Extra components/features are a NEGATIVE, not a positive
- Over-engineering should reduce score, not increase it

**Examples of CRITICAL vs MINOR Issues:**
🚨 CRITICAL (Score -30 to -40):
  - User said "4x DDR5-5600" but spec has "2x DDR5-4800" (wrong count AND wrong spec)
  - User requested CXL controller but spec doesn't include it
  - User said "PCIe Gen4" but spec has "PCIe Gen3"

⚠️  MAJOR (Score -10 to -20):
  - Spec adds GPU when user only requested basic IoT SoC (unnecessary)
  - Spec specifies "64KB L1 cache" when user never mentioned cache details (over-specification)
  - Spec includes multiple peripherals user never requested

ℹ️  MINOR (Score -5 or less):
  - Markdown formatting issues
  - Missing optional documentation sections
  - Minor wording improvements

═══════════════════════════════════════════════════════════════

VERIFICATION TASK:
Evaluate the alignment between the spec and conversation requirements, then provide a score and analysis.

SCORING CRITERIA (0-100):
**HIGH WEIGHT (70% of score):**
1. User-Confirmed Requirements Coverage (40 points):
   - ALL user's EXPLICITLY stated components present?
   - User-confirmed parameters EXACT? (e.g., "4x DDR5" = 4 instances, not 2)
   - User-confirmed specs EXACT? (e.g., "DDR5-5600" not "DDR5-4800")
   - NO missing user-confirmed items?

2. Necessity of AI-Inferred Components (30 points):
   - AI-added components are NECESSARY (not just nice-to-have)?
   - NO unnecessary peripheral modules?
   - NO over-specified parameters?
   - NO redundant/wrong features?
   - Infrastructure components make sense (interconnects, bridges)?

**LOW WEIGHT (30% of score):**
3. Architecture Completeness (20 points):
   - Data paths functional (masters can reach slaves)?
   - Critical connections present?
   - System is buildable and functional?

4. Format & Documentation (10 points):
   - Markdown formatting
   - Documentation completeness

CRITICAL ALIGNMENT CHECKS (Focus on these):
- ✅ ALL user-confirmed components present with EXACT parameters?
- ✅ NO unnecessary components that user didn't request?
- ✅ AI-inferred components are NECESSARY (not optional)?
- ✅ Parameters match user's specifications EXACTLY?
- ⚠️  Extra features/peripherals = PENALTY (not bonus)
- ⚠️  Over-specification = PENALTY (keep it simple)

RESPONSE FORMAT - Return ONLY valid JSON:
{
  "score": <number 0-100>,
  "aligned": <boolean, true if score >= ${alignThreshold}>,
  "issues": [
    {
      "severity": "critical" | "major" | "minor",
      "category": "missing_user_requirement" | "wrong_parameter" | "unnecessary_component" | "over_specification" | "architecture_completeness" | "format",
      "description": "Brief description of the issue",
      "impact": "How this affects alignment score",
      "example": "e.g., 'User said 4x DDR5 but spec has 2x DDR5'"
    }
  ],
  "strengths": [
    "List aspects that are well-aligned (for score justification)"
  ],
  "correctedSpec": "<full corrected arch_spec.md content if score < ${alignThreshold}, otherwise omit this field>"
}

IMPORTANT:
- Be STRICT on user-confirmed requirements (missing = critical issue)
- PENALIZE unnecessary components and over-specification
- Focus score heavily on exact match of user requirements + necessity of AI-inferred components
- Only provide correctedSpec if score < ${alignThreshold}
- In correctedSpec: ADD missing user-confirmed items, REMOVE unnecessary items
- **correctedSpec MUST use proper Markdown formatting** (headings ##, lists -, code blocks, tables, etc.)
- Return ONLY the JSON, no other text

Your JSON response:`;

      try {
        const verificationResponse = await this.callBedrock(verificationPrompt);

        // Extract JSON from response
        let jsonStr = verificationResponse.trim();
        if (jsonStr.startsWith('```json')) {
          jsonStr = jsonStr.substring(7);
        }
        if (jsonStr.startsWith('```')) {
          jsonStr = jsonStr.substring(3);
        }
        if (jsonStr.endsWith('```')) {
          jsonStr = jsonStr.substring(0, jsonStr.length - 3);
        }
        jsonStr = jsonStr.trim();

        // Clean JSON comments before parsing
        jsonStr = this.cleanJsonString(jsonStr);

        const result = JSON.parse(jsonStr);
        const score = result.score || 0;
        const aligned = result.aligned || false;
        const issues = result.issues || [];

        console.log(`📊 [VERIFY_SPEC] Alignment Score: ${score}/100 (threshold: ${alignThreshold})`);
        console.log(`📊 [VERIFY_SPEC] Status: ${aligned ? '✅ ALIGNED' : '❌ NOT ALIGNED'}`);

        // Emit progress with score
        this.progressTracker.emitStage(
          sessionId,
          'ai_fix',
          `Spec alignment score: ${score}/100 (iteration ${iteration})`,
          30 + (iteration / maxIterations) * 5,
          {
            iteration,
            maxIterations,
            stage: 'spec_alignment',
            score,
            aligned,
            issuesCount: issues.length
          }
        );

        // Log issues by severity
        const criticalIssues = issues.filter((i: any) => i.severity === 'critical');
        const majorIssues = issues.filter((i: any) => i.severity === 'major');
        const minorIssues = issues.filter((i: any) => i.severity === 'minor');

        if (criticalIssues.length > 0) {
          console.log(`❌ [VERIFY_SPEC] Critical Issues (${criticalIssues.length}):`);
          criticalIssues.forEach((issue: any, idx: number) => {
            console.log(`   ${idx + 1}. [${issue.category}] ${issue.description}`);
          });
        }

        if (majorIssues.length > 0) {
          console.log(`⚠️  [VERIFY_SPEC] Major Issues (${majorIssues.length}):`);
          majorIssues.forEach((issue: any, idx: number) => {
            console.log(`   ${idx + 1}. [${issue.category}] ${issue.description}`);
          });
        }

        if (minorIssues.length > 0) {
          console.log(`ℹ️  [VERIFY_SPEC] Minor Issues (${minorIssues.length}):`);
          minorIssues.forEach((issue: any, idx: number) => {
            console.log(`   ${idx + 1}. [${issue.category}] ${issue.description}`);
          });
        }

        // Log strengths
        if (result.strengths && result.strengths.length > 0) {
          console.log(`✅ [VERIFY_SPEC] Strengths:`);
          result.strengths.forEach((strength: string, idx: number) => {
            console.log(`   ${idx + 1}. ${strength}`);
          });
        }

        // Check if alignment threshold met
        if (score >= alignThreshold) {
          console.log(`✅ [VERIFY_SPEC] Alignment threshold met (${score} >= ${alignThreshold})`);
          console.log(`✅ [VERIFY_SPEC] Spec alignment verified in ${iteration} iteration(s)`);
          return currentSpec;
        }

        // If corrected spec provided, use it for next iteration
        if (result.correctedSpec) {
          console.log(`🔄 [VERIFY_SPEC] Applying corrections for next iteration...`);
          console.log(`📝 [VERIFY_SPEC] Corrected spec length: ${result.correctedSpec.length} bytes (was ${currentSpec.length} bytes)`);
          currentSpec = result.correctedSpec;
          
          // Save intermediate iteration to S3 (spec only, not diagram)
          await this.saveIntermediateFiles(sessionId, 'align_req', iteration, currentSpec, null);
        } else {
          console.warn(`⚠️  [VERIFY_SPEC] Score below threshold but no corrected spec provided, using current spec`);
          return currentSpec;
        }

      } catch (error) {
        console.error(`❌ [VERIFY_SPEC] Iteration ${iteration} failed:`, error);
        if (iteration === 1) {
          // First iteration failed, return initial spec
          return initialSpec;
        } else {
          // Later iteration failed, return last successful spec
          return currentSpec;
        }
      }
    }

    // Max iterations reached
    console.log(`⚠️  [VERIFY_SPEC] Max iterations (${maxIterations}) reached`);
    console.log(`📝 [VERIFY_SPEC] Returning spec from last iteration`);
    return currentSpec;
  }

  /**
   * Helper: Clean JSON string by removing comments
   */
  private cleanJsonString(jsonStr: string): string {
    // Remove single-line comments (// ...)
    jsonStr = jsonStr.replace(/\/\/.*$/gm, '');
    // Remove multi-line comments (/* ... */)
    jsonStr = jsonStr.replace(/\/\*[\s\S]*?\*\//g, '');
    return jsonStr.trim();
  }

  /**
   * STEP 7: Verify and fix diagram alignment with spec (with scoring and iterations)
   */
  private async verifyAndFixDiagramAlignment(
    sessionId: string,
    archSpec: string,
    initialDiagram: any,
    maxIterations: number = 3,
    alignThreshold: number = 80
  ): Promise<any> {
    console.log(`🔍 [VERIFY_DIAGRAM] Starting diagram alignment check (max ${maxIterations} iterations, threshold: ${alignThreshold})`);

    let currentDiagram = initialDiagram;
    let iteration = 0;

    while (iteration < maxIterations) {
      iteration++;
      console.log(`\n📊 [VERIFY_DIAGRAM] Iteration ${iteration}/${maxIterations}`);

      // Note: Progress will be emitted after verification completes (with score and issues)

      const verificationPrompt = `You are an expert SoC architect. Your task is to verify that the generated arch_diagram.json aligns with the arch_spec.md.

ARCH_SPEC.MD (Source of Truth - Complete):
${archSpec}

CURRENT ARCH_DIAGRAM.JSON (Iteration ${iteration}):
${JSON.stringify(currentDiagram, null, 2)}

VERIFICATION TASK:
Evaluate the alignment between the diagram and spec, then provide a score and analysis.

SCORING CRITERIA (0-100):
**HIGH WEIGHT (80% of score):**
1. Component Count Accuracy (40 points):
   - EXACT number of instances for each component type
   - Example: "4x DDR5 controllers" in spec = 4 DDR nodes in diagram
   - Each instance MUST have its own node
   - This is CRITICAL - component count mismatch is the most common error

2. Component Parameters Accuracy (40 points):
   - All parameters match spec (type, speed, width, etc.)
   - Example: "DDR5-5600" in spec = "DDR5-5600" in diagram (not DDR4)
   - Clock frequencies, bandwidths, protocols match
   - Address mappings correct

**LOW WEIGHT (20% of score):**
3. Connections & Format (15 points):
   - Connections between components present
   - JSON format valid and complete
   - Edge/connection properties

4. Layout & Presentation (5 points):
   - Node positions reasonable
   - Visual presentation

CRITICAL ALIGNMENT CHECKS (Focus on these):
- ✅ Component count for each type matches spec EXACTLY?
- ✅ All component parameters match spec?
- ✅ Component types correct?
- ✅ No missing or extra components?
- ✅ **PORT COUNT PRESERVATION**: Component ports match library definitions?
  * NEVER add or remove ports from library components
  * If library defines 2 master ports, diagram MUST have exactly 2
  * Port counts are FIXED by component library, not modifiable
- ✅ **INTERCONNECT PORT VALIDATION**: Interconnects have sufficient ports?
  * Count connections to each interconnect/NoC/crossbar
  * Ensure it has AT LEAST that many ports in its interfaces array
  * Each connection MUST use a UNIQUE port (no duplicate port usage)
  * Example: If 5 components connect to crossbar, it needs ≥5 slave ports
- ✅ **CONNECTION FORMAT**: Connections specify exact interface names?
  * Direct: "From [Node A]'s [interface] to [Node B]'s [interface]"
  * Indirect: "From [A]'s [if], via [B]'s [in] and [out], to [C]'s [if]"
  * NO vague descriptions like "CPU connects to Memory"
- ✅ **DESIGN-LEVEL RESTRICTIONS**: No 1-to-N or N-to-1 at design level?
  * Only 1-to-1 connections between regular components
  * Use interconnects (crossbar/NoC/bridge) for fan-out/fan-in
  * Example WRONG: CPU → Memory, Peripheral, DMA (direct 1-to-3)
  * Example CORRECT: CPU → Crossbar → Memory, Peripheral, DMA
- ⚠️  Layout/positions are LESS important

RESPONSE FORMAT - Return ONLY valid JSON:
{
  "score": <number 0-100>,
  "aligned": <boolean, true if score >= ${alignThreshold}>,
  "issues": [
    {
      "severity": "critical" | "major" | "minor",
      "category": "component_count" | "component_parameters" | "connections" | "format",
      "description": "Brief description of the issue",
      "impact": "How this affects alignment score",
      "example": "Spec says '4x DDR5' but diagram has only 1 DDR node"
    }
  ],
  "strengths": [
    "List aspects that are well-aligned (for score justification)"
  ],
  "correctedDiagram": <complete corrected arch_diagram.json if score < ${alignThreshold}, otherwise omit this field>
}

IMPORTANT:
- Component count accuracy is MOST important (40% of score)
- Focus score heavily on matching component counts and parameters
- Only provide correctedDiagram if score < ${alignThreshold}
- Return ONLY the JSON, no other text

Your JSON response:`;

      try {
        const verificationResponse = await this.callBedrock(verificationPrompt);

        // Extract JSON from response
        let jsonStr = verificationResponse.trim();
        if (jsonStr.startsWith('```json')) {
          jsonStr = jsonStr.substring(7);
        }
        if (jsonStr.startsWith('```')) {
          jsonStr = jsonStr.substring(3);
        }
        if (jsonStr.endsWith('```')) {
          jsonStr = jsonStr.substring(0, jsonStr.length - 3);
        }
        jsonStr = jsonStr.trim();

        // Clean JSON comments before parsing
        jsonStr = this.cleanJsonString(jsonStr);

        const result = JSON.parse(jsonStr);
        const score = result.score || 0;
        const aligned = result.aligned || false;
        const issues = result.issues || [];

        console.log(`📊 [VERIFY_DIAGRAM] Alignment Score: ${score}/100 (threshold: ${alignThreshold})`);
        console.log(`📊 [VERIFY_DIAGRAM] Status: ${aligned ? '✅ ALIGNED' : '❌ NOT ALIGNED'}`);

        // Emit progress with score
        this.progressTracker.emitStage(
          sessionId,
          'verify_diagram',
          `Diagram alignment score: ${score}/100 (iteration ${iteration})`,
          50 + (iteration / maxIterations) * 10,
          {
            iteration,
            maxIterations,
            stage: 'diagram_alignment',
            score,
            aligned,
            issuesCount: issues.length
          }
        );

        // Log issues by severity
        const criticalIssues = issues.filter((i: any) => i.severity === 'critical');
        const majorIssues = issues.filter((i: any) => i.severity === 'major');
        const minorIssues = issues.filter((i: any) => i.severity === 'minor');

        if (criticalIssues.length > 0) {
          console.log(`   🚨 Critical issues (${criticalIssues.length}):`);
          criticalIssues.forEach((issue: any) => {
            console.log(`      - [${issue.category}] ${issue.description}`);
            if (issue.example) console.log(`        Example: ${issue.example}`);
          });
        }
        if (majorIssues.length > 0) {
          console.log(`   ⚠️  Major issues (${majorIssues.length}):`);
          majorIssues.forEach((issue: any) => {
            console.log(`      - [${issue.category}] ${issue.description}`);
          });
        }
        if (minorIssues.length > 0) {
          console.log(`   ℹ️  Minor issues (${minorIssues.length})`);
        }

        // If aligned, we're done
        if (aligned && score >= alignThreshold) {
          console.log(`✅ [VERIFY_DIAGRAM] Diagram alignment verified (score: ${score}/${alignThreshold})`);
          return currentDiagram;
        }

        // If not aligned and we have a corrected diagram, use it
        if (result.correctedDiagram) {
          console.log(`🔄 [VERIFY_DIAGRAM] Applying corrected diagram for next iteration`);
          currentDiagram = result.correctedDiagram;

          // Save intermediate state to S3 for debugging (diagram only, not spec)
          await this.saveIntermediateFiles(sessionId, 'align_spec', iteration, null, currentDiagram);

          // Continue to next iteration
          continue;
        } else {
          // No correction provided but not aligned - this is unexpected
          console.warn(`⚠️  [VERIFY_DIAGRAM] Score ${score} below threshold but no correction provided`);
          // Return current diagram as we can't improve it
          return currentDiagram;
        }

      } catch (error) {
        console.error(`❌ [VERIFY_DIAGRAM] Iteration ${iteration} failed:`, error);
        // Continue to next iteration or return current diagram if last iteration
        if (iteration >= maxIterations) {
          console.warn(`⚠️  [VERIFY_DIAGRAM] Max iterations reached, returning current diagram`);
          return currentDiagram;
        }
      }
    }

    // Max iterations reached
    console.log(`⚠️  [VERIFY_DIAGRAM] Max iterations (${maxIterations}) reached`);
    console.log(`📝 [VERIFY_DIAGRAM] Returning diagram from last iteration`);
    return currentDiagram;
  }

  /**
   * Normalize diagram format to ensure it has both nodes/edges and components/connections
   * This ensures compatibility between AI-generated diagrams and DRC checker
   */
  private normalizeDiagramFormat(diagram: any): any {
    // If diagram already has the correct format, return as-is
    if (diagram.nodes && diagram.edges) {
      // Ensure aliases exist
      if (!diagram.components) diagram.components = diagram.nodes;
      if (!diagram.connections) diagram.connections = diagram.edges;
      return diagram;
    }

    // Convert from components/connections format to nodes/edges format
    const normalized: any = {
      nodes: diagram.components || diagram.nodes || [],
      edges: diagram.connections || diagram.edges || [],
      metadata: diagram.metadata || {}
    };

    // Add aliases for compatibility
    normalized.components = normalized.nodes;
    normalized.connections = normalized.edges;

    return normalized;
  }

  /**
   * STEP 6: Run DRC validation
   */
  private async runDRCValidation(diagram: any): Promise<any> {
    console.log(`🔍 [RUN_DRC] Running DRC validation...`);

    try {
      // Import DRC checker
      const { DRCChecker } = await import('./drc-checker');
      const { ComponentLibraryManager } = await import('./component-library-manager');

      const drcChecker = new DRCChecker();
      const componentLibrary = new ComponentLibraryManager();

      // Load component library (already in memory, fast access)
      await componentLibrary.ensureInitialized();
      const fullComponents = componentLibrary.getAllComponents();

      // Run DRC check
      const drcResult = await drcChecker.checkDiagram(diagram, fullComponents);

      console.log(`📊 [RUN_DRC] DRC completed:`);
      console.log(`   Critical: ${drcResult.summary.critical}`);
      console.log(`   Warnings: ${drcResult.summary.warning}`);
      console.log(`   Info: ${drcResult.summary.info}`);

      return drcResult;
    } catch (error) {
      console.error(`❌ [RUN_DRC] DRC validation failed:`, error);
      // Return empty result to continue generation
      return {
        summary: { critical: 0, warning: 0, info: 0 },
        violations: []
      };
    }
  }

  /**
   * STEP 7: Fix DRC violations using AI
   */
  private async fixDRCViolations(sessionId: string, diagram: any, drcResult: any): Promise<any> {
    console.log(`🔧 [FIX_DRC] Fixing DRC violations with AI...`);

    const criticalViolations = drcResult.violations.filter((v: any) => v.severity === 'critical');

    if (criticalViolations.length === 0) {
      return diagram;
    }

    // Format violations for AI
    const violationsSummary = criticalViolations.map((v: any, idx: number) =>
      `${idx + 1}. [${v.ruleId}] ${v.message}
   Component: ${v.componentId || 'N/A'}
   Suggestion: ${v.suggestion || 'N/A'}`
    ).join('\n\n');

    const fixPrompt = `You are an expert SoC architect. The generated architecture has DRC (Design Rule Check) violations that must be fixed.

CURRENT ARCH_DIAGRAM.JSON:
${JSON.stringify(diagram, null, 2)}

CRITICAL DRC VIOLATIONS:
${violationsSummary}

TASK:
1. Analyze each DRC violation
2. Apply the suggested fixes or propose better solutions
3. Ensure fixes maintain architectural integrity
4. Return the COMPLETE corrected arch_diagram.json

COMMON FIXES:
- DRC-CONN-005 (Multiple Masters to One Slave): Add AXI Crossbar interconnect
- DRC-CONN-001 (Master-Slave Mismatch): Correct interface roles
- DRC-CONN-002 (Bus Type Mismatch): Use correct protocol or add bridge
- DRC-AXI-PARAM-001 (Data Width Mismatch): Align data widths or add converter
- DRC-ADDR-001 (Address Overlap): Adjust address mappings

RESPONSE FORMAT:
Return ONLY the complete corrected arch_diagram.json (valid JSON, no explanations)`;

    try {
      const fixResponse = await this.callBedrock(fixPrompt);

      // Extract JSON
      let jsonStr = fixResponse.trim();
      if (jsonStr.startsWith('```json')) {
        jsonStr = jsonStr.substring(7);
      }
      if (jsonStr.startsWith('```')) {
        jsonStr = jsonStr.substring(3);
      }
      if (jsonStr.endsWith('```')) {
        jsonStr = jsonStr.substring(0, jsonStr.length - 3);
      }

      const fixedDiagram = JSON.parse(jsonStr.trim());
      console.log(`✅ [FIX_DRC] AI-fixed diagram ready`);
      return fixedDiagram;
    } catch (error) {
      console.error(`❌ [FIX_DRC] Failed to fix violations:`, error);
      return diagram; // Return original if fix fails
    }
  }

  /**
   * Save intermediate files to S3 for debugging
   * Naming convention: arch_spec_{stage}_{timestamp}.md or arch_diagram_{stage}_{timestamp}.json
   * 
   * Stages for arch_spec.md:
   * - init: Initial generation
   * - align_req_1/2/3: Requirement alignment iterations
   * - refine_spec_1/2/3: Spec refinement iterations
   * 
   * Stages for arch_diagram.json:
   * - init: Initial generation
   * - align_spec_1/2/3: Diagram-spec alignment iterations
   * - drc_1/2/3: DRC fix iterations
   * - layout_opt: Layout optimization
   */
  private async saveIntermediateFiles(
    sessionId: string,
    step: string,
    iteration: number,
    archSpec: string | null,
    archDiagram: any | null
  ): Promise<void> {
    const session = await this.getSession(sessionId);
    if (!session?.projectId || !session?.userId) {
      console.log(`⚠️  [SAVE_INTERMEDIATE] Skipping - no projectId or userId`);
      return;
    }

    try {
      const { s3Storage } = await import('../../utils/s3-storage');
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

      const savedFiles: string[] = [];

      // Save arch_spec.md only if provided
      // Format: arch_spec_{stage}_{timestamp}.md
      if (archSpec !== null) {
        const stageName = iteration > 0 ? `${step}_${iteration}` : step;
        const filename = `temp/arch_spec_${stageName}_${timestamp}.md`;
        
        await s3Storage.uploadFile(
          session.userId,
          session.projectId,
          filename,
          archSpec,
          'text/markdown'
        );
        savedFiles.push(`arch_spec_${stageName}.md`);
      }

      // Save arch_diagram.json only if provided
      // Format: arch_diagram_{stage}_{timestamp}.json
      if (archDiagram !== null) {
        const stageName = iteration > 0 ? `${step}_${iteration}` : step;
        const filename = `temp/arch_diagram_${stageName}_${timestamp}.json`;
        const diagramContent = JSON.stringify(archDiagram, null, 2);
        
        await s3Storage.uploadFile(
          session.userId,
          session.projectId,
          filename,
          diagramContent,
          'application/json'
        );
        savedFiles.push(`arch_diagram_${stageName}.json`);
      }

      if (savedFiles.length > 0) {
        console.log(`💾 [SAVE_INTERMEDIATE] Saved to S3: ${savedFiles.join(', ')}`);
      }
    } catch (error) {
      console.error(`❌ [SAVE_INTERMEDIATE] Failed to save intermediate files:`, error);
      // Don't throw - this is just for debugging
    }
  }

  /**
   * Optimize architecture diagram layout using Dagre algorithm
   */
  private async optimizeArchitectureLayout(diagram: any): Promise<any> {
    console.log(`🎨 [OPTIMIZE_LAYOUT] Starting layout optimization...`);

    try {
      const { LayoutOptimizer } = await import('./layout-optimizer');
      const optimizer = new LayoutOptimizer();

      // Use SoC-specific heuristics for better layout
      const optimizedDiagram = optimizer.optimizeLayoutWithHeuristics(diagram);

      // Validate layout
      const validation = optimizer.validateLayout(optimizedDiagram);
      if (!validation.valid) {
        console.warn(`⚠️  [OPTIMIZE_LAYOUT] Layout validation issues:`);
        validation.issues.forEach(issue => console.warn(`   - ${issue}`));
      } else {
        console.log(`✅ [OPTIMIZE_LAYOUT] Layout validation passed`);
      }

      return optimizedDiagram;
    } catch (error) {
      console.error(`❌ [OPTIMIZE_LAYOUT] Layout optimization failed:`, error);
      console.log(`   Returning original diagram without layout optimization`);
      return diagram;
    }
  }

  /**
   * Finalize architecture generation with multi-step validation
   * Implements rigorous verification to ensure alignment with conversation
   */
  async finalizeArchitecture(sessionId: string, requestId?: string): Promise<{
    archSpec: string;
    archDiagram: any;
  }> {
    const reqId = requestId || 'unknown';

    // Check if generation is already in progress for this session
    if (this.activeGenerations.get(sessionId)) {
      console.warn(`⚠️ [FINALIZE_ARCH][${reqId}] Generation already in progress for session ${sessionId}, ignoring duplicate call`);
      throw new Error('Architecture generation already in progress for this session');
    }

    // Mark generation as active
    this.activeGenerations.set(sessionId, true);
    console.log(`📝 [FINALIZE_ARCH][${reqId}] Starting multi-step architecture generation for session ${sessionId}`);

    try {
      // Start progress tracking
      this.progressTracker.emitStage(sessionId, 'started', 'Starting architecture generation...', 0);

      // Extract requirements
      this.progressTracker.emitStage(sessionId, 'extracting', 'Extracting requirements from conversation...', 5);
      await new Promise(resolve => setTimeout(resolve, 500));

      // STEP 1: AI inference for component selection and connection inference
      this.progressTracker.emitStage(sessionId, 'ai_inference', 'AI analyzing requirements and inferring architecture...', 10);
      console.log(`🤖 [ENRICH_ARCH][${reqId}] Starting AI inference for session ${sessionId}`);
      await this.enrichArchitectureFromConversation(sessionId);
      console.log(`✅ [ENRICH_ARCH][${reqId}] AI inference completed for session ${sessionId}`);

      // STEP 2: Generate initial arch_spec.md
      this.progressTracker.emitStage(sessionId, 'generating_spec', 'Generating initial architecture specification (arch_spec.md)...', 20);
      console.log(`📝 [GEN_SPEC][${reqId}] Starting arch_spec.md generation for session ${sessionId}`);
      let archSpec = await this.generateArchSpec(sessionId);
      console.log(`✅ [FINALIZE_ARCH][${reqId}] Initial arch_spec.md generated (${archSpec.length} bytes)`);

      // STEP 3: AI re-check spec alignment with conversation
      this.progressTracker.emitStage(sessionId, 'ai_fix', 'AI verifying spec alignment with discussion...', 25);
      console.log(`🔍 [VERIFY_SPEC][${reqId}] Starting spec alignment check (max ${this.maxSpecAlignmentIterations} iterations) for session ${sessionId}`);
      archSpec = await this.verifyAndFixSpecAlignment(
        sessionId,
        archSpec,
        this.maxSpecAlignmentIterations,
        this.specAlignmentThreshold
      );
      console.log(`✅ [FINALIZE_ARCH][${reqId}] Spec alignment verified and corrected if needed`);

      // STEP 3.5: Refine spec with use cases, data flows, and detailed connections
      this.progressTracker.emitStage(sessionId, 'refining_spec', 'Refining spec with use cases and data flows...', 30);
      console.log(`🔍 [REFINE_SPEC][${reqId}] Starting spec refinement (max 5 iterations) for session ${sessionId}`);
      archSpec = await this.refineArchSpec(sessionId, archSpec, 5, 80);
      console.log(`✅ [FINALIZE_ARCH][${reqId}] Spec refinement completed`);

      // STEP 4: Generate initial arch_diagram.json (basic conversion, no DRC yet)
      this.progressTracker.emitStage(sessionId, 'generating_diagram', 'Generating initial architecture diagram...', 40);
      console.log(`📊 [GEN_DIAGRAM][${reqId}] Starting arch_diagram.json generation for session ${sessionId}`);
      let archDiagram = await this.generateArchDiagramBasic(sessionId);
      console.log(`✅ [FINALIZE_ARCH][${reqId}] Initial arch_diagram.json generated`);
      console.log(`   [${reqId}] Components: ${archDiagram.components?.length || 0}, Connections: ${archDiagram.connections?.length || 0}`);

      // Save initial state to S3 for debugging
      await this.saveIntermediateFiles(sessionId, 'initial', 0, archSpec, archDiagram);

      // STEP 5: Verify diagram alignment with arch_spec.md (iterative with scoring)
      // This step is CRITICAL to ensure arch_diagram.json matches arch_spec.md
      // Must be done BEFORE DRC to ensure component counts and parameters are correct
      // Note: Progress tracking is handled inside verifyAndFixDiagramAlignment (50-60%)
      console.log(`🔍 [VERIFY_DIAGRAM][${reqId}] Starting diagram-spec alignment check (max 3 iterations, threshold 80) for session ${sessionId}`);
      archDiagram = await this.verifyAndFixDiagramAlignment(sessionId, archSpec, archDiagram, 3, 80);
      console.log(`✅ [FINALIZE_ARCH][${reqId}] Diagram alignment verified and corrected if needed`);

      // STEP 6: Run DRC validation with iterative fixes
      this.progressTracker.emitStage(sessionId, 'drc_check', 'Running DRC validation...', 60);
      console.log(`🔍 [DRC_CHECK][${reqId}] Starting DRC validation for session ${sessionId}`);
      archDiagram = await this.runDRCValidationOnDiagram(sessionId, archDiagram);
      console.log(`✅ [FINALIZE_ARCH][${reqId}] DRC validation completed`);

      // Save post-DRC diagram to S3 for debugging (diagram only - spec unchanged by DRC)
      await this.saveIntermediateFiles(sessionId, 'post_drc', 0, null, archDiagram);

      // Send DRC completion update
      this.progressTracker.emitStage(sessionId, 'drc_check', 'DRC validation completed', 75);

      // STEP 7: Optimize layout using Dagre algorithm (only executes if DRC passed)
      this.progressTracker.emitStage(sessionId, 'optimizing_layout', 'Optimizing component layout...', 80);
      console.log(`🎨 [OPTIMIZE_LAYOUT][${reqId}] Starting layout optimization for session ${sessionId}`);
      archDiagram = await this.optimizeArchitectureLayout(archDiagram);
      console.log(`✅ [FINALIZE_ARCH][${reqId}] Layout optimized with Dagre algorithm`);

      // Send layout optimization completion update
      this.progressTracker.emitStage(sessionId, 'optimizing_layout', 'Layout optimization completed', 85)

      // Update session phase to generating (final phase) and mark architecture as generated
      const session = await this.getSession(sessionId);
      if (session) {
        console.log(`📝 [FINALIZE_ARCH] Updating session phase from ${session.phase} to 'generating'`);
        session.phase = 'generating';
        session.lastActivity = new Date();
        // Mark architecture as actually generated (not just suggested in conversation)
        // This flag is used to distinguish first-time generation from architecture updates
        session.isArchitectureGenerated = true;
        await this.persistence.saveSession(session);
        console.log(`✅ [FINALIZE_ARCH] Session updated (isArchitectureGenerated=true) and persisted`);
      }

      // STEP 8: Ensure unified metadata format
      const { DiagramMetadataService } = await import('./diagram-metadata');
      archDiagram = DiagramMetadataService.setForAIGeneration(archDiagram);
      console.log(`✅ [FINALIZE_ARCH][${reqId}] Unified metadata applied to diagram`);

      // STEP 9: Save final files to S3 (main project folder, not temp)
      if (session?.userId && session?.projectId) {
        console.log(`💾 [FINALIZE_ARCH][${reqId}] Saving final files to S3...`);
        const { s3Storage } = await import('../../utils/s3-storage');
        
        // Save final arch_spec.md
        await s3Storage.uploadFile(
          session.userId,
          session.projectId,
          'arch_spec.md',
          archSpec,
          'text/markdown'
        );
        console.log(`✅ [FINALIZE_ARCH][${reqId}] Saved final arch_spec.md to S3`);

        // Save final arch_diagram.json
        const finalDiagramContent = JSON.stringify(archDiagram, null, 2);
        await s3Storage.uploadFile(
          session.userId,
          session.projectId,
          'arch_diagram.json',
          finalDiagramContent,
          'application/json'
        );
        console.log(`✅ [FINALIZE_ARCH][${reqId}] Saved final arch_diagram.json to S3`);
      } else {
        console.warn(`⚠️ [FINALIZE_ARCH][${reqId}] Session or session IDs not found, skipping final file save to S3`);
      }

      // STEP 10: Send completion event to frontend
      this.progressTracker.emitStage(sessionId, 'completed', 'Architecture generation completed successfully!', 100, {
        components: archDiagram.nodes?.length || 0,
        connections: archDiagram.edges?.length || 0,
        savedToS3: true,
        specSize: archSpec.length
      });

      console.log(`✅ [FINALIZE_ARCH][${reqId}] Finalize architecture completed successfully`);
      return {
        archSpec,
        archDiagram
      };
    } finally {
      // Always clear the active generation flag, whether success or error
      this.activeGenerations.delete(sessionId);
      console.log(`🧹 [FINALIZE_ARCH][${reqId}] Cleared active generation flag for session ${sessionId}`);
    }
  }
}