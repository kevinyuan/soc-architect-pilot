"use client";

import * as React from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Mail, Check, X } from "lucide-react";
import { workspaceAPI } from "@/lib/workspace-api";
import { useToast } from "@/hooks/use-toast";

interface ShareProjectDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  projectName: string;
}

export function ShareProjectDialog({
  isOpen,
  onOpenChange,
  projectId,
  projectName,
}: ShareProjectDialogProps) {
  const [email, setEmail] = React.useState("");
  const [isSharing, setIsSharing] = React.useState(false);
  const [errorMessage, setErrorMessage] = React.useState("");
  const { toast } = useToast();

  // Reset state when dialog opens/closes
  React.useEffect(() => {
    if (!isOpen) {
      setEmail("");
      setErrorMessage("");
    }
  }, [isOpen]);

  const handleShare = async () => {
    if (!email.trim()) {
      setErrorMessage("Email is required");
      return;
    }

    if (!email.includes("@")) {
      setErrorMessage("Please enter a valid email address");
      return;
    }

    try {
      setIsSharing(true);
      setErrorMessage("");

      // Validate email first
      const validationResult = await workspaceAPI.validateEmail(email);

      if (!validationResult.exists) {
        setErrorMessage("No user found with this email address");
        setIsSharing(false);
        return;
      }

      // Share the project
      await workspaceAPI.shareProject(projectId, email);

      toast({
        title: "Project shared successfully",
        description: `"${projectName}" is now shared with ${email}`,
      });

      onOpenChange(false);
    } catch (error: any) {
      console.error("Share project error:", error);

      let errorMsg = "Failed to share project";
      if (error.response?.data?.error?.code === "ALREADY_SHARED") {
        errorMsg = "This project is already shared with this user";
      }

      setErrorMessage(errorMsg);
    } finally {
      setIsSharing(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Share Project</DialogTitle>
          <DialogDescription>
            Share "{projectName}" with another user (read-only access)
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="email">User Email</Label>
            <Input
              id="email"
              type="email"
              placeholder="Enter user email address"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setErrorMessage("");
              }}
            />
            {errorMessage && (
              <p className="text-sm text-red-600">
                {errorMessage}
              </p>
            )}
          </div>

          <div className="rounded-lg border border-border bg-muted/30 p-4">
            <h4 className="text-sm font-medium mb-2">Shared User Permissions</h4>
            <ul className="text-sm text-muted-foreground space-y-1">
              <li className="flex items-start gap-2">
                <Check className="h-4 w-4 mt-0.5 text-green-500" />
                <span>View project in read-only mode</span>
              </li>
              <li className="flex items-start gap-2">
                <Check className="h-4 w-4 mt-0.5 text-green-500" />
                <span>Clone project to their own workspace</span>
              </li>
              <li className="flex items-start gap-2">
                <X className="h-4 w-4 mt-0.5 text-red-500" />
                <span>Cannot modify the original project</span>
              </li>
            </ul>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleShare}
            disabled={!email || isSharing}
          >
            {isSharing ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Sharing...
              </>
            ) : (
              <>
                <Mail className="mr-2 h-4 w-4" />
                Share Project
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
