import { Router } from 'express';
import { ConversationalAgent } from '../services/conversational-agent';
import { APIResponse } from '../../types/index';

const router = Router();
const conversationalAgent = new ConversationalAgent();

// Start a new chat session
router.post('/session', async (req, res) => {
  try {
    const { userId, projectId, hasExistingArchitecture } = req.body;
    const session = await conversationalAgent.startSession(userId, projectId, hasExistingArchitecture);

    const response: APIResponse = {
      success: true,
      data: {
        sessionId: session.sessionId,
        phase: session.phase,
        projectId: session.projectId,
        isArchitectureGenerated: session.isArchitectureGenerated,
        message: 'Chat session created successfully'
      },
      timestamp: new Date(),
      requestId: req.headers['x-request-id'] as string || 'unknown'
    };

    res.json(response);
  } catch (error) {
    console.error('Error creating chat session:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'SESSION_CREATION_ERROR',
        message: 'Failed to create chat session'
      },
      timestamp: new Date(),
      requestId: req.headers['x-request-id'] as string || 'unknown'
    });
  }
});

// Send a message to the chat
router.post('/message', async (req, res) => {
  try {
    const { sessionId, message, stream = true } = req.body;
    
    if (!sessionId || !message) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_PARAMETERS',
          message: 'sessionId and message are required'
        },
        timestamp: new Date(),
        requestId: req.headers['x-request-id'] as string || 'unknown'
      });
    }
    
    // Check if streaming is requested
    if (stream) {
      console.log(`📡 [CHAT_STREAM] Starting streaming response for session ${sessionId}`);
      
      // Set SSE headers
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering
      res.flushHeaders(); // Flush headers immediately
      
      try {
        // Send initial connection event
        const connectionMsg = `data: ${JSON.stringify({ type: 'connected', message: 'Stream connected' })}\n\n`;
        res.write(connectionMsg);
        // Force immediate send by writing a comment (SSE keepalive)
        res.write(':keepalive\n\n');

        // Process message with streaming
        const chatResponse = await conversationalAgent.processMessageStreaming(
          sessionId,
          message,
          (chunk, metadata) => {
            // Send each chunk to frontend immediately
            const chunkMsg = `data: ${JSON.stringify({
              type: 'chunk',
              text: chunk,
              metadata: metadata || {}
            })}\n\n`;
            res.write(chunkMsg);
            // Write empty comment to force flush
            res.write(':ping\n\n');
          }
        );

        // Get updated session to include confirmedSelections
        const updatedSession = await conversationalAgent.getSession(sessionId);

        // Send completion event with full response metadata
        res.write(`data: ${JSON.stringify({
          type: 'done',
          response: {
            phase: chatResponse.phase,
            suggestedComponents: chatResponse.suggestedComponents,
            clarificationQuestions: chatResponse.clarificationQuestions,
            quickReplies: chatResponse.quickReplies,
            checkboxOptions: chatResponse.checkboxOptions,
            radioOptions: chatResponse.radioOptions,
            inputPrompt: chatResponse.inputPrompt,
            readyToGenerate: chatResponse.readyToGenerate,
            sessionId: chatResponse.sessionId,
            timestamp: chatResponse.timestamp
          },
          session: {
            id: sessionId,
            phase: chatResponse.phase,
            confirmedSelections: updatedSession?.confirmedSelections
          }
        })}\n\n`);
        
        res.end();
        console.log(`✅ [CHAT_STREAM] Streaming complete for session ${sessionId}`);
        
      } catch (streamError) {
        console.error('❌ [CHAT_STREAM] Streaming error:', streamError);
        res.write(`data: ${JSON.stringify({
          type: 'error',
          message: streamError instanceof Error ? streamError.message : 'Streaming error'
        })}\n\n`);
        res.end();
      }
      
    } else {
      // Fallback: non-streaming mode
      console.log(`📝 [CHAT] Processing message (non-streaming) for session ${sessionId}`);

      const chatResponse = await conversationalAgent.processMessage(sessionId, message);

      // Get updated session to include confirmedSelections
      const updatedSession = await conversationalAgent.getSession(sessionId);

      const response: APIResponse = {
        success: true,
        data: {
          response: chatResponse,
          session: {
            id: sessionId,
            phase: chatResponse.phase,
            timestamp: chatResponse.timestamp,
            confirmedSelections: updatedSession?.confirmedSelections
          }
        },
        timestamp: new Date(),
        requestId: req.headers['x-request-id'] as string || 'unknown'
      };

      res.json(response);
    }
    
  } catch (error) {
    console.error('Chat message error:', error);
    
    if (error instanceof Error && error.message.includes('not found')) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'SESSION_NOT_FOUND',
          message: 'Chat session not found'
        },
        timestamp: new Date(),
        requestId: req.headers['x-request-id'] as string || 'unknown'
      });
    }
    
    res.status(500).json({
      success: false,
      error: {
        code: 'CHAT_ERROR',
        message: 'Failed to process chat message'
      },
      timestamp: new Date(),
      requestId: req.headers['x-request-id'] as string || 'unknown'
    });
  }
});

// Get chat session history
router.get('/session/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const session = await conversationalAgent.getSession(sessionId);
    
    if (!session) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'SESSION_NOT_FOUND',
          message: 'Chat session not found'
        },
        timestamp: new Date(),
        requestId: req.headers['x-request-id'] as string || 'unknown'
      });
    }
    
    const response: APIResponse = {
      success: true,
      data: session,
      timestamp: new Date(),
      requestId: req.headers['x-request-id'] as string || 'unknown'
    };
    
    res.json(response);
  } catch (error) {
    console.error('Error getting session:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'SESSION_ERROR',
        message: 'Failed to get session'
      },
      timestamp: new Date(),
      requestId: req.headers['x-request-id'] as string || 'unknown'
    });
  }
});

// Generate specification from session
router.post('/session/:sessionId/specification', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { format = 'markdown', options = {} } = req.body;

    const session = await conversationalAgent.getSession(sessionId);
    if (!session) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'SESSION_NOT_FOUND',
          message: 'Chat session not found'
        },
        timestamp: new Date(),
        requestId: req.headers['x-request-id'] as string || 'unknown'
      });
    }

    const { SpecificationGenerator } = await import('../services/specification-generator');
    const specGenerator = new SpecificationGenerator();

    let result;
    if (format === 'markdown') {
      result = {
        format: 'markdown',
        content: specGenerator.generateMarkdownSpecification(session, options),
        specification: specGenerator.generateSpecification(session, options)
      };
    } else {
      result = {
        format: 'json',
        specification: specGenerator.generateSpecification(session, options)
      };
    }

    // Validate specification
    const validation = specGenerator.validateSpecification(result.specification);

    const response: APIResponse = {
      success: true,
      data: {
        ...result,
        validation
      },
      timestamp: new Date(),
      requestId: req.headers['x-request-id'] as string || 'unknown'
    };

    res.json(response);
  } catch (error) {
    console.error('Error generating specification:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'SPECIFICATION_ERROR',
        message: 'Failed to generate specification'
      },
      timestamp: new Date(),
      requestId: req.headers['x-request-id'] as string || 'unknown'
    });
  }
});

// Generate complete architecture (arch_spec.md + arch_diagram.json)
// This endpoint generates both files and saves them to S3
router.post('/session/:sessionId/generate-architecture', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const requestId = req.headers['x-request-id'] as string || 'unknown';
    console.log(`\n${'='.repeat(80)}`);
    console.log(`📥 [ARCH_GEN_REQUEST][${requestId}] Received architecture generation request`);
    console.log(`📥 [ARCH_GEN_REQUEST][${requestId}] Session ID: ${sessionId}`);
    console.log(`📥 [ARCH_GEN_REQUEST][${requestId}] Request headers:`, {
      'x-request-id': requestId,
      'content-type': req.headers['content-type']
    });

    const session = await conversationalAgent.getSession(sessionId);
    if (!session) {
      console.error(`❌ [ARCH_GEN_REQUEST][${requestId}] Session not found: ${sessionId}`);
      return res.status(404).json({
        success: false,
        error: {
          code: 'SESSION_NOT_FOUND',
          message: 'Chat session not found'
        },
        timestamp: new Date(),
        requestId: req.headers['x-request-id'] as string || 'unknown'
      });
    }

    console.log(`✅ [ARCH_GEN_REQUEST][${requestId}] Session found and loaded`);
    console.log(`🏗️ [ARCH_GEN][${requestId}] Starting architecture generation for session ${sessionId}`);
    console.log(`🏗️ [ARCH_GEN][${requestId}] Project: ${session.projectId}, User: ${session.userId}`);
    console.log(`🏗️ [ARCH_GEN][${requestId}] Session phase: ${session.phase}, Conversation history: ${session.conversationHistory?.length || 0} messages`);
    console.log(`🏗️ [ARCH_GEN][${requestId}] Session requirements: ${session.requirements?.length || 0}, constraints: ${session.constraints?.length || 0}`);
    console.log(`🏗️ [ARCH_GEN][${requestId}] Current architecture:`, session.currentArchitecture ? {
      components: session.currentArchitecture.selectedComponents?.length || 0,
      connections: session.currentArchitecture.connections?.length || 0
    } : 'null');

    // Check if generation is already in progress (before starting async process)
    if (conversationalAgent.isGenerationInProgress(sessionId)) {
      console.warn(`⚠️ [ARCH_GEN_REQUEST][${requestId}] Generation already in progress for session ${sessionId}`);
      return res.status(409).json({
        success: false,
        error: {
          code: 'GENERATION_IN_PROGRESS',
          message: 'Architecture generation is already in progress for this session'
        },
        timestamp: new Date(),
        requestId
      });
    }

    // Start async generation (don't await - return immediately)
    console.log(`🚀 [ARCH_GEN][${requestId}] Starting async generation for session ${sessionId}`);
    const startTime = Date.now();
    
    // Fire and forget - process in background
    conversationalAgent.finalizeArchitecture(sessionId, requestId)
      .then(async ({ archSpec, archDiagram }) => {
        console.log(`✅ [ARCH_GEN][${requestId}] finalizeArchitecture resolved successfully`);

        const generationTime = Date.now() - startTime;
        console.log(`✅ [ARCH_GEN][${requestId}] Architecture generated in ${generationTime}ms`);
        console.log(`✅ [ARCH_GEN][${requestId}] Components: ${archDiagram.components?.length || 0}, Connections: ${archDiagram.connections?.length || 0}`);
        
        // Save to S3 in background
        let savedToS3 = false;
        if (session.projectId && session.userId) {
          try {
            const { s3Storage } = await import('../../utils/s3-storage');
            const { GenerationProgressTracker } = await import('../services/generation-progress');
            const progressTracker = GenerationProgressTracker.getInstance();

            progressTracker.emitStage(sessionId, 's3_upload', 'Uploading files to S3...', 90);

            await Promise.all([
              s3Storage.uploadFile(session.userId, session.projectId!, 'arch_spec.md', archSpec, 'text/markdown'),
              s3Storage.uploadFile(session.userId, session.projectId!, 'arch_diagram.json', JSON.stringify(archDiagram, null, 2), 'application/json')
            ]);
            
            savedToS3 = true;
            console.log(`✅ [S3_UPLOAD][${requestId}] Files saved to S3`);

            // Emit final completion event with file data
            progressTracker.emitStage(sessionId, 'completed', 'Architecture generation completed!', 100, {
              savedToS3: true,
              components: archDiagram.components?.length || 0,
              connections: archDiagram.connections?.length || 0,
              generatedAt: new Date().toISOString()
            });
          } catch (s3Error) {
            console.error(`❌ [S3_UPLOAD][${requestId}] Failed:`, s3Error);
            // Still emit completion even if S3 fails
            const { GenerationProgressTracker } = await import('../services/generation-progress');
            const progressTracker = GenerationProgressTracker.getInstance();
            progressTracker.emitStage(sessionId, 'completed', 'Architecture generated (S3 upload failed)', 100, {
              savedToS3: false,
              components: archDiagram.components?.length || 0,
              connections: archDiagram.connections?.length || 0,
              error: s3Error instanceof Error ? s3Error.message : 'S3 upload failed'
            });
          }
        } else {
          // No S3 credentials - still emit completion
          const { GenerationProgressTracker } = await import('../services/generation-progress');
          const progressTracker = GenerationProgressTracker.getInstance();
          progressTracker.emitStage(sessionId, 'completed', 'Architecture generated (not saved to S3)', 100, {
            savedToS3: false,
            components: archDiagram.components?.length || 0,
            connections: archDiagram.connections?.length || 0
          });
        }
      })
      .catch(async (err) => {
        console.error(`❌ [ARCH_GEN][${requestId}] Generation failed with error:`, err);
        console.error(`❌ [ARCH_GEN][${requestId}] Error type:`, err.constructor.name);
        console.error(`❌ [ARCH_GEN][${requestId}] Error message:`, err.message);
        if (err.stack) {
          console.error(`❌ [ARCH_GEN][${requestId}] Stack trace:`, err.stack);
        }
        
        // Emit error event
        const { GenerationProgressTracker } = await import('../services/generation-progress');
        const progressTracker = GenerationProgressTracker.getInstance();
        progressTracker.emitStage(sessionId, 'error', `Generation failed: ${err.message}`, 0, {
          error: true,
          errorMessage: err.message
        });
      });

    // Return immediately with 202 Accepted
    return res.status(202).json({
      success: true,
      message: 'Architecture generation started',
      sessionId,
      requestId,
      timestamp: new Date()
    });
  } catch (error) {
    console.error(`\n${'!'.repeat(80)}`);
    console.error('❌ [ARCH_GEN_ERROR] Architecture generation failed:', error);
    console.error('❌ [ARCH_GEN_ERROR] Error type:', error instanceof Error ? error.constructor.name : typeof error);
    console.error('❌ [ARCH_GEN_ERROR] Error message:', error instanceof Error ? error.message : String(error));
    if (error instanceof Error && error.stack) {
      console.error('❌ [ARCH_GEN_ERROR] Stack trace:', error.stack);
    }
    console.error(`${'!'.repeat(80)}\n`);

    // Check if error is due to concurrent generation
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (errorMessage.includes('already in progress')) {
      return res.status(409).json({
        success: false,
        error: {
          code: 'GENERATION_IN_PROGRESS',
          message: 'Architecture generation is already in progress for this session',
          details: 'Please wait for the current generation to complete'
        },
        timestamp: new Date(),
        requestId: req.headers['x-request-id'] as string || 'unknown'
      });
    }

    res.status(500).json({
      success: false,
      error: {
        code: 'ARCHITECTURE_ERROR',
        message: 'Failed to generate architecture',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      timestamp: new Date(),
      requestId: req.headers['x-request-id'] as string || 'unknown'
    });
  }
});

// List all chat sessions (with optional project filter)
router.get('/sessions', async (req, res) => {
  try {
    const { projectId } = req.query;

    // Get sessions - filter by projectId if provided
    let allSessions = projectId
      ? await conversationalAgent.getSessionsByProjectId(projectId as string)
      : conversationalAgent.getAllSessions();

    const sessions = allSessions.map(session => ({
      sessionId: session.sessionId,
      userId: session.userId,
      projectId: session.projectId,
      startTime: session.startTime,
      lastActivity: session.lastActivity,
      phase: session.phase,
      messageCount: session.conversationHistory.length,
      hasArchitecture: !!session.currentArchitecture
    }));

    const response: APIResponse = {
      success: true,
      data: sessions,
      timestamp: new Date(),
      requestId: req.headers['x-request-id'] as string || 'unknown'
    };

    res.json(response);
  } catch (error) {
    console.error('Error listing sessions:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'SESSIONS_ERROR',
        message: 'Failed to list sessions'
      },
      timestamp: new Date(),
      requestId: req.headers['x-request-id'] as string || 'unknown'
    });
  }
});

// Delete a chat session
router.delete('/session/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const deleted = await conversationalAgent.deleteSession(sessionId);
    
    if (!deleted) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'SESSION_NOT_FOUND',
          message: 'Chat session not found'
        },
        timestamp: new Date(),
        requestId: req.headers['x-request-id'] as string || 'unknown'
      });
    }
    
    const response: APIResponse = {
      success: true,
      data: { message: 'Session deleted successfully' },
      timestamp: new Date(),
      requestId: req.headers['x-request-id'] as string || 'unknown'
    };
    
    res.json(response);
  } catch (error) {
    console.error('Error deleting session:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'DELETE_ERROR',
        message: 'Failed to delete session'
      },
      timestamp: new Date(),
      requestId: req.headers['x-request-id'] as string || 'unknown'
    });
  }
});

// Get component suggestions for current session
router.get('/session/:sessionId/suggestions', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { query } = req.query;
    
    const session = await conversationalAgent.getSession(sessionId);
    if (!session) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'SESSION_NOT_FOUND',
          message: 'Chat session not found'
        },
        timestamp: new Date(),
        requestId: req.headers['x-request-id'] as string || 'unknown'
      });
    }

    // Get the last AI message with suggestions
    const lastAIMessage = session.conversationHistory
      .filter(msg => msg.role === 'assistant')
      .pop();
    
    const suggestions = lastAIMessage?.metadata?.suggestedComponents || [];
    
    const response: APIResponse = {
      success: true,
      data: {
        suggestions,
        sessionPhase: session.phase,
        query: query as string
      },
      timestamp: new Date(),
      requestId: req.headers['x-request-id'] as string || 'unknown'
    };
    
    res.json(response);
  } catch (error) {
    console.error('Error getting suggestions:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'SUGGESTIONS_ERROR',
        message: 'Failed to get component suggestions'
      },
      timestamp: new Date(),
      requestId: req.headers['x-request-id'] as string || 'unknown'
    });
  }
});

// OPTIONS handler for SSE endpoint (CORS preflight)
router.options('/session/:sessionId/generation-progress', (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Cache-Control');
  res.setHeader('Access-Control-Max-Age', '86400');
  res.status(204).end();
});

// SSE endpoint for real-time progress updates during architecture generation
router.get('/session/:sessionId/generation-progress', async (req, res) => {
  const { sessionId } = req.params;

  console.log(`📡 [SSE] Client connected for generation progress: ${sessionId}`);
  console.log(`📡 [SSE] Request origin: ${req.headers.origin}`);
  console.log(`📡 [SSE] Request headers:`, req.headers);

  // Set CORS headers for SSE - MUST be set before any data is written
  const origin = req.headers.origin || '*';
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Credentials', 'false');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Cache-Control');
  res.setHeader('Access-Control-Expose-Headers', 'Content-Type');

  // Set SSE headers
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering
  
  // Flush headers immediately
  res.flushHeaders();

  // Import progress tracker
  const { GenerationProgressTracker } = await import('../services/generation-progress');
  const progressTracker = GenerationProgressTracker.getInstance();

  // Send initial connection event
  res.write(`data: ${JSON.stringify({ type: 'connected', message: 'Connected to progress stream' })}\n\n`);
  
  // Send immediate heartbeat to establish connection
  res.write(`: heartbeat-init\n\n`);

  // Send any historical progress events that already occurred
  const historicalEvents = progressTracker.getProgress(sessionId);
  if (historicalEvents.length > 0) {
    console.log(`📡 [SSE] Sending ${historicalEvents.length} historical events to catch up`);
    for (const event of historicalEvents) {
      const sseData = {
        type: 'progress',
        stage: event.stage,
        message: event.message,
        progress: event.progress,
        timestamp: event.timestamp,
        details: event.details
      };
      res.write(`data: ${JSON.stringify(sseData)}\n\n`);
    }
  }

  // Listen for progress events
  const progressHandler = (event: any) => {
    const sseData = {
      type: 'progress',
      stage: event.stage,
      message: event.message,
      progress: event.progress,
      timestamp: event.timestamp,
      details: event.details
    };
    res.write(`data: ${JSON.stringify(sseData)}\n\n`);
    console.log(`📡 [SSE] Sent progress: ${event.stage} - ${event.message}`);

    // Close connection when completed or error
    if (event.stage === 'completed' || event.stage === 'error') {
      console.log(`📡 [SSE] Generation ${event.stage}, closing connection in 3s`);
      setTimeout(() => {
        res.end();
      }, 3000); // Give client 3s to receive final message
    }
  };

  // Register listener
  progressTracker.on(`progress:${sessionId}`, progressHandler);

  // Heartbeat to keep connection alive (more frequent to prevent timeout)
  const heartbeatInterval = setInterval(() => {
    try {
      res.write(`: heartbeat\n\n`);
    } catch (err) {
      console.warn(`📡 [SSE] Heartbeat failed for ${sessionId}, connection may be closed`);
      clearInterval(heartbeatInterval);
    }
  }, 5000); // Every 5 seconds

  // Clean up on client disconnect
  req.on('close', () => {
    console.log(`📡 [SSE] Client disconnected: ${sessionId}`);
    clearInterval(heartbeatInterval);
    progressTracker.off(`progress:${sessionId}`, progressHandler);
    progressTracker.clearProgress(sessionId);
  });
});

export default router;