"use client";

import * as React from 'react';
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { CheckCircle, XCircle, ChevronDown, ChevronUp, Info, ThumbsUp, ThumbsDown, MessageSquare } from "lucide-react";
import { cn } from '@/lib/utils';
import type { ComponentSuggestion } from '@/lib/chat-api';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface ComponentSuggestionCardProps {
  suggestion: ComponentSuggestion;
  sessionId?: string;
  onAccept?: (suggestion: ComponentSuggestion) => void;
  onReject?: (suggestion: ComponentSuggestion) => void;
  onViewAlternatives?: (suggestion: ComponentSuggestion) => void;
  onFeedback?: (suggestion: ComponentSuggestion, rating: 'thumbs_up' | 'thumbs_down', comment?: string) => void;
  disabled?: boolean;
}

export function ComponentSuggestionCard({
  suggestion,
  sessionId,
  onAccept,
  onReject,
  onViewAlternatives,
  onFeedback,
  disabled = false,
}: ComponentSuggestionCardProps) {
  const [isExpanded, setIsExpanded] = React.useState(false);
  const [showAlternatives, setShowAlternatives] = React.useState(false);
  const [showFeedbackDialog, setShowFeedbackDialog] = React.useState(false);
  const [feedbackRating, setFeedbackRating] = React.useState<'thumbs_up' | 'thumbs_down' | null>(null);
  const [feedbackComment, setFeedbackComment] = React.useState('');
  const [userFeedback, setUserFeedback] = React.useState<'thumbs_up' | 'thumbs_down' | null>(null);

  const hasAlternatives = suggestion.alternatives && suggestion.alternatives.length > 0;
  const confidencePercent = Math.round(suggestion.confidence * 100);
  
  // Determine confidence color
  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 0.8) return 'bg-green-500';
    if (confidence >= 0.6) return 'bg-yellow-500';
    return 'bg-orange-500';
  };

  const handleAccept = () => {
    if (onAccept && !disabled) {
      onAccept(suggestion);
    }
  };

  const handleReject = () => {
    if (onReject && !disabled) {
      onReject(suggestion);
    }
  };

  const handleViewAlternatives = () => {
    setShowAlternatives(!showAlternatives);
    if (onViewAlternatives && !showAlternatives) {
      onViewAlternatives(suggestion);
    }
  };

  const handleFeedbackClick = (rating: 'thumbs_up' | 'thumbs_down') => {
    setFeedbackRating(rating);
    setShowFeedbackDialog(true);
  };

  const handleSubmitFeedback = () => {
    if (feedbackRating && onFeedback) {
      onFeedback(suggestion, feedbackRating, feedbackComment || undefined);
      setUserFeedback(feedbackRating);
    }
    setShowFeedbackDialog(false);
    setFeedbackComment('');
    setFeedbackRating(null);
  };

  return (
    <Card className="border border-border bg-muted/50">
      <CardContent className="p-3">
        <div className="space-y-2">
          {/* Component Header */}
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <h4 className="font-semibold text-sm text-foreground">
                {suggestion.component.name || 'Unnamed Component'}
              </h4>
              {suggestion.component.category && (
                <Badge variant="outline" className="text-xs mt-1">
                  {suggestion.component.category}
                </Badge>
              )}
            </div>
            <Badge 
              variant="secondary" 
              className={cn("text-xs ml-2", getConfidenceColor(suggestion.confidence))}
            >
              {confidencePercent}%
            </Badge>
          </div>

          {/* Rationale */}
          <p className="text-xs text-muted-foreground">
            {suggestion.rationale}
          </p>

          {/* Component Details (Collapsible) */}
          {suggestion.component.description && (
            <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
              <CollapsibleTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-xs w-full justify-start"
                >
                  {isExpanded ? (
                    <ChevronUp className="h-3 w-3 mr-1" />
                  ) : (
                    <ChevronDown className="h-3 w-3 mr-1" />
                  )}
                  {isExpanded ? 'Hide' : 'Show'} Details
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-2">
                <div className="text-xs space-y-1 p-2 bg-background rounded border border-border">
                  <p className="text-muted-foreground">
                    {suggestion.component.description}
                  </p>
                  {suggestion.component.specifications && (
                    <div className="mt-2">
                      <p className="font-medium text-foreground">Specifications:</p>
                      <ul className="list-disc list-inside text-muted-foreground">
                        {Object.entries(suggestion.component.specifications).map(([key, value]) => (
                          <li key={key}>
                            <span className="font-medium">{key}:</span> {String(value)}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </CollapsibleContent>
            </Collapsible>
          )}

          {/* Alternatives */}
          {hasAlternatives && (
            <Collapsible open={showAlternatives} onOpenChange={setShowAlternatives}>
              <CollapsibleTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-xs w-full justify-start"
                  onClick={handleViewAlternatives}
                >
                  <Info className="h-3 w-3 mr-1" />
                  {showAlternatives ? 'Hide' : 'View'} {suggestion.alternatives!.length} Alternative
                  {suggestion.alternatives!.length > 1 ? 's' : ''}
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-2">
                <div className="space-y-2">
                  {suggestion.alternatives!.map((alt, idx) => (
                    <div
                      key={idx}
                      className="text-xs p-2 bg-background rounded border border-border"
                    >
                      <p className="font-medium text-foreground">{alt.name || 'Alternative'}</p>
                      {alt.description && (
                        <p className="text-muted-foreground mt-1">{alt.description}</p>
                      )}
                    </div>
                  ))}
                </div>
              </CollapsibleContent>
            </Collapsible>
          )}

          {/* Action Buttons */}
          <div className="flex items-center justify-between pt-2 border-t border-border">
            {/* Feedback Buttons */}
            <div className="flex items-center gap-1">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => handleFeedbackClick('thumbs_up')}
                disabled={disabled}
                className={cn(
                  "h-7 w-7 p-0",
                  userFeedback === 'thumbs_up' && "text-green-600 bg-green-50"
                )}
                title="Good suggestion"
              >
                <ThumbsUp className="h-3 w-3" />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => handleFeedbackClick('thumbs_down')}
                disabled={disabled}
                className={cn(
                  "h-7 w-7 p-0",
                  userFeedback === 'thumbs_down' && "text-red-600 bg-red-50"
                )}
                title="Poor suggestion"
              >
                <ThumbsDown className="h-3 w-3" />
              </Button>
            </div>

            {/* Accept/Reject Buttons */}
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="ghost"
                onClick={handleReject}
                disabled={disabled}
                className="h-7 px-3 text-xs hover:bg-destructive/10 hover:text-destructive"
              >
                <XCircle className="h-3 w-3 mr-1" />
                Reject
              </Button>
              <Button
                size="sm"
                variant="default"
                onClick={handleAccept}
                disabled={disabled}
                className="h-7 px-3 text-xs bg-green-600 hover:bg-green-700"
              >
                <CheckCircle className="h-3 w-3 mr-1" />
                Accept
              </Button>
            </div>
          </div>
        </div>
      </CardContent>

      {/* Feedback Dialog */}
      <Dialog open={showFeedbackDialog} onOpenChange={setShowFeedbackDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Provide Feedback</DialogTitle>
            <DialogDescription>
              Help us improve our recommendations by sharing your thoughts on this suggestion.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">Rating:</span>
              {feedbackRating === 'thumbs_up' ? (
                <Badge className="bg-green-100 text-green-700">
                  <ThumbsUp className="h-3 w-3 mr-1" />
                  Helpful
                </Badge>
              ) : (
                <Badge className="bg-red-100 text-red-700">
                  <ThumbsDown className="h-3 w-3 mr-1" />
                  Not Helpful
                </Badge>
              )}
            </div>
            <div className="space-y-2">
              <label htmlFor="feedback-comment" className="text-sm font-medium flex items-center gap-1">
                <MessageSquare className="h-3 w-3" />
                Comment (optional)
              </label>
              <Textarea
                id="feedback-comment"
                placeholder="Tell us more about your feedback..."
                value={feedbackComment}
                onChange={(e) => setFeedbackComment(e.target.value)}
                className="min-h-[100px]"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowFeedbackDialog(false);
                setFeedbackComment('');
                setFeedbackRating(null);
              }}
            >
              Cancel
            </Button>
            <Button onClick={handleSubmitFeedback}>
              Submit Feedback
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
