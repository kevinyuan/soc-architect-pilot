export interface PerformanceMetric {
  id: string;
  name: string;
  category: 'api' | 'render' | 'user' | 'system';
  value: number;
  unit: 'ms' | 'seconds' | 'count' | 'bytes' | 'percentage';
  timestamp: Date;
  sessionId?: string;
  userId?: string;
  metadata?: Record<string, any>;
}

export interface PerformanceAlert {
  id: string;
  type: 'slow_response' | 'high_error_rate' | 'memory_usage' | 'user_experience';
  severity: 'low' | 'medium' | 'high';
  message: string;
  threshold: number;
  currentValue: number;
  timestamp: Date;
  resolved: boolean;
}

export interface UserAnalytics {
  sessionId: string;
  userId?: string;
  sessionStart: Date;
  sessionEnd?: Date;
  sessionDuration?: number; // milliseconds
  pageViews: number;
  componentsSelected: number;
  diagramsGenerated: number;
  validationsRun: number;
  conversationTurns: number;
  successfulCompletions: number;
  errorCount: number;
  userAgent?: string;
  referrer?: string;
}

export interface PerformanceDashboard {
  overview: {
    avgResponseTime: number;
    totalRequests: number;
    errorRate: number;
    activeUsers: number;
    systemUptime: number;
  };
  apiMetrics: {
    bedrockLatency: number;
    diagramGeneration: number;
    validation: number;
    componentSearch: number;
  };
  userMetrics: {
    avgSessionDuration: number;
    avgComponentsPerSession: number;
    conversionRate: number;
    bounceRate: number;
  };
  alerts: PerformanceAlert[];
  trends: Array<{
    timestamp: Date;
    responseTime: number;
    errorRate: number;
    activeUsers: number;
  }>;
}

export class PerformanceMonitor {
  private metrics: Map<string, PerformanceMetric> = new Map();
  private alerts: Map<string, PerformanceAlert> = new Map();
  private userSessions: Map<string, UserAnalytics> = new Map();
  private startTime: Date = new Date();

  // Performance thresholds
  private thresholds = {
    slowResponse: 5000, // 5 seconds
    highErrorRate: 0.05, // 5%
    highMemoryUsage: 0.8, // 80%
    slowDiagramRender: 3000 // 3 seconds
  };

  /**
   * Record a performance metric
   */
  recordMetric(
    name: string,
    category: PerformanceMetric['category'],
    value: number,
    unit: PerformanceMetric['unit'],
    sessionId?: string,
    metadata?: Record<string, any>
  ): string {
    const metricId = this.generateId();
    const metric: PerformanceMetric = {
      id: metricId,
      name,
      category,
      value,
      unit,
      timestamp: new Date(),
      sessionId,
      metadata
    };

    this.metrics.set(metricId, metric);
    
    // Check for alerts
    this.checkAlerts(metric);
    
    return metricId;
  }

  /**
   * Start timing an operation
   */
  startTimer(operationName: string, sessionId?: string): () => string {
    const startTime = Date.now();
    
    return () => {
      const duration = Date.now() - startTime;
      return this.recordMetric(
        operationName,
        'api',
        duration,
        'ms',
        sessionId,
        { startTime, endTime: Date.now() }
      );
    };
  }

  /**
   * Record API call performance
   */
  recordAPICall(
    endpoint: string,
    method: string,
    statusCode: number,
    duration: number,
    sessionId?: string
  ): string {
    return this.recordMetric(
      `api_${method.toLowerCase()}_${endpoint.replace(/[^a-zA-Z0-9]/g, '_')}`,
      'api',
      duration,
      'ms',
      sessionId,
      { endpoint, method, statusCode }
    );
  }

  /**
   * Record user session analytics
   */
  startUserSession(sessionId: string, userId?: string, userAgent?: string): void {
    const session: UserAnalytics = {
      sessionId,
      userId,
      sessionStart: new Date(),
      pageViews: 1,
      componentsSelected: 0,
      diagramsGenerated: 0,
      validationsRun: 0,
      conversationTurns: 0,
      successfulCompletions: 0,
      errorCount: 0,
      userAgent
    };

    this.userSessions.set(sessionId, session);
  }

  /**
   * Update user session analytics
   */
  updateUserSession(
    sessionId: string,
    updates: Partial<Pick<UserAnalytics, 
      'pageViews' | 'componentsSelected' | 'diagramsGenerated' | 
      'validationsRun' | 'conversationTurns' | 'successfulCompletions' | 'errorCount'
    >>
  ): void {
    const session = this.userSessions.get(sessionId);
    if (session) {
      Object.assign(session, updates);
      this.userSessions.set(sessionId, session);
    }
  }

  /**
   * End user session
   */
  endUserSession(sessionId: string): UserAnalytics | undefined {
    const session = this.userSessions.get(sessionId);
    if (session) {
      session.sessionEnd = new Date();
      session.sessionDuration = session.sessionEnd.getTime() - session.sessionStart.getTime();
      
      // Record session duration metric
      this.recordMetric(
        'user_session_duration',
        'user',
        session.sessionDuration,
        'ms',
        sessionId
      );

      return session;
    }
    return undefined;
  }

  /**
   * Get performance dashboard data
   */
  getDashboard(timeRange: 'hour' | 'day' | 'week' = 'hour'): PerformanceDashboard {
    const now = new Date();
    const startTime = new Date(now);
    
    switch (timeRange) {
      case 'hour':
        startTime.setHours(startTime.getHours() - 1);
        break;
      case 'day':
        startTime.setDate(startTime.getDate() - 1);
        break;
      case 'week':
        startTime.setDate(startTime.getDate() - 7);
        break;
    }

    const recentMetrics = Array.from(this.metrics.values())
      .filter(m => m.timestamp >= startTime);
    
    const recentSessions = Array.from(this.userSessions.values())
      .filter(s => s.sessionStart >= startTime);

    // Calculate overview metrics
    const apiMetrics = recentMetrics.filter(m => m.category === 'api');
    const avgResponseTime = apiMetrics.length > 0 ? 
      apiMetrics.reduce((sum, m) => sum + m.value, 0) / apiMetrics.length : 0;
    
    const errorMetrics = recentMetrics.filter(m => 
      m.metadata?.statusCode && m.metadata.statusCode >= 400
    );
    const errorRate = apiMetrics.length > 0 ? errorMetrics.length / apiMetrics.length : 0;

    // Calculate user metrics
    const completedSessions = recentSessions.filter(s => s.sessionEnd);
    const avgSessionDuration = completedSessions.length > 0 ?
      completedSessions.reduce((sum, s) => sum + (s.sessionDuration || 0), 0) / completedSessions.length : 0;
    
    const avgComponentsPerSession = recentSessions.length > 0 ?
      recentSessions.reduce((sum, s) => sum + s.componentsSelected, 0) / recentSessions.length : 0;

    const conversionRate = recentSessions.length > 0 ?
      recentSessions.filter(s => s.successfulCompletions > 0).length / recentSessions.length : 0;

    // Get specific API metrics
    const bedrockMetrics = recentMetrics.filter(m => m.name.includes('bedrock'));
    const diagramMetrics = recentMetrics.filter(m => m.name.includes('diagram'));
    const validationMetrics = recentMetrics.filter(m => m.name.includes('validation'));
    const searchMetrics = recentMetrics.filter(m => m.name.includes('search'));

    // Generate trend data (simplified)
    const trends = this.generateTrendData(startTime, now, recentMetrics, recentSessions);

    return {
      overview: {
        avgResponseTime: Math.round(avgResponseTime),
        totalRequests: apiMetrics.length,
        errorRate: Math.round(errorRate * 100) / 100,
        activeUsers: recentSessions.length,
        systemUptime: Date.now() - this.startTime.getTime()
      },
      apiMetrics: {
        bedrockLatency: this.calculateAverage(bedrockMetrics),
        diagramGeneration: this.calculateAverage(diagramMetrics),
        validation: this.calculateAverage(validationMetrics),
        componentSearch: this.calculateAverage(searchMetrics)
      },
      userMetrics: {
        avgSessionDuration: Math.round(avgSessionDuration / 1000), // Convert to seconds
        avgComponentsPerSession: Math.round(avgComponentsPerSession * 10) / 10,
        conversionRate: Math.round(conversionRate * 100) / 100,
        bounceRate: Math.round((1 - conversionRate) * 100) / 100
      },
      alerts: Array.from(this.alerts.values()).filter(a => !a.resolved),
      trends
    };
  }

  /**
   * Get active alerts
   */
  getActiveAlerts(): PerformanceAlert[] {
    return Array.from(this.alerts.values()).filter(a => !a.resolved);
  }

  /**
   * Resolve an alert
   */
  resolveAlert(alertId: string): boolean {
    const alert = this.alerts.get(alertId);
    if (alert) {
      alert.resolved = true;
      return true;
    }
    return false;
  }

  /**
   * Get user analytics for a session
   */
  getUserAnalytics(sessionId: string): UserAnalytics | undefined {
    return this.userSessions.get(sessionId);
  }

  /**
   * Get all user analytics
   */
  getAllUserAnalytics(): UserAnalytics[] {
    return Array.from(this.userSessions.values());
  }

  /**
   * Clear old metrics (cleanup)
   */
  cleanup(olderThanDays: number = 7): void {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

    // Clean up metrics
    for (const [id, metric] of this.metrics.entries()) {
      if (metric.timestamp < cutoffDate) {
        this.metrics.delete(id);
      }
    }

    // Clean up resolved alerts
    for (const [id, alert] of this.alerts.entries()) {
      if (alert.resolved && alert.timestamp < cutoffDate) {
        this.alerts.delete(id);
      }
    }

    // Clean up old sessions
    for (const [id, session] of this.userSessions.entries()) {
      if (session.sessionStart < cutoffDate) {
        this.userSessions.delete(id);
      }
    }
  }

  /**
   * Private helper methods
   */
  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private checkAlerts(metric: PerformanceMetric): void {
    // Check for slow response times
    if (metric.category === 'api' && metric.unit === 'ms' && metric.value > this.thresholds.slowResponse) {
      const alertId = this.generateId();
      this.alerts.set(alertId, {
        id: alertId,
        type: 'slow_response',
        severity: metric.value > this.thresholds.slowResponse * 2 ? 'high' : 'medium',
        message: `Slow API response detected: ${metric.name} took ${metric.value}ms`,
        threshold: this.thresholds.slowResponse,
        currentValue: metric.value,
        timestamp: new Date(),
        resolved: false
      });
    }

    // Check for slow diagram rendering
    if (metric.name.includes('diagram') && metric.unit === 'ms' && metric.value > this.thresholds.slowDiagramRender) {
      const alertId = this.generateId();
      this.alerts.set(alertId, {
        id: alertId,
        type: 'slow_response',
        severity: 'medium',
        message: `Slow diagram rendering: ${metric.value}ms`,
        threshold: this.thresholds.slowDiagramRender,
        currentValue: metric.value,
        timestamp: new Date(),
        resolved: false
      });
    }
  }

  private calculateAverage(metrics: PerformanceMetric[]): number {
    if (metrics.length === 0) return 0;
    return Math.round(metrics.reduce((sum, m) => sum + m.value, 0) / metrics.length);
  }

  private generateTrendData(
    startTime: Date,
    endTime: Date,
    metrics: PerformanceMetric[],
    sessions: UserAnalytics[]
  ): Array<{ timestamp: Date; responseTime: number; errorRate: number; activeUsers: number }> {
    const trends: Array<{ timestamp: Date; responseTime: number; errorRate: number; activeUsers: number }> = [];
    const intervalMs = (endTime.getTime() - startTime.getTime()) / 10; // 10 data points

    for (let i = 0; i < 10; i++) {
      const intervalStart = new Date(startTime.getTime() + i * intervalMs);
      const intervalEnd = new Date(startTime.getTime() + (i + 1) * intervalMs);

      const intervalMetrics = metrics.filter(m => 
        m.timestamp >= intervalStart && m.timestamp < intervalEnd
      );
      
      const intervalSessions = sessions.filter(s => 
        s.sessionStart >= intervalStart && s.sessionStart < intervalEnd
      );

      const apiMetrics = intervalMetrics.filter(m => m.category === 'api');
      const errorMetrics = intervalMetrics.filter(m => 
        m.metadata?.statusCode && m.metadata.statusCode >= 400
      );

      trends.push({
        timestamp: intervalStart,
        responseTime: this.calculateAverage(apiMetrics),
        errorRate: apiMetrics.length > 0 ? errorMetrics.length / apiMetrics.length : 0,
        activeUsers: intervalSessions.length
      });
    }

    return trends;
  }
}

// Singleton instance
export const performanceMonitor = new PerformanceMonitor();