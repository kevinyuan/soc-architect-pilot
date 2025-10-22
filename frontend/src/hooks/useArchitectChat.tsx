/**
 * @deprecated This file is kept for backward compatibility.
 * Please use the new hooks from useChatContext.tsx instead:
 * - useConceptChat for Concept view
 * - useArchitectChat for Architect view
 * - useCodeChat for Code view
 */

// Re-export everything from the new useChatContext module
export * from './useChatContext';

// For backward compatibility, also export the old names
export {
  ArchitectChatProvider,
  useArchitectChat,
  type ChatUIMessage,
  type ChatContextType as ArchitectChatContextType,
  type ChatMode,
} from './useChatContext';
