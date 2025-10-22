import { ArchitecturalComponent, DesignSession } from '../../types/index';

export interface UserFeedback {
  id: string;
  sessionId: string;
  componentId?: string;
  suggestionId?: string;
  feedbackType: FeedbackType;
  rating: FeedbackRating;
  comment?: string;
  context: FeedbackContext;
  timestamp: Date;
  userId?: string;
  metadata?: Record<string, any>;
}

export interface FeedbackContext {
  conversationPhase: string;
  componentCategory?: string;
  suggestionReason?: string;
  userQuery?: string;
  alternativesProvided?: number;
  responseTime?: number;
}

export enum FeedbackType {
  COMPONENT_SUGGESTION = 'component_suggestion',
  VALIDATION_RESULT = 'validation_result',
  DIAGRAM_GENERATION = 'diagram_generation',
  CUSTOMIZATION_RESULT = 'customization_result',
  OVERALL_EXPERIENCE = 'overall_experience'
}

export enum FeedbackRating {
  THUMBS_UP = 'thumbs_up',
  THUMBS_DOWN = 'thumbs_down',
  VERY_HELPFUL = 'very_helpful',
  HELPFUL = 'helpful',
  NEUTRAL = 'neutral',
  NOT_HELPFUL = 'not_helpful',
  VERY_UNHELPFUL = 'very_unhelpful'
}

export interface UserAction {
  id: string;
  sessionId: string;
  actionType: ActionType;
  componentId?: string;
  suggestionId?: string;
  actionData: Record<string, any>;
  timestamp: Date;
  userId?: string;
}

export enum ActionType {
  SUGGESTION_ACCEPTED = 'suggestion_accepted',
  SUGGESTION_MODIFIED = 'suggestion_modified',
  SUGGESTION_REJECTED = 'suggestion_rejected',
  COMPONENT_CUSTOMIZED = 'component_customized',
  VALIDATION_ACKNOWLEDGED = 'validation_acknowledged',
  ALTERNATIVE_SELECTED = 'alternative_selected'
}

export interface QualityMetrics {
  period: 'day' | 'week' | 'month';
  startDate: Date;
  endDate: Date;
  totalSuggestions: number;
  acceptanceRate: number;
  modificationRate: number;
  rejectionRate: number;
  averageRating: number;
  userSatisfactionScore: number;
  responseAccuracy: number;
  categoryBreakdown: Record<string, {
    suggestions: number;
    accepted: number;
    rating: number;
  }>;
  trendData: Array<{
    date: Date;
    acceptanceRate: number;
    rating: number;
  }>;
}

export interface SuggestionRationale {
  componentId: string;
  reason: string;
  confidence: number;
  alternatives: Array<{
    componentId: string;
    reason: string;
    confidence: number;
  }>;
  context: {
    userRequirements: string[];
    compatibilityFactors: string[];
    performanceFactors: string[];
  };
}

export class FeedbackAnalyticsService {
  private feedbackStore: Map<string, UserFeedback> = new Map();
  private actionStore: Map<string, UserAction> = new Map();
  private rationaleStore: Map<string, SuggestionRationale> = new Map();

  /**
   * Record user feedback
   */
  async recordFeedback(feedback: Omit<UserFeedback, 'id' | 'timestamp'>): Promise<string> {
    const feedbackId = this.generateId();
    const feedbackRecord: UserFeedback = {
      ...feedback,
      id: feedbackId,
      timestamp: new Date()
    };

    this.feedbackStore.set(feedbackId, feedbackRecord);
    
    // Trigger quality monitoring
    await this.updateQualityMetrics(feedbackRecord);
    
    return feedbackId;
  }

  /**
   * Record user action
   */
  async recordAction(action: Omit<UserAction, 'id' | 'timestamp'>): Promise<string> {
    const actionId = this.generateId();
    const actionRecord: UserAction = {
      ...action,
      id: actionId,
      timestamp: new Date()
    };

    this.actionStore.set(actionId, actionRecord);
    
    return actionId;
  }

  /**
   * Store suggestion rationale
   */
  storeSuggestionRationale(suggestionId: string, rationale: SuggestionRationale): void {
    this.rationaleStore.set(suggestionId, rationale);
  }

  /**
   * Get suggestion rationale
   */
  getSuggestionRationale(suggestionId: string): SuggestionRationale | undefined {
    return this.rationaleStore.get(suggestionId);
  }

  /**
   * Generate component alternatives
   */
  generateAlternatives(
    primaryComponent: ArchitecturalComponent,
    availableComponents: ArchitecturalComponent[],
    userRequirements: string[]
  ): Array<{
    component: ArchitecturalComponent;
    reason: string;
    confidence: number;
  }> {
    const alternatives: Array<{
      component: ArchitecturalComponent;
      reason: string;
      confidence: number;
    }> = [];

    // Find components in the same category
    const sameCategory = availableComponents.filter(c => 
      c.category === primaryComponent.category && c.id !== primaryComponent.id
    );

    sameCategory.forEach(component => {
      let confidence = 0.5; // Base confidence
      let reasons: string[] = [];

      // Check compatibility
      const commonProtocols = component.compatibility.filter(protocol => 
        primaryComponent.compatibility.includes(protocol)
      );
      if (commonProtocols.length > 0) {
        confidence += 0.2;
        reasons.push(`Compatible protocols: ${commonProtocols.join(', ')}`);
      }

      // Check performance characteristics
      if (component.properties.performance && primaryComponent.properties.performance) {
        const compFreq = this.extractFrequency(component.properties.performance.clockFrequency);
        const primaryFreq = this.extractFrequency(primaryComponent.properties.performance.clockFrequency);
        
        if (compFreq && primaryFreq) {
          if (compFreq > primaryFreq) {
            confidence += 0.1;
            reasons.push('Higher performance');
          } else if (compFreq < primaryFreq) {
            confidence += 0.05;
            reasons.push('Lower power alternative');
          }
        }
      }

      // Check power consumption
      if (component.properties.power && primaryComponent.properties.power) {
        const compPower = this.extractPower(component.properties.power.typical);
        const primaryPower = this.extractPower(primaryComponent.properties.power.typical);
        
        if (compPower && primaryPower && compPower < primaryPower) {
          confidence += 0.15;
          reasons.push('Lower power consumption');
        }
      }

      if (confidence > 0.6) {
        alternatives.push({
          component,
          reason: reasons.join('; '),
          confidence: Math.min(confidence, 0.95)
        });
      }
    });

    // Sort by confidence and return top 3
    return alternatives
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, 3);
  }

  /**
   * Get quality metrics for a period
   */
  async getQualityMetrics(
    period: 'day' | 'week' | 'month',
    startDate?: Date,
    endDate?: Date
  ): Promise<QualityMetrics> {
    const end = endDate || new Date();
    const start = startDate || this.getStartDate(period, end);

    const feedbackInPeriod = Array.from(this.feedbackStore.values())
      .filter(f => f.timestamp >= start && f.timestamp <= end);
    
    const actionsInPeriod = Array.from(this.actionStore.values())
      .filter(a => a.timestamp >= start && a.timestamp <= end);

    // Calculate metrics
    const totalSuggestions = feedbackInPeriod.filter(f => 
      f.feedbackType === FeedbackType.COMPONENT_SUGGESTION
    ).length;

    const acceptedActions = actionsInPeriod.filter(a => 
      a.actionType === ActionType.SUGGESTION_ACCEPTED
    ).length;

    const modifiedActions = actionsInPeriod.filter(a => 
      a.actionType === ActionType.SUGGESTION_MODIFIED
    ).length;

    const rejectedActions = actionsInPeriod.filter(a => 
      a.actionType === ActionType.SUGGESTION_REJECTED
    ).length;

    const acceptanceRate = totalSuggestions > 0 ? acceptedActions / totalSuggestions : 0;
    const modificationRate = totalSuggestions > 0 ? modifiedActions / totalSuggestions : 0;
    const rejectionRate = totalSuggestions > 0 ? rejectedActions / totalSuggestions : 0;

    // Calculate average rating
    const ratings = feedbackInPeriod
      .filter(f => f.rating === FeedbackRating.THUMBS_UP || f.rating === FeedbackRating.THUMBS_DOWN)
      .map(f => f.rating === FeedbackRating.THUMBS_UP ? 1 : 0);
    
    const averageRating = ratings.length > 0 ? 
      ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length : 0;

    // Calculate user satisfaction score (0-100)
    const userSatisfactionScore = (acceptanceRate * 0.4 + averageRating * 0.6) * 100;

    // Calculate response accuracy (based on acceptance rate and positive feedback)
    const responseAccuracy = (acceptanceRate * 0.7 + averageRating * 0.3) * 100;

    // Category breakdown
    const categoryBreakdown: Record<string, { suggestions: number; accepted: number; rating: number }> = {};
    
    feedbackInPeriod.forEach(feedback => {
      if (feedback.context.componentCategory) {
        const category = feedback.context.componentCategory;
        if (!categoryBreakdown[category]) {
          categoryBreakdown[category] = { suggestions: 0, accepted: 0, rating: 0 };
        }
        categoryBreakdown[category].suggestions++;
        
        if (feedback.rating === FeedbackRating.THUMBS_UP) {
          categoryBreakdown[category].rating += 1;
        }
      }
    });

    // Calculate category ratings
    Object.keys(categoryBreakdown).forEach(category => {
      const data = categoryBreakdown[category];
      data.rating = data.suggestions > 0 ? data.rating / data.suggestions : 0;
    });

    // Generate trend data (simplified - daily averages)
    const trendData = this.generateTrendData(start, end, feedbackInPeriod, actionsInPeriod);

    return {
      period,
      startDate: start,
      endDate: end,
      totalSuggestions,
      acceptanceRate,
      modificationRate,
      rejectionRate,
      averageRating,
      userSatisfactionScore,
      responseAccuracy,
      categoryBreakdown,
      trendData
    };
  }

  /**
   * Get real-time quality alerts
   */
  async getQualityAlerts(): Promise<Array<{
    type: 'low_acceptance' | 'poor_rating' | 'high_rejection' | 'category_issue';
    severity: 'low' | 'medium' | 'high';
    message: string;
    data: Record<string, any>;
    timestamp: Date;
  }>> {
    const alerts: Array<{
      type: 'low_acceptance' | 'poor_rating' | 'high_rejection' | 'category_issue';
      severity: 'low' | 'medium' | 'high';
      message: string;
      data: Record<string, any>;
      timestamp: Date;
    }> = [];

    // Get recent metrics (last 24 hours)
    const recentMetrics = await this.getQualityMetrics('day');

    // Low acceptance rate alert
    if (recentMetrics.acceptanceRate < 0.5 && recentMetrics.totalSuggestions > 5) {
      alerts.push({
        type: 'low_acceptance',
        severity: recentMetrics.acceptanceRate < 0.3 ? 'high' : 'medium',
        message: `Low suggestion acceptance rate: ${(recentMetrics.acceptanceRate * 100).toFixed(1)}%`,
        data: { acceptanceRate: recentMetrics.acceptanceRate, totalSuggestions: recentMetrics.totalSuggestions },
        timestamp: new Date()
      });
    }

    // Poor rating alert
    if (recentMetrics.averageRating < 0.4 && recentMetrics.totalSuggestions > 3) {
      alerts.push({
        type: 'poor_rating',
        severity: recentMetrics.averageRating < 0.2 ? 'high' : 'medium',
        message: `Poor user ratings: ${(recentMetrics.averageRating * 100).toFixed(1)}% positive`,
        data: { averageRating: recentMetrics.averageRating },
        timestamp: new Date()
      });
    }

    // High rejection rate alert
    if (recentMetrics.rejectionRate > 0.4 && recentMetrics.totalSuggestions > 5) {
      alerts.push({
        type: 'high_rejection',
        severity: recentMetrics.rejectionRate > 0.6 ? 'high' : 'medium',
        message: `High suggestion rejection rate: ${(recentMetrics.rejectionRate * 100).toFixed(1)}%`,
        data: { rejectionRate: recentMetrics.rejectionRate },
        timestamp: new Date()
      });
    }

    // Category-specific issues
    Object.entries(recentMetrics.categoryBreakdown).forEach(([category, data]) => {
      if (data.suggestions > 2 && data.rating < 0.3) {
        alerts.push({
          type: 'category_issue',
          severity: 'medium',
          message: `Poor performance in ${category} category: ${(data.rating * 100).toFixed(1)}% positive`,
          data: { category, ...data },
          timestamp: new Date()
        });
      }
    });

    return alerts;
  }

  /**
   * Get feedback summary for session
   */
  getSessionFeedback(sessionId: string): {
    feedback: UserFeedback[];
    actions: UserAction[];
    summary: {
      totalFeedback: number;
      positiveRating: number;
      suggestionsAccepted: number;
      suggestionsRejected: number;
    };
  } {
    const sessionFeedback = Array.from(this.feedbackStore.values())
      .filter(f => f.sessionId === sessionId);
    
    const sessionActions = Array.from(this.actionStore.values())
      .filter(a => a.sessionId === sessionId);

    const positiveRating = sessionFeedback.filter(f => 
      f.rating === FeedbackRating.THUMBS_UP || f.rating === FeedbackRating.HELPFUL || f.rating === FeedbackRating.VERY_HELPFUL
    ).length;

    const suggestionsAccepted = sessionActions.filter(a => 
      a.actionType === ActionType.SUGGESTION_ACCEPTED
    ).length;

    const suggestionsRejected = sessionActions.filter(a => 
      a.actionType === ActionType.SUGGESTION_REJECTED
    ).length;

    return {
      feedback: sessionFeedback,
      actions: sessionActions,
      summary: {
        totalFeedback: sessionFeedback.length,
        positiveRating,
        suggestionsAccepted,
        suggestionsRejected
      }
    };
  }

  /**
   * Helper methods
   */
  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private getStartDate(period: 'day' | 'week' | 'month', endDate: Date): Date {
    const start = new Date(endDate);
    switch (period) {
      case 'day':
        start.setDate(start.getDate() - 1);
        break;
      case 'week':
        start.setDate(start.getDate() - 7);
        break;
      case 'month':
        start.setMonth(start.getMonth() - 1);
        break;
    }
    return start;
  }

  private extractFrequency(freqStr?: string): number | null {
    if (!freqStr) return null;
    const match = freqStr.match(/(\d+\.?\d*)\s*(MHz|GHz|Hz)/i);
    if (!match) return null;
    
    const value = parseFloat(match[1]);
    const unit = match[2].toLowerCase();
    
    switch (unit) {
      case 'ghz': return value * 1000;
      case 'mhz': return value;
      case 'hz': return value / 1000000;
      default: return value;
    }
  }

  private extractPower(powerStr?: string): number | null {
    if (!powerStr) return null;
    const match = powerStr.match(/(\d+\.?\d*)\s*(m?W)/i);
    if (!match) return null;
    
    const value = parseFloat(match[1]);
    const unit = match[2].toLowerCase();
    
    return unit === 'mw' ? value / 1000 : value;
  }

  private generateTrendData(
    start: Date,
    end: Date,
    feedback: UserFeedback[],
    actions: UserAction[]
  ): Array<{ date: Date; acceptanceRate: number; rating: number }> {
    const days = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
    const trendData: Array<{ date: Date; acceptanceRate: number; rating: number }> = [];

    for (let i = 0; i < days; i++) {
      const date = new Date(start);
      date.setDate(date.getDate() + i);
      
      const dayStart = new Date(date);
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(date);
      dayEnd.setHours(23, 59, 59, 999);

      const dayFeedback = feedback.filter(f => 
        f.timestamp >= dayStart && f.timestamp <= dayEnd
      );
      
      const dayActions = actions.filter(a => 
        a.timestamp >= dayStart && a.timestamp <= dayEnd
      );

      const accepted = dayActions.filter(a => 
        a.actionType === ActionType.SUGGESTION_ACCEPTED
      ).length;
      
      const total = dayFeedback.filter(f => 
        f.feedbackType === FeedbackType.COMPONENT_SUGGESTION
      ).length;

      const positive = dayFeedback.filter(f => 
        f.rating === FeedbackRating.THUMBS_UP
      ).length;

      trendData.push({
        date,
        acceptanceRate: total > 0 ? accepted / total : 0,
        rating: dayFeedback.length > 0 ? positive / dayFeedback.length : 0
      });
    }

    return trendData;
  }

  /**
   * Update quality metrics in real-time
   */
  private async updateQualityMetrics(feedback: UserFeedback): Promise<void> {
    // This would trigger real-time quality monitoring
    // For now, we'll just log significant events
    
    if (feedback.rating === FeedbackRating.THUMBS_DOWN || 
        feedback.rating === FeedbackRating.NOT_HELPFUL ||
        feedback.rating === FeedbackRating.VERY_UNHELPFUL) {
      console.warn(`Negative feedback received for ${feedback.feedbackType}:`, {
        sessionId: feedback.sessionId,
        rating: feedback.rating,
        comment: feedback.comment
      });
    }
  }
}

// Singleton instance
export const feedbackAnalyticsService = new FeedbackAnalyticsService();