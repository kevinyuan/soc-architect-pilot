// Feedback API Client
// Handles user feedback and action tracking

import { apiClient } from './api-client';

export enum FeedbackType {
  COMPONENT_SUGGESTION = 'component_suggestion',
  ARCHITECTURE_QUALITY = 'architecture_quality',
  VALIDATION_ACCURACY = 'validation_accuracy',
  USER_EXPERIENCE = 'user_experience'
}

export enum FeedbackRating {
  THUMBS_UP = 'thumbs_up',
  THUMBS_DOWN = 'thumbs_down',
  NEUTRAL = 'neutral'
}

export enum ActionType {
  ACCEPTED_SUGGESTION = 'accepted_suggestion',
  REJECTED_SUGGESTION = 'rejected_suggestion',
  MODIFIED_SUGGESTION = 'modified_suggestion',
  REQUESTED_ALTERNATIVE = 'requested_alternative'
}

export interface FeedbackRequest {
  sessionId: string;
  componentId?: string;
  suggestionId?: string;
  feedbackType: FeedbackType;
  rating: FeedbackRating;
  comment?: string;
  context?: any;
  userId?: string;
}

export interface ActionRequest {
  sessionId: string;
  actionType: ActionType;
  componentId?: string;
  suggestionId?: string;
  actionData?: any;
  userId?: string;
}

export interface QualityMetrics {
  acceptanceRate: number;
  suggestionAccuracy: number;
  userSatisfaction: number;
  averageResponseTime: number;
  trends: any[];
}

export const feedbackAPI = {
  /**
   * Record user feedback
   */
  async recordFeedback(request: FeedbackRequest): Promise<string> {
    const response = await apiClient.post<{ feedbackId: string }>('/feedback', request);
    return response.feedbackId;
  },

  /**
   * Record user action
   */
  async recordAction(request: ActionRequest): Promise<string> {
    const response = await apiClient.post<{ actionId: string }>('/feedback/action', request);
    return response.actionId;
  },

  /**
   * Get suggestion rationale
   */
  async getSuggestionRationale(suggestionId: string): Promise<any> {
    return await apiClient.get(`/feedback/suggestion/${suggestionId}/rationale`);
  },

  /**
   * Generate component alternatives
   */
  async generateAlternatives(
    primaryComponent: any,
    availableComponents: any[],
    userRequirements?: string[]
  ): Promise<any[]> {
    return await apiClient.post('/feedback/alternatives', {
      primaryComponent,
      availableComponents,
      userRequirements,
    });
  },

  /**
   * Get quality metrics
   */
  async getQualityMetrics(
    period?: 'day' | 'week' | 'month',
    startDate?: Date,
    endDate?: Date
  ): Promise<QualityMetrics> {
    return await apiClient.get('/feedback/metrics', {
      period,
      startDate: startDate?.toISOString(),
      endDate: endDate?.toISOString(),
    });
  },

  /**
   * Get quality alerts
   */
  async getQualityAlerts(): Promise<any[]> {
    return await apiClient.get('/feedback/alerts');
  },

  /**
   * Get session feedback summary
   */
  async getSessionFeedback(sessionId: string): Promise<any> {
    return await apiClient.get(`/feedback/session/${sessionId}`);
  },

  /**
   * Get feedback types (for UI)
   */
  async getFeedbackTypes(): Promise<{
    feedbackTypes: FeedbackType[];
    feedbackRatings: FeedbackRating[];
    actionTypes: ActionType[];
  }> {
    return await apiClient.get('/feedback/types');
  },
};
