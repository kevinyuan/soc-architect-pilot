"use client";

import * as React from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardTitle } from "@/components/ui/card";
import {
  Lightbulb as ConceptIcon,
  Blocks as ArchitectIcon,
  ShieldCheck as DRCIcon,
  BarChart3 as AnalyticsIcon,
  ScrollText as BOMIcon,
  Rocket as DeliverIcon,
  ArrowRight,
  ArrowLeft,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface WorkflowGuideOverlayProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}

interface WorkflowStepProps {
  title: string;
  description: string;
  icon: React.ElementType;
  stageNumber: number;
  details: string;
  className?: string;
}

const WorkflowStep: React.FC<WorkflowStepProps> = ({
  title,
  description,
  icon: Icon,
  stageNumber,
  details,
  className
}) => {
  return (
    <Card className={cn("shadow-md border-border/70 rounded-lg h-full", className)}>
      <CardContent className="p-6 h-full flex flex-col">
        <div className="flex items-start gap-4 flex-1">
          {/* Stage Number Badge */}
          <div className="flex-shrink-0 w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
            <span className="text-lg font-bold text-primary">{stageNumber}</span>
          </div>

          {/* Content */}
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <Icon className="h-5 w-5 text-primary" />
              <CardTitle className="text-lg">{title}</CardTitle>
            </div>
            <CardDescription className="text-sm mb-2">{description}</CardDescription>
            <p className="text-sm text-muted-foreground leading-relaxed">{details}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export function WorkflowGuideOverlay({ isOpen, onOpenChange }: WorkflowGuideOverlayProps) {
  const workflowSteps = [
    {
      title: "Concept",
      description: "AI chat for requirements",
      icon: ConceptIcon,
      stageNumber: 1,
      details: "Start by describing your project idea in natural language. The AI assistant will help you refine your requirements and create a detailed specification.",
    },
    {
      title: "Architecture",
      description: "Canvas-based design",
      icon: ArchitectIcon,
      stageNumber: 2,
      details: "Design your system architecture using an intuitive canvas interface. Create components, define connections, and visualize your entire system structure.",
    },
    {
      title: "Validation",
      description: "Design rule checks (DRC)",
      icon: DRCIcon,
      stageNumber: 3,
      details: "Run automated design rule checks to validate your architecture. Identify potential issues, conflicts, and ensure your design meets all requirements.",
    },
    {
      title: "Analytics",
      description: "Performance insights",
      icon: AnalyticsIcon,
      stageNumber: 4,
      details: "Analyze your system's performance characteristics. Get insights on resource usage, bottlenecks, and optimization opportunities.",
    },
    {
      title: "BOM",
      description: "Bill of Materials",
      icon: BOMIcon,
      stageNumber: 5,
      details: "Generate comprehensive bill of materials for your design. Review component lists, specifications, and cost estimates.",
    },
    {
      title: "Deliver",
      description: "Export and deploy",
      icon: DeliverIcon,
      stageNumber: 6,
      details: "Export your completed design files, documentation, and deliverables. Package everything for manufacturing, deployment, or handoff to the next team.",
    },
  ];

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[90vw] max-h-[85vh] overflow-hidden flex flex-col p-0">
        {/* Header */}
        <DialogHeader className="px-9 pt-6 pb-4 border-b">
          <div>
            <DialogTitle className="text-2xl">Development Workflow</DialogTitle>
            <DialogDescription className="mt-2">
              Follow these stages to build your project from concept to completion
            </DialogDescription>
          </div>
        </DialogHeader>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto px-9 py-4">
          {/* Workflow with arrows - 2 cards per row */}
          <div className="flex flex-col">
            {/* Row 1: Steps 1, 2 */}
            <div className="flex items-center gap-4">
              <div className="flex-1">
                <WorkflowStep {...workflowSteps[0]} />
              </div>
              <ArrowRight className="h-8 w-8 text-primary flex-shrink-0" />
              <div className="flex-1">
                <WorkflowStep {...workflowSteps[1]} />
              </div>
            </div>

            {/* Arrow from 2 to 3 */}
            <div className="flex items-center gap-4">
              <div className="flex-1"></div>
              <div className="w-8"></div>
              <div className="flex-1 flex justify-center">
                <ArrowRight className="h-8 w-8 text-primary rotate-90 flex-shrink-0" />
              </div>
            </div>

            {/* Row 2: Steps 4, 3 */}
            <div className="flex items-center gap-4">
              <div className="flex-1">
                <WorkflowStep {...workflowSteps[3]} />
              </div>
              <ArrowLeft className="h-8 w-8 text-primary flex-shrink-0" />
              <div className="flex-1">
                <WorkflowStep {...workflowSteps[2]} />
              </div>
            </div>

            {/* Arrow from 4 to 5 */}
            <div className="flex items-center gap-4">
              <div className="flex-1 flex justify-center">
                <ArrowRight className="h-8 w-8 text-primary rotate-90 flex-shrink-0" />
              </div>
              <div className="w-8"></div>
              <div className="flex-1"></div>
            </div>

            {/* Row 3: Steps 5, 6 */}
            <div className="flex items-center gap-4">
              <div className="flex-1">
                <WorkflowStep {...workflowSteps[4]} />
              </div>
              <ArrowRight className="h-8 w-8 text-primary flex-shrink-0" />
              <div className="flex-1">
                <WorkflowStep {...workflowSteps[5]} />
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-9 py-4 border-t bg-muted/30">
          <div className="flex justify-between items-center">
            <p className="text-sm text-muted-foreground">
              You can access this guide anytime by clicking the <strong>?</strong> icon
            </p>
            <Button onClick={() => onOpenChange(false)}>
              Got it
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
