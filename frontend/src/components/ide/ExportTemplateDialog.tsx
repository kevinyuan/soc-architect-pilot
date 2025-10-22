/**
 * Export Template Dialog
 * Allows admins to export current architecture as a reusable template
 * Supports both creating new templates and updating existing ones
 */

import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { templateAPI, type ArchitectureTemplate } from '@/lib/template-api';
import { Loader2, Plus, RefreshCw, ChevronLeft, ChevronRight } from 'lucide-react';

interface ExportTemplateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onExport: (templateName: string, description: string, existingTemplateId?: string) => void;
  isExporting?: boolean;
}

export function ExportTemplateDialog({
  open,
  onOpenChange,
  onExport,
  isExporting = false
}: ExportTemplateDialogProps) {
  const [mode, setMode] = React.useState<'create' | 'update'>('create');
  const [templateName, setTemplateName] = React.useState('');
  const [description, setDescription] = React.useState('');
  const [selectedTemplateId, setSelectedTemplateId] = React.useState<string>('');
  const [existingTemplates, setExistingTemplates] = React.useState<ArchitectureTemplate[]>([]);
  const [isLoadingTemplates, setIsLoadingTemplates] = React.useState(false);
  const [currentPage, setCurrentPage] = React.useState(1);
  const templatesPerPage = 10;

  // Load existing templates when dialog opens
  React.useEffect(() => {
    if (open) {
      loadExistingTemplates();
    }
  }, [open]);

  // Load template details when a template is selected
  React.useEffect(() => {
    if (mode === 'update' && selectedTemplateId) {
      loadTemplateDetails(selectedTemplateId);
    }
  }, [mode, selectedTemplateId]);

  const loadExistingTemplates = async () => {
    setIsLoadingTemplates(true);
    try {
      const templates = await templateAPI.listTemplates();
      setExistingTemplates(templates);
    } catch (error) {
      console.error('Failed to load templates:', error);
    } finally {
      setIsLoadingTemplates(false);
    }
  };

  const loadTemplateDetails = async (templateId: string) => {
    try {
      const template = await templateAPI.getTemplate(templateId);
      // Preserve existing name and description
      setTemplateName(template.name);
      setDescription(template.description);
    } catch (error) {
      console.error('Failed to load template details:', error);
    }
  };

  const handleExport = () => {
    if (mode === 'create') {
      if (!templateName.trim() || !description.trim()) {
        return;
      }
      onExport(templateName.trim(), description.trim());
    } else {
      // Update mode - pass existing template ID
      if (!selectedTemplateId) {
        return;
      }
      onExport(templateName.trim(), description.trim(), selectedTemplateId);
    }
  };

  const handleClose = () => {
    if (!isExporting) {
      setMode('create');
      setTemplateName('');
      setDescription('');
      setSelectedTemplateId('');
      setCurrentPage(1);
      onOpenChange(false);
    }
  };

  const isValid = mode === 'create' 
    ? templateName.trim().length > 0 && description.trim().length > 0
    : selectedTemplateId.length > 0;

  // Pagination calculations
  const totalTemplates = existingTemplates.length;
  const totalPages = Math.ceil(totalTemplates / templatesPerPage);
  const startIndex = (currentPage - 1) * templatesPerPage;
  const endIndex = Math.min(startIndex + templatesPerPage, totalTemplates);
  const paginatedTemplates = existingTemplates.slice(startIndex, endIndex);

  const handlePreviousPage = () => {
    setCurrentPage(prev => Math.max(1, prev - 1));
  };

  const handleNextPage = () => {
    setCurrentPage(prev => Math.min(totalPages, prev + 1));
  };

  const handleSelectTemplate = (templateId: string) => {
    setSelectedTemplateId(templateId);
    loadTemplateDetails(templateId);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[700px] max-h-[90vh]">
        <DialogHeader>
          <DialogTitle>Export as Template</DialogTitle>
          <DialogDescription>
            Create a new template or update an existing one with the current architecture.
          </DialogDescription>
        </DialogHeader>

        <Tabs 
          value={mode} 
          onValueChange={(value) => {
            setMode(value as 'create' | 'update');
            setSelectedTemplateId('');
            setCurrentPage(1);
            if (value === 'create') {
              setTemplateName('');
              setDescription('');
            }
          }}
          className="w-full"
        >
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="create" disabled={isExporting}>
              <Plus className="h-4 w-4 mr-2" />
              Create New
            </TabsTrigger>
            <TabsTrigger value="update" disabled={isExporting}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Update Existing
            </TabsTrigger>
          </TabsList>

          <TabsContent value="create" className="space-y-4 mt-4">

            {/* Create New Template Form */}
            <div className="grid gap-2">
              <Label htmlFor="create-template-name">
                Template Name <span className="text-red-500">*</span>
              </Label>
              <Input
                id="create-template-name"
                placeholder="e.g., IoT Gateway SoC"
                value={templateName}
                onChange={(e) => setTemplateName(e.target.value)}
                disabled={isExporting}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="create-template-description">
                Description <span className="text-red-500">*</span>
              </Label>
              <Textarea
                id="create-template-description"
                placeholder="Describe the architecture, use cases, and key features..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                disabled={isExporting}
                rows={4}
                className="resize-none"
              />
            </div>

            <div className="text-sm text-muted-foreground bg-muted/50 p-3 rounded-md">
              <p>
                <span className="font-medium">New template</span> will be saved to:{' '}
                <code className="text-xs bg-background px-1 py-0.5 rounded">data/design_examples/</code>
              </p>
            </div>
          </TabsContent>

          <TabsContent value="update" className="space-y-4 mt-4">
            {/* Template Selection Table */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>
                  Select Template to Update <span className="text-red-500">*</span>
                </Label>
                {totalTemplates > 0 && (
                  <span className="text-xs text-muted-foreground">
                    {startIndex + 1}-{endIndex} of {totalTemplates} templates
                  </span>
                )}
              </div>

              {isLoadingTemplates ? (
                <div className="flex items-center justify-center py-8 text-sm text-muted-foreground border rounded-md">
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Loading templates...
                </div>
              ) : existingTemplates.length === 0 ? (
                <div className="text-sm text-muted-foreground py-8 text-center border rounded-md">
                  No existing templates found. Switch to "Create New" tab.
                </div>
              ) : (
                <>
                  <div className="border rounded-md">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-[50px]"></TableHead>
                          <TableHead>Template Name</TableHead>
                          <TableHead>Description</TableHead>
                          <TableHead className="w-[100px]">Nodes</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {paginatedTemplates.map((template) => (
                          <TableRow
                            key={template.id}
                            className={`cursor-pointer ${selectedTemplateId === template.id ? 'bg-muted' : ''}`}
                            onClick={() => handleSelectTemplate(template.id)}
                          >
                            <TableCell>
                              <div className={`w-4 h-4 rounded-full border-2 ${
                                selectedTemplateId === template.id 
                                  ? 'border-primary bg-primary' 
                                  : 'border-muted-foreground'
                              }`}>
                                {selectedTemplateId === template.id && (
                                  <div className="w-full h-full rounded-full bg-background scale-50" />
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="font-medium">{template.name}</TableCell>
                            <TableCell className="text-sm text-muted-foreground truncate max-w-[250px]">
                              {template.description}
                            </TableCell>
                            <TableCell className="text-sm text-center">{template.nodeCount}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>

                  {/* Pagination Controls */}
                  {totalPages > 1 && (
                    <div className="flex items-center justify-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handlePreviousPage}
                        disabled={currentPage === 1 || isExporting}
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </Button>
                      <span className="text-sm text-muted-foreground">
                        Page {currentPage} of {totalPages}
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleNextPage}
                        disabled={currentPage === totalPages || isExporting}
                      >
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Selected Template Details */}
            {selectedTemplateId && (
              <>
                <div className="grid gap-2">
                  <Label htmlFor="update-template-name">
                    Template Name <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="update-template-name"
                    value={templateName}
                    disabled
                    readOnly
                    className="bg-muted"
                  />
                  <p className="text-xs text-muted-foreground">
                    Template name is preserved from the existing template
                  </p>
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="update-template-description">
                    Description <span className="text-red-500">*</span>
                  </Label>
                  <Textarea
                    id="update-template-description"
                    value={description}
                    disabled
                    readOnly
                    rows={4}
                    className="resize-none bg-muted"
                  />
                  <p className="text-xs text-muted-foreground">
                    Description is preserved from the existing template
                  </p>
                </div>

                <div className="text-sm text-muted-foreground bg-muted/50 p-3 rounded-md">
                  <p>
                    <span className="font-medium">Updating</span> will replace the diagram while preserving the template's name and description.
                  </p>
                </div>
              </>
            )}
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={handleClose}
            disabled={isExporting}
          >
            Cancel
          </Button>
          <Button
            onClick={handleExport}
            disabled={!isValid || isExporting}
          >
            {isExporting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                {mode === 'create' ? 'Creating...' : 'Updating...'}
              </>
            ) : (
              <>
                {mode === 'create' ? 'Create Template' : 'Update Template'}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
