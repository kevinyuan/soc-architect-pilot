
"use client";

import * as React from 'react';
import { CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Info, MoveHorizontal, MoveVertical, Hash, Type, RotateCcw, Share2, TableProperties, ImageIcon, Unlink2, Link2, GitBranch, Save, Network, Plus, Trash2, Edit, ChevronDown, Copy } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import type { Node } from 'reactflow';
import type { DynamicCanvasNodeData, UserComponentDefinition } from '@/types/ide';
import type { InterfaceDefinition } from '@/types/backend';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import { addNewComponentToLib, updateLibComponent } from '@/actions/workspace-actions';
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

// Fallback for crypto.randomUUID
function uuidv4() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c == 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

interface ArchitectInspectorProps {
  selectedNode: Node<DynamicCanvasNodeData> | null;
  onNodeUpdate: (originalNodeId: string, newId: string, updatedDataProps: Partial<DynamicCanvasNodeData>) => void;
  currentUser: string | null;
  currentProjectRoot: string | null;
  projectId?: string;
  onComponentExported: () => void;
  onSaveCanvas?: () => Promise<void>;
  isAdmin?: boolean;
}

export function ArchitectInspector({ selectedNode, onNodeUpdate, currentUser, currentProjectRoot, projectId, onComponentExported, onSaveCanvas, isAdmin = false }: ArchitectInspectorProps) {
  const { toast } = useToast();
  const [isExporting, setIsExporting] = React.useState(false);
  const [showLibraryDialog, setShowLibraryDialog] = React.useState(false);
  const [libraryAction, setLibraryAction] = React.useState<'add' | 'update'>('add');
  const [targetLibrary, setTargetLibrary] = React.useState<'user' | 'shared'>('user');
  const [showLatencyMatrix, setShowLatencyMatrix] = React.useState(false);
  const [pathLatencies, setPathLatencies] = React.useState<Map<string, number>>(new Map());
  
  const [formData, setFormData] = React.useState({
    id: '',
    label: '',
    model_type: '',
    iconName: '',
    width: '',
    height: '',
    target_addr_base: '',
    target_addr_space: '',
  });

  const [interfaces, setInterfaces] = React.useState<InterfaceDefinition[]>([]);
  const [editingInterfaceId, setEditingInterfaceId] = React.useState<string | null>(null);
  const [selectedInterfaceIds, setSelectedInterfaceIds] = React.useState<Set<string>>(new Set());

  React.useEffect(() => {
    if (selectedNode) {
      setFormData({
        id: selectedNode.id || '',
        label: selectedNode.data.label || '',
        model_type: selectedNode.data.model_type || '',
        iconName: selectedNode.data.iconName || '',
        width: selectedNode.data.width !== undefined ? String(selectedNode.data.width) : '',
        height: selectedNode.data.height !== undefined ? String(selectedNode.data.height) : '',
        target_addr_base: selectedNode.data.target_addr_base || '',
        target_addr_space: selectedNode.data.target_addr_space || '',
      });
      // Load interfaces with proper type casting
      const nodeInterfaces = (selectedNode.data.interfaces || []).map(iface => ({
        ...iface,
        direction: iface.direction as InterfaceDefinition['direction'],
        busType: (iface.busType || 'Custom') as InterfaceDefinition['busType'],
      }));
      setInterfaces(nodeInterfaces);
      
      // Load existing path latencies
      const latencyMap = new Map<string, number>();
      if (selectedNode.data.properties?.pathLatencies && Array.isArray(selectedNode.data.properties.pathLatencies)) {
        selectedNode.data.properties.pathLatencies.forEach((path: any) => {
          const key = `${path.from}-${path.to}`;
          latencyMap.set(key, path.latencyTypical || 0);
        });
      }
      setPathLatencies(latencyMap);
    } else {
      setFormData({
        id: '',
        label: '',
        model_type: '',
        iconName: '',
        width: '',
        height: '',
        target_addr_base: '',
        target_addr_space: '',
      });
      setInterfaces([]);
      setPathLatencies(new Map());
    }
    setEditingInterfaceId(null);
    setSelectedInterfaceIds(new Set()); // Clear selection when node changes
  }, [selectedNode]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };


  const processAndApplyChanges = (propsToUpdate: {
    id?: string;
    label?: string;
    model_type?: string;
    iconName?: string;
    width?: string | number;
    height?: string | number;
    target_addr_base?: string;
    target_addr_space?: string;
  }) => {
    if (!selectedNode) return;

    const dataPropsForUpdate: Partial<DynamicCanvasNodeData> = {};
    let idChanged = false;
    let newIdValue = selectedNode.id;

    if (propsToUpdate.id !== undefined && propsToUpdate.id !== selectedNode.id) {
        if (propsToUpdate.id.trim() === "") {
            toast({ title: "Error", description: "Node ID cannot be empty.", variant: "destructive" });
            setFormData(prev => ({ ...prev, id: selectedNode.id })); // Revert ID in form
            return;
        }
        newIdValue = propsToUpdate.id;
        idChanged = true;
    }

    if (propsToUpdate.label !== undefined && propsToUpdate.label !== selectedNode.data.label) {
      dataPropsForUpdate.label = propsToUpdate.label;
    }
    if (propsToUpdate.model_type !== undefined && propsToUpdate.model_type !== selectedNode.data.model_type) {
      dataPropsForUpdate.model_type = propsToUpdate.model_type;
    }
    if (propsToUpdate.iconName !== undefined && propsToUpdate.iconName !== selectedNode.data.iconName) {
      dataPropsForUpdate.iconName = propsToUpdate.iconName;
    }

    if (propsToUpdate.width !== undefined) {
      const numValue = parseInt(String(propsToUpdate.width), 10);
      if (!isNaN(numValue) && numValue > 0) {
        if (numValue !== selectedNode.data.width) dataPropsForUpdate.width = numValue;
      } else if (String(propsToUpdate.width) === '' && selectedNode.data.width !== undefined) {
        dataPropsForUpdate.width = undefined; // Allow clearing to default
      } else if (String(propsToUpdate.width) !== '') { // Invalid input, revert form
        setFormData(prev => ({ ...prev, width: selectedNode.data.width !== undefined ? String(selectedNode.data.width) : ''}));
      }
    }

    if (propsToUpdate.height !== undefined) {
      const numValue = parseInt(String(propsToUpdate.height), 10);
      if (!isNaN(numValue) && numValue > 0) {
        if (numValue !== selectedNode.data.height) dataPropsForUpdate.height = numValue;
      } else if (String(propsToUpdate.height) === '' && selectedNode.data.height !== undefined) {
        dataPropsForUpdate.height = undefined; // Allow clearing to default
      } else if (String(propsToUpdate.height) !== '') { // Invalid input, revert form
        setFormData(prev => ({ ...prev, height: selectedNode.data.height !== undefined ? String(selectedNode.data.height) : ''}));
      }
    }
    
    if (propsToUpdate.target_addr_base !== undefined && propsToUpdate.target_addr_base !== selectedNode.data.target_addr_base) {
      dataPropsForUpdate.target_addr_base = propsToUpdate.target_addr_base;
    }
    if (propsToUpdate.target_addr_space !== undefined && propsToUpdate.target_addr_space !== selectedNode.data.target_addr_space) {
      dataPropsForUpdate.target_addr_space = propsToUpdate.target_addr_space;
    }

    if (idChanged || Object.keys(dataPropsForUpdate).length > 0) {
      onNodeUpdate(selectedNode.id, newIdValue, dataPropsForUpdate);
    }
  };

  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    if (!selectedNode) return;
    const { name } = e.target;
    const value = formData[name as keyof typeof formData]; // Type assertion
    const singlePropToUpdate: any = {};
    singlePropToUpdate[name] = value;
    processAndApplyChanges(singlePropToUpdate);
  };

  const handleApplyAllChanges = async () => {
    if (!selectedNode) return;

    const parsedWidth = parseInt(formData.width, 10);
    const widthForUpdate = formData.width === '' ? undefined : (isNaN(parsedWidth) || parsedWidth <= 0 ? undefined : parsedWidth);

    const parsedHeight = parseInt(formData.height, 10);
    const heightForUpdate = formData.height === '' ? undefined : (isNaN(parsedHeight) || parsedHeight <= 0 ? undefined : parsedHeight);

    const allPropsForData: Partial<DynamicCanvasNodeData> = {
        label: formData.label,
        model_type: formData.model_type,
        iconName: formData.iconName,
        width: widthForUpdate,
        height: heightForUpdate,
        target_addr_base: formData.target_addr_base,
        target_addr_space: formData.target_addr_space,
    };
     if (formData.id.trim() === "") {
        toast({ title: "Error", description: "Node ID cannot be empty.", variant: "destructive" });
        setFormData(prev => ({ ...prev, id: selectedNode.id }));
        return;
    }
    onNodeUpdate(selectedNode.id, formData.id, allPropsForData);

    // Trigger canvas save after applying changes
    if (onSaveCanvas) {
      try {
        await onSaveCanvas();
      } catch (error) {
        console.error('Failed to save canvas after applying changes:', error);
      }
    }
  };

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleApplyAllChanges();
    }
  };

  const handleResetToDefault = () => {
    if (selectedNode) {
      const resetData: Partial<DynamicCanvasNodeData> = {
          target_addr_base: '',
          target_addr_space: '',
          width: 160, 
          height: 80, 
          iconName: "Shapes" 
      };
      setFormData(prev => ({
          ...prev,
          target_addr_base: '',
          target_addr_space: '',
          width: '160',
          height: '80',
          iconName: 'Shapes',
      }));
      onNodeUpdate(selectedNode.id, selectedNode.id, resetData);
      toast({ title: "Reset to Default", description: "Properties reset to default values." });
    }
  };

  // Interface management functions
  const handleAddInterface = async () => {
    const newInterface: InterfaceDefinition = {
      id: window.crypto?.randomUUID?.() || uuidv4(),
      name: `Interface${interfaces.length + 1}`,
      busType: 'AXI4',
      direction: 'master',
      dataWidth: 32,
      dataFlowRole: 'none',
    };
    const updatedInterfaces = [...interfaces, newInterface];
    setInterfaces(updatedInterfaces);
    setEditingInterfaceId(newInterface.id);
    // Auto-save to node
    if (selectedNode) {
      onNodeUpdate(selectedNode.id, selectedNode.id, { interfaces: updatedInterfaces });
      
      // Trigger canvas save to persist changes
      if (onSaveCanvas) {
        try {
          await onSaveCanvas();
        } catch (error) {
          console.error('Failed to save canvas after adding interface:', error);
        }
      }
    }
  };

  const handleUpdateInterface = async (id: string, updates: Partial<InterfaceDefinition>) => {
    const updatedInterfaces = interfaces.map(iface =>
      iface.id === id ? { ...iface, ...updates } : iface
    );
    setInterfaces(updatedInterfaces);
    // Auto-save to node
    if (selectedNode) {
      onNodeUpdate(selectedNode.id, selectedNode.id, { interfaces: updatedInterfaces });
      
      // Trigger canvas save to persist changes
      if (onSaveCanvas) {
        try {
          await onSaveCanvas();
        } catch (error) {
          console.error('Failed to save canvas after interface update:', error);
        }
      }
    }
  };

  const handleDeleteInterface = async (id: string) => {
    const updatedInterfaces = interfaces.filter(iface => iface.id !== id);
    setInterfaces(updatedInterfaces);
    if (editingInterfaceId === id) {
      setEditingInterfaceId(null);
    }
    // Remove from selection if selected
    setSelectedInterfaceIds(prev => {
      const newSet = new Set(prev);
      newSet.delete(id);
      return newSet;
    });
    // Auto-save to node
    if (selectedNode) {
      onNodeUpdate(selectedNode.id, selectedNode.id, { interfaces: updatedInterfaces });
      
      // Trigger canvas save to persist changes
      if (onSaveCanvas) {
        try {
          await onSaveCanvas();
        } catch (error) {
          console.error('Failed to save canvas after deleting interface:', error);
        }
      }
    }
    toast({ title: "Interface Deleted", description: "Interface removed successfully." });
  };

  const handleDuplicateInterface = async (id: string) => {
    const interfaceToDuplicate = interfaces.find(iface => iface.id === id);
    if (!interfaceToDuplicate) return;

    // Generate unique name with (Copy) suffix
    const baseName = interfaceToDuplicate.name;
    let copyNumber = 0;
    let newName = `${baseName} (Copy)`;
    
    // Check if name already exists and increment copy number
    while (interfaces.some(iface => iface.name === newName)) {
      copyNumber++;
      newName = `${baseName} (Copy ${copyNumber})`;
    }

    // Create duplicated interface with new ID and name
    const duplicatedInterface: InterfaceDefinition = {
      ...interfaceToDuplicate,
      id: `iface-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      name: newName
    };

    const updatedInterfaces = [...interfaces, duplicatedInterface];
    setInterfaces(updatedInterfaces);

    // Auto-save to node
    if (selectedNode) {
      onNodeUpdate(selectedNode.id, selectedNode.id, { interfaces: updatedInterfaces });
      
      // Trigger canvas save to persist changes
      if (onSaveCanvas) {
        try {
          await onSaveCanvas();
        } catch (error) {
          console.error('Failed to save canvas after duplicating interface:', error);
        }
      }
    }

    toast({ 
      title: "Interface Duplicated", 
      description: `Created "${newName}" from "${baseName}".` 
    });
  };

  // Handle checkbox toggle for single interface
  const handleToggleInterfaceSelection = (id: string) => {
    setSelectedInterfaceIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  };

  // Handle select/deselect all interfaces
  const handleToggleAllInterfaces = () => {
    if (selectedInterfaceIds.size === interfaces.length) {
      // Deselect all
      setSelectedInterfaceIds(new Set());
    } else {
      // Select all
      setSelectedInterfaceIds(new Set(interfaces.map(iface => iface.id)));
    }
  };

  // Handle delete selected interfaces
  const handleDeleteSelectedInterfaces = async () => {
    const updatedInterfaces = interfaces.filter(iface => !selectedInterfaceIds.has(iface.id));
    setInterfaces(updatedInterfaces);

    // Clear editing state if deleted
    if (editingInterfaceId && selectedInterfaceIds.has(editingInterfaceId)) {
      setEditingInterfaceId(null);
    }

    // Clear selection
    const deletedCount = selectedInterfaceIds.size;
    setSelectedInterfaceIds(new Set());

    // Auto-save to node
    if (selectedNode) {
      onNodeUpdate(selectedNode.id, selectedNode.id, { interfaces: updatedInterfaces });
      
      // Trigger canvas save to persist changes
      if (onSaveCanvas) {
        try {
          await onSaveCanvas();
        } catch (error) {
          console.error('Failed to save canvas after deleting interfaces:', error);
        }
      }
    }

    toast({
      title: "Interfaces Deleted",
      description: `${deletedCount} interface(s) removed successfully.`
    });
  };

  // Handle Add New Component to Lib
  const handleAddNewToLib = async () => {
    if (isAdmin) {
      // Show dialog for admin to select target library
      setLibraryAction('add');
      setShowLibraryDialog(true);
    } else {
      // Non-admin: directly add to user library
      await executeAddNewToLib('user');
    }
  };

  // Handle Update Lib Component
  const handleUpdateLib = async () => {
    if (isAdmin) {
      // Show dialog for admin to select target library
      setLibraryAction('update');
      setShowLibraryDialog(true);
    } else {
      // Non-admin: directly update user library
      await executeUpdateLib('user');
    }
  };

  // Execute Add New Component
  const executeAddNewToLib = async (target: 'user' | 'shared') => {
    if (!selectedNode || !currentUser || !currentProjectRoot) {
      toast({
        title: "Error",
        description: "Cannot add component. Ensure a node is selected and a project is open.",
        variant: "destructive",
      });
      return;
    }

    setIsExporting(true);
    try {
      const { createCustomComponent } = await import('@/lib/component-helpers');
      const componentToAdd = createCustomComponent(selectedNode.data);

      if (!projectId) {
        toast({ title: "Error", description: "No project selected", variant: "destructive" });
        return;
      }

      const newId = await addNewComponentToLib(projectId, componentToAdd, target);
      const targetName = target === 'shared' ? 'Shared' : 'User';
      toast({
        title: "Component Added",
        description: `"${componentToAdd.name}" added to ${targetName} Library with new ID: ${newId.slice(0, 8)}...`,
      });
      onComponentExported();
    } catch (error) {
      console.error("Failed to add component:", error);
      toast({
        title: "Add Failed",
        description: (error instanceof Error ? error.message : "An unknown error occurred."),
        variant: "destructive",
      });
    } finally {
      setIsExporting(false);
      setShowLibraryDialog(false);
    }
  };

  // Execute Update Lib Component
  const executeUpdateLib = async (target: 'user' | 'shared') => {
    if (!selectedNode || !currentUser || !currentProjectRoot) {
      toast({
        title: "Error",
        description: "Cannot update component. Ensure a node is selected and a project is open.",
        variant: "destructive",
      });
      return;
    }

    setIsExporting(true);
    try {
      const { createCustomComponent } = await import('@/lib/component-helpers');
      // Use existing component ID from node data
      const existingId = selectedNode.data.componentId || selectedNode.id;
      const componentToUpdate = createCustomComponent(selectedNode.data, existingId);

      if (!projectId) {
        toast({ title: "Error", description: "No project selected", variant: "destructive" });
        return;
      }

      await updateLibComponent(projectId, componentToUpdate, target);
      const targetName = target === 'shared' ? 'Shared' : 'User';
      toast({
        title: "Component Updated",
        description: `"${componentToUpdate.name}" updated in ${targetName} Library (ID: ${existingId.slice(0, 8)}...).`,
      });
      onComponentExported();
    } catch (error) {
      console.error("Failed to update component:", error);
      toast({
        title: "Update Failed",
        description: (error instanceof Error ? error.message : "An unknown error occurred."),
        variant: "destructive",
      });
    } finally {
      setIsExporting(false);
      setShowLibraryDialog(false);
    }
  };

  // Handle library dialog confirmation
  const handleLibraryDialogConfirm = () => {
    if (libraryAction === 'add') {
      executeAddNewToLib(targetLibrary);
    } else {
      executeUpdateLib(targetLibrary);
    }
  };

  if (!selectedNode) {
    return (
      <div className={cn("h-full w-full bg-sidebar text-sidebar-foreground")}>
        <div className="p-2">
          <CardHeader className="p-2 pt-1 pb-2">
            <CardTitle className="text-base font-semibold text-sidebar-foreground flex items-center">
              <TableProperties className="h-4 w-4 mr-2 text-sidebar-primary" />
              Inspector
            </CardTitle>
          </CardHeader>
          <Separator className="my-2 border-sidebar-border" />
          <CardContent className="p-2">
            <p className="text-xs text-sidebar-foreground/70 text-center">
              Select a component on the canvas to see its properties.
            </p>
          </CardContent>
        </div>
      </div>
    );
  }

  return (
    <ScrollArea className={cn("h-full w-full bg-sidebar text-sidebar-foreground")}>
      <div className="p-2">
        <CardHeader className="p-2 pt-1 pb-2">
          <CardTitle className="text-base font-semibold text-sidebar-foreground flex items-center">
            <TableProperties className="h-4 w-4 mr-2 text-sidebar-primary" />
            Inspector
          </CardTitle>
        </CardHeader>
        <Separator className="my-2 border-sidebar-border" />
        <CardContent className="p-2">
          <Tabs defaultValue="node" className="w-full">
            <TabsList className="grid w-full grid-cols-3 mb-3">
              <TabsTrigger value="node" className="text-xs">Node</TabsTrigger>
              <TabsTrigger value="interfaces" className="text-xs">
                I/O ({interfaces.length})
              </TabsTrigger>
              <TabsTrigger value="paths" className="text-xs">
                Path
              </TabsTrigger>
            </TabsList>

            {/* Tab 1: Node Properties */}
            <TabsContent value="node" className="space-y-3 mt-0">
              <div className="space-y-1">
                <Label htmlFor="node-id-input" className="text-xs flex items-center text-sidebar-foreground/90">
                  <Hash className="h-3 w-3 mr-1.5 text-sidebar-primary" /> Node ID
                </Label>
            <Input
              id="node-id-input"
              name="id"
              type="text"
              value={formData.id}
              onChange={handleChange}
              onBlur={handleBlur}
              onKeyDown={handleInputKeyDown}
              className="h-8 text-xs bg-card border-sidebar-border focus:border-sidebar-primary focus:ring-1 focus:ring-sidebar-primary font-mono"
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="node-icon-name" className="text-xs flex items-center text-sidebar-foreground/90">
              <ImageIcon className="h-3 w-3 mr-1.5 text-sidebar-primary" /> Icon Name (Lucide)
            </Label>
            <Input
              id="node-icon-name"
              name="iconName"
              type="text"
              value={formData.iconName}
              onChange={handleChange}
              onBlur={handleBlur}
              onKeyDown={handleInputKeyDown}
              placeholder="e.g., Cpu, MemoryStick"
              className="h-8 text-xs bg-card border-sidebar-border focus:border-sidebar-primary focus:ring-1 focus:ring-sidebar-primary"
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="node-model-type" className="text-xs flex items-center text-sidebar-foreground/90">
              <Type className="h-3 w-3 mr-1.5 text-sidebar-primary" /> Component Type
            </Label>
            <Input
              id="node-model-type"
              name="model_type"
              type="text"
              value={formData.model_type}
              onChange={handleChange}
              onBlur={handleBlur}
              onKeyDown={handleInputKeyDown}
              placeholder="e.g., CPU Core, Memory Controller"
              className="h-8 text-xs bg-card border-sidebar-border focus:border-sidebar-primary focus:ring-1 focus:ring-sidebar-primary"
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="node-label" className="text-xs flex items-center text-sidebar-foreground/90">
              <Info className="h-3 w-3 mr-1.5 text-sidebar-primary" /> Display Name
            </Label>
            <Input
              id="node-label"
              name="label"
              type="text"
              value={formData.label}
              onChange={handleChange}
              onBlur={handleBlur}
              onKeyDown={handleInputKeyDown}
              className="h-8 text-xs bg-card border-sidebar-border focus:border-sidebar-primary focus:ring-1 focus:ring-sidebar-primary"
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="node-width" className="text-xs flex items-center text-sidebar-foreground/90">
              <MoveHorizontal className="h-3 w-3 mr-1.5 text-sidebar-primary" /> Width (px)
            </Label>
            <Input
              id="node-width"
              name="width"
              type="number"
              value={formData.width}
              onChange={handleChange}
              onBlur={handleBlur}
              onKeyDown={handleInputKeyDown}
              placeholder="e.g., 150"
              min="10"
              className="h-8 text-xs bg-card border-sidebar-border focus:border-sidebar-primary focus:ring-1 focus:ring-sidebar-primary"
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="node-height" className="text-xs flex items-center text-sidebar-foreground/90">
              <MoveVertical className="h-3 w-3 mr-1.5 text-sidebar-primary" /> Height (px)
            </Label>
            <Input
              id="node-height"
              name="height"
              type="number"
              value={formData.height}
              onChange={handleChange}
              onBlur={handleBlur}
              onKeyDown={handleInputKeyDown}
              placeholder="e.g., 75"
              min="10"
              className="h-8 text-xs bg-card border-sidebar-border focus:border-sidebar-primary focus:ring-1 focus:ring-sidebar-primary"
            />
          </div>
          
          <Separator className="my-3 border-sidebar-border" />
          
          <div className="space-y-1 mt-2">
            <Label htmlFor="target-address-space-input" className="text-xs flex items-center text-sidebar-foreground/90">
              <Unlink2 className="h-3 w-3 mr-1.5 text-sidebar-primary" /> Target Address Space
            </Label>
            <Input
              id="target-address-space-input"
              name="target_addr_space"
              type="text"
              value={formData.target_addr_space}
              onChange={handleChange}
              onBlur={handleBlur}
              onKeyDown={handleInputKeyDown}
              placeholder="e.g., 0x0000FFFF or 64KB"
              className="h-8 text-xs bg-card border-sidebar-border focus:border-sidebar-primary focus:ring-1 focus:ring-sidebar-primary font-mono"
            />
          </div>
          <div className="space-y-1 mt-2">
            <Label htmlFor="target-address-base-input" className="text-xs flex items-center text-sidebar-foreground/90">
              <Link2 className="h-3 w-3 mr-1.5 text-sidebar-primary" /> Target Address Base
            </Label>
            <Input
              id="target-address-base-input"
              name="target_addr_base"
              type="text"
              value={formData.target_addr_base}
              onChange={handleChange}
              onBlur={handleBlur}
              onKeyDown={handleInputKeyDown}
              placeholder="e.g., 0x10000000"
              className="h-8 text-xs bg-card border-sidebar-border focus:border-sidebar-primary focus:ring-1 focus:ring-sidebar-primary font-mono"
            />
          </div>
            </TabsContent>

            {/* Tab 2: Interfaces */}
            <TabsContent value="interfaces" className="space-y-3 mt-0">
              <div className="flex items-center justify-between mb-2">
                <Label className="text-xs text-sidebar-foreground/90">
                  Manage component interfaces
                </Label>
                <Button
                  onClick={handleAddInterface}
                  size="sm"
                  variant="outline"
                  className="h-7 px-2 text-xs border-sidebar-border hover:bg-sidebar-accent/50"
                >
                  <Plus className="h-3 w-3 mr-1" />
                  Add
                </Button>
              </div>

              {/* Bulk actions bar */}
              {interfaces.length > 0 && (
                <div className="flex items-center justify-between gap-2 p-2 bg-sidebar-accent/20 rounded border border-sidebar-border">
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="select-all-interfaces"
                      checked={interfaces.length > 0 && selectedInterfaceIds.size === interfaces.length}
                      onCheckedChange={handleToggleAllInterfaces}
                      className="h-4 w-4"
                    />
                    <Label
                      htmlFor="select-all-interfaces"
                      className="text-xs cursor-pointer select-none"
                    >
                      {selectedInterfaceIds.size === interfaces.length ? 'Deselect All' : 'Select All'}
                      {selectedInterfaceIds.size > 0 && ` (${selectedInterfaceIds.size})`}
                    </Label>
                  </div>
                  {selectedInterfaceIds.size > 0 && (
                    <Button
                      onClick={handleDeleteSelectedInterfaces}
                      size="sm"
                      variant="destructive"
                      className="h-7 px-2 text-xs"
                    >
                      <Trash2 className="h-3 w-3 mr-1" />
                      Delete Selected
                    </Button>
                  )}
                </div>
              )}

            {interfaces.length === 0 ? (
              <div className="text-xs text-sidebar-foreground/50 text-center py-4 border border-dashed border-sidebar-border rounded">
                No interfaces defined
              </div>
            ) : (
              <Accordion type="single" collapsible className="w-full">
                {interfaces.map((iface) => (
                  <AccordionItem key={iface.id} value={iface.id} className="border-sidebar-border">
                    <div className="flex items-center gap-1 pr-2">
                      <Checkbox
                        checked={selectedInterfaceIds.has(iface.id)}
                        onCheckedChange={() => handleToggleInterfaceSelection(iface.id)}
                        className="h-4 w-4 ml-2"
                      />
                      <AccordionTrigger className="py-2 px-2 hover:bg-sidebar-accent/30 rounded text-xs flex-1 [&[data-state=open]>div>svg]:rotate-180">
                        <div className="flex items-center gap-2 flex-1">
                          <Network className="h-3 w-3 text-sidebar-primary" />
                          <span className="font-medium">{iface.name}</span>
                          <span className="text-sidebar-foreground/50">({iface.busType})</span>
                        </div>
                      </AccordionTrigger>
                      <div className="flex items-center gap-0.5 ml-auto">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDuplicateInterface(iface.id);
                          }}
                          className="h-7 w-7 p-0 hover:bg-sidebar-accent"
                          title="Duplicate interface"
                        >
                          <Copy className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteInterface(iface.id);
                          }}
                          className="h-7 w-7 p-0 hover:bg-destructive/10 hover:text-destructive"
                          title="Delete interface"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                    <AccordionContent className="px-2 pb-2">
                      <div className="space-y-2 mt-2">
                        <div className="space-y-1">
                          <Label htmlFor={`iface-name-${iface.id}`} className="text-xs text-sidebar-foreground/90">Name</Label>
                          <Input
                            id={`iface-name-${iface.id}`}
                            type="text"
                            value={iface.name}
                            onChange={(e) => handleUpdateInterface(iface.id, { name: e.target.value })}
                            className="h-7 text-xs bg-card border-sidebar-border"
                          />
                        </div>

                        <div className="space-y-1">
                          <Label htmlFor={`iface-bustype-${iface.id}`} className="text-xs text-sidebar-foreground/90">Bus Type</Label>
                          <Select
                            value={iface.busType}
                            onValueChange={(value) => handleUpdateInterface(iface.id, { busType: value as InterfaceDefinition['busType'] })}
                          >
                            <SelectTrigger id={`iface-bustype-${iface.id}`} className="h-7 text-xs bg-card border-sidebar-border">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="PCIe">PCIe</SelectItem>
                              <SelectItem value="DDR">DDR</SelectItem>
                              <SelectItem value="AXI4">AXI4</SelectItem>
                              <SelectItem value="AXI4-Lite">AXI4-Lite</SelectItem>
                              <SelectItem value="AXI4-Stream">AXI4-Stream</SelectItem>
                              <SelectItem value="AHB">AHB</SelectItem>
                              <SelectItem value="APB">APB</SelectItem>
                              <SelectItem value="GPIO">GPIO</SelectItem>
                              <SelectItem value="SPI">SPI</SelectItem>
                              <SelectItem value="I2C">I2C</SelectItem>
                              <SelectItem value="UART">UART</SelectItem>
                              <SelectItem value="Ethernet">Ethernet</SelectItem>
                              <SelectItem value="WiFi">WiFi</SelectItem>
                              <SelectItem value="USB">USB</SelectItem>
                              <SelectItem value="CXL">CXL</SelectItem>
                              <SelectItem value="Custom">Custom</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="space-y-1">
                          <Label htmlFor={`iface-direction-${iface.id}`} className="text-xs text-sidebar-foreground/90">Direction</Label>
                          <Select
                            value={iface.direction || undefined}
                            onValueChange={(value) => handleUpdateInterface(iface.id, { direction: value as InterfaceDefinition['direction'] })}
                          >
                            <SelectTrigger id={`iface-direction-${iface.id}`} className="h-7 text-xs bg-card border-sidebar-border">
                              <SelectValue placeholder="Select direction" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="master">Master (Bus)</SelectItem>
                              <SelectItem value="slave">Slave (Bus)</SelectItem>
                              <SelectItem value="master & slave">Master & Slave (Bidirectional Bus)</SelectItem>
                              <SelectItem value="input">Input (Signal)</SelectItem>
                              <SelectItem value="output">Output (Signal)</SelectItem>
                              <SelectItem value="inout">Inout (Bidirectional Signal)</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="space-y-1">
                          <Label htmlFor={`iface-dataflow-${iface.id}`} className="text-xs text-sidebar-foreground/90">Data Flow Role</Label>
                          <Select
                            value={iface.dataFlowRole || 'none'}
                            onValueChange={(value) => handleUpdateInterface(iface.id, { dataFlowRole: value as InterfaceDefinition['dataFlowRole'] })}
                          >
                            <SelectTrigger id={`iface-dataflow-${iface.id}`} className="h-7 text-xs bg-card border-sidebar-border">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="initiator">Initiator (sends data)</SelectItem>
                              <SelectItem value="target">Target (receives data)</SelectItem>
                              <SelectItem value="both">Both (initiator & target)</SelectItem>
                              <SelectItem value="none">None (intermediate)</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="space-y-1">
                          <Label className="text-xs text-sidebar-foreground/90">Placement</Label>
                          <div className="relative w-full aspect-square max-w-[90px] mx-auto">
                            {/* Center box representing the component */}
                            <div className="absolute inset-[32%] bg-muted border border-border rounded flex items-center justify-center">
                              <span className="text-[7px] text-muted-foreground font-medium">Node</span>
                            </div>
                            
                            {/* Top button */}
                            <Button
                              variant={iface.placement === 'north' ? 'default' : 'outline'}
                              size="sm"
                              onClick={() => handleUpdateInterface(iface.id, { placement: 'north' })}
                              className="absolute top-0 left-1/2 -translate-x-1/2 h-5 w-10 text-[9px] px-0.5"
                            >
                              ▲
                            </Button>
                            
                            {/* Bottom button */}
                            <Button
                              variant={iface.placement === 'south' ? 'default' : 'outline'}
                              size="sm"
                              onClick={() => handleUpdateInterface(iface.id, { placement: 'south' })}
                              className="absolute bottom-0 left-1/2 -translate-x-1/2 h-5 w-10 text-[9px] px-0.5"
                            >
                              ▼
                            </Button>
                            
                            {/* Left button */}
                            <Button
                              variant={iface.placement === 'west' ? 'default' : 'outline'}
                              size="sm"
                              onClick={() => handleUpdateInterface(iface.id, { placement: 'west' })}
                              className="absolute left-0 top-1/2 -translate-y-1/2 h-10 w-5 text-[9px] px-0 py-0.5"
                            >
                              ◀
                            </Button>
                            
                            {/* Right button */}
                            <Button
                              variant={iface.placement === 'east' ? 'default' : 'outline'}
                              size="sm"
                              onClick={() => handleUpdateInterface(iface.id, { placement: 'east' })}
                              className="absolute right-0 top-1/2 -translate-y-1/2 h-10 w-5 text-[9px] px-0 py-0.5"
                            >
                              ▶
                            </Button>
                          </div>
                        </div>

                        <div className="space-y-1">
                          <Label htmlFor={`iface-datawidth-${iface.id}`} className="text-xs text-sidebar-foreground/90">Data Width (bits)</Label>
                          <Input
                            id={`iface-datawidth-${iface.id}`}
                            type="number"
                            value={iface.dataWidth || ''}
                            onChange={(e) => handleUpdateInterface(iface.id, { dataWidth: parseInt(e.target.value) || undefined })}
                            placeholder="e.g., 32"
                            className="h-7 text-xs bg-card border-sidebar-border"
                          />
                        </div>

                        <div className="space-y-1">
                          <Label htmlFor={`iface-addrwidth-${iface.id}`} className="text-xs text-sidebar-foreground/90">Address Width (bits)</Label>
                          <Input
                            id={`iface-addrwidth-${iface.id}`}
                            type="number"
                            value={iface.addrWidth || ''}
                            onChange={(e) => handleUpdateInterface(iface.id, { addrWidth: parseInt(e.target.value) || undefined })}
                            placeholder="e.g., 32"
                            className="h-7 text-xs bg-card border-sidebar-border"
                          />
                        </div>

                        <div className="space-y-1">
                          <Label htmlFor={`iface-idwidth-${iface.id}`} className="text-xs text-sidebar-foreground/90">ID Width (bits)</Label>
                          <Input
                            id={`iface-idwidth-${iface.id}`}
                            type="number"
                            value={iface.idWidth || ''}
                            onChange={(e) => handleUpdateInterface(iface.id, { idWidth: parseInt(e.target.value) || undefined })}
                            placeholder="e.g., 4"
                            className="h-7 text-xs bg-card border-sidebar-border"
                          />
                        </div>

                        <div className="space-y-1">
                          <Label htmlFor={`iface-speed-${iface.id}`} className="text-xs text-sidebar-foreground/90">Speed (optional)</Label>
                          <Input
                            id={`iface-speed-${iface.id}`}
                            type="text"
                            value={iface.speed || ''}
                            onChange={(e) => handleUpdateInterface(iface.id, { speed: e.target.value || undefined })}
                            placeholder="e.g., 100MHz"
                            className="h-7 text-xs bg-card border-sidebar-border"
                          />
                        </div>

                        <div className="space-y-1">
                          <Label htmlFor={`iface-protocol-${iface.id}`} className="text-xs text-sidebar-foreground/90">Protocol (optional)</Label>
                          <Input
                            id={`iface-protocol-${iface.id}`}
                            type="text"
                            value={iface.protocol || ''}
                            onChange={(e) => handleUpdateInterface(iface.id, { protocol: e.target.value || undefined })}
                            placeholder="e.g., AXI4"
                            className="h-7 text-xs bg-card border-sidebar-border"
                          />
                        </div>
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            )}
            </TabsContent>

            {/* Tab 3: Paths */}
            <TabsContent value="paths" className="space-y-3 mt-0">
              <div className="space-y-3">
                <div className="space-y-2">
                  <Label htmlFor="default-latency" className="text-xs flex items-center text-sidebar-foreground/90">
                    <Network className="h-3 w-3 mr-1.5 text-sidebar-primary" /> Default Path Latency (cycles)
                  </Label>
                  <Input
                    id="default-latency"
                    type="number"
                    min="1"
                    placeholder="10"
                    value={selectedNode?.data.properties?.defaultPathLatency || ''}
                    onChange={(e) => {
                      if (selectedNode) {
                        const value = e.target.value ? parseInt(e.target.value) : undefined;
                        onNodeUpdate(selectedNode.id, selectedNode.id, {
                          ...selectedNode.data,
                          properties: {
                            ...selectedNode.data.properties,
                            defaultPathLatency: value
                          }
                        });
                      }
                    }}
                    className="h-8 text-xs bg-card border-sidebar-border"
                  />
                  <p className="text-xs text-muted-foreground">
                    Default latency for all internal paths (default: 10 cycles)
                  </p>
                </div>

                <Separator />

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs text-sidebar-foreground/90">Internal Paths</Label>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => setShowLatencyMatrix(true)}
                      disabled={interfaces.length < 2}
                    >
                      <TableProperties className="h-3 w-3 mr-1" />
                      Latency Matrix
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Internal paths connect interfaces within this module. If not explicitly defined, bandwidth is calculated as min(from_interface_bw, to_interface_bw).
                  </p>
                  
                  {interfaces.length < 2 ? (
                    <div className="text-xs text-muted-foreground text-center py-4 border border-dashed rounded">
                      Add at least 2 interfaces to configure paths
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="text-xs font-medium">Auto-calculated Paths:</div>
                      <div className="space-y-1 max-h-[200px] overflow-y-auto">
                        {interfaces.filter(i => i.dataFlowRole === 'initiator' || i.dataFlowRole === 'both').flatMap(from => 
                          interfaces.filter(i => i.dataFlowRole === 'target' || i.dataFlowRole === 'both').map(to => {
                            if (from.id === to.id) return null;

                            // Calculate default bandwidth
                            const fromWidth = from.dataWidth || 32;
                            const fromSpeed = from.speed || from.performance?.maxFrequency || '1000 MHz';
                            const fromFreq = parseFloat(fromSpeed.replace(/[^\d.]/g, '')) * (fromSpeed.includes('GHz') ? 1000 : 1);
                            const fromBW = fromWidth * fromFreq;

                            const toWidth = to.dataWidth || 32;
                            const toSpeed = to.speed || to.performance?.maxFrequency || '1000 MHz';
                            const toFreq = parseFloat(toSpeed.replace(/[^\d.]/g, '')) * (toSpeed.includes('GHz') ? 1000 : 1);
                            const toBW = toWidth * toFreq;
                            
                            const minBW = Math.min(fromBW, toBW);
                            const bwGbps = (minBW / 1000).toFixed(2);
                            
                            return (
                              <div key={`${from.id}-${to.id}`} className="text-xs p-2 bg-muted/30 rounded border">
                                <div className="font-mono">
                                  {from.name} → {to.name}
                                </div>
                                <div className="text-muted-foreground mt-1">
                                  BW: {bwGbps} Gbit/s | Latency: {selectedNode?.data.properties?.defaultPathLatency || 10} cycles
                                </div>
                              </div>
                            );
                          })
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </TabsContent>
          </Tabs>

          <Separator className="my-3 border-sidebar-border" />

          <Button onClick={handleApplyAllChanges} className="w-full mt-2 bg-sidebar-primary hover:bg-sidebar-primary/90 text-sidebar-primary-foreground h-9">
            <Save className="h-4 w-4 mr-2" />
            Apply Changes
          </Button>

          <Separator className="my-3 border-sidebar-border" />

          {/* Library Actions */}
          <div className="flex flex-col space-y-2">
            <Label className="text-xs text-sidebar-foreground/90">Component Library</Label>
            <Button onClick={handleAddNewToLib} variant="outline" className="w-full h-9 text-xs border-sidebar-border hover:bg-sidebar-accent/50" disabled={isExporting || !currentUser || !currentProjectRoot}>
              <Plus className="h-3.5 w-3.5 mr-1.5" />
              {isExporting ? "Saving..." : "Add New to Lib"}
            </Button>
            <Button onClick={handleUpdateLib} variant="outline" className="w-full h-9 text-xs border-sidebar-border hover:bg-sidebar-accent/50" disabled={isExporting || !currentUser || !currentProjectRoot}>
              <Save className="h-3.5 w-3.5 mr-1.5" />
              {isExporting ? "Updating..." : "Update Lib Component"}
            </Button>
            <Button onClick={handleResetToDefault} variant="outline" className="w-full h-9 text-xs border-sidebar-border hover:bg-sidebar-accent/50">
              <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
              Reset to Default
            </Button>
          </div>
        </CardContent>
      </div>

      {/* Library Target Selection Dialog (Admin Only) */}
      <Dialog open={showLibraryDialog} onOpenChange={setShowLibraryDialog}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>
              {libraryAction === 'add' ? 'Add New Component to Library' : 'Update Library Component'}
            </DialogTitle>
            <DialogDescription>
              {libraryAction === 'add'
                ? 'Select the target library for the new component. A new component ID will be generated.'
                : 'Select the target library to update. The existing component ID will be preserved.'}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <RadioGroup value={targetLibrary} onValueChange={(value) => setTargetLibrary(value as 'user' | 'shared')}>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="user" id="lib-user" />
                <Label htmlFor="lib-user" className="font-normal cursor-pointer">
                  User Project Library
                  <span className="block text-xs text-muted-foreground">
                    Save to your personal project library
                  </span>
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="shared" id="lib-shared" />
                <Label htmlFor="lib-shared" className="font-normal cursor-pointer">
                  System Shared Library (Admin)
                  <span className="block text-xs text-muted-foreground">
                    Save to system-wide shared library
                  </span>
                </Label>
              </div>
            </RadioGroup>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowLibraryDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleLibraryDialogConfirm} disabled={isExporting}>
              {isExporting ? 'Saving...' : (libraryAction === 'add' ? 'Add Component' : 'Update Component')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Latency Matrix Dialog */}
      <Dialog open={showLatencyMatrix} onOpenChange={setShowLatencyMatrix}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>Latency Matrix</DialogTitle>
            <DialogDescription>
              Configure path-specific latencies between interfaces. Values are in cycles. Empty cells use the default path latency ({selectedNode?.data.properties?.defaultPathLatency || 10} cycles).
            </DialogDescription>
          </DialogHeader>
          
          <div className="flex-1 overflow-auto">
            <div className="relative">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr>
                    <th className="border p-2 bg-muted/50 sticky top-0 left-0 z-20 min-w-[120px]">
                      From \ To
                    </th>
                    {interfaces.map(toInterface => (
                      <th key={toInterface.id} className="border p-2 bg-muted/50 sticky top-0 z-10 min-w-[100px]">
                        <div className="text-xs font-medium truncate" title={toInterface.name}>
                          {toInterface.name}
                        </div>
                        <div className="text-[10px] text-muted-foreground truncate">
                          {toInterface.busType}
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {interfaces.map(fromInterface => (
                    <tr key={fromInterface.id}>
                      <td className="border p-2 bg-muted/30 sticky left-0 z-10 font-medium">
                        <div className="text-xs truncate" title={fromInterface.name}>
                          {fromInterface.name}
                        </div>
                        <div className="text-[10px] text-muted-foreground truncate">
                          {fromInterface.busType}
                        </div>
                      </td>
                      {interfaces.map(toInterface => {
                        const pathKey = `${fromInterface.id}-${toInterface.id}`;
                        const isSameInterface = fromInterface.id === toInterface.id;
                        const currentValue = pathLatencies.get(pathKey);
                        
                        return (
                          <td key={toInterface.id} className={cn(
                            "border p-1",
                            isSameInterface && "bg-muted/50"
                          )}>
                            {isSameInterface ? (
                              <div className="text-center text-xs text-muted-foreground">-</div>
                            ) : (
                              <Input
                                type="number"
                                min="0"
                                step="1"
                                placeholder={String(selectedNode?.data.properties?.defaultPathLatency || 10)}
                                value={currentValue !== undefined ? currentValue : ''}
                                onChange={(e) => {
                                  const newMap = new Map(pathLatencies);
                                  const value = e.target.value;
                                  if (value === '') {
                                    newMap.delete(pathKey);
                                  } else {
                                    const numValue = parseInt(value);
                                    if (!isNaN(numValue) && numValue >= 0) {
                                      newMap.set(pathKey, numValue);
                                    }
                                  }
                                  setPathLatencies(newMap);
                                }}
                                className="h-8 text-xs text-center"
                              />
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          
          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setShowLatencyMatrix(false)}>
              Cancel
            </Button>
            <Button onClick={() => {
              // Convert pathLatencies Map to array format for storage
              const pathLatenciesArray = Array.from(pathLatencies.entries()).map(([key, latencyTypical]) => {
                const [from, to] = key.split('-');
                return {
                  pathId: `path-${from}-${to}`,
                  from,
                  to,
                  latencyTypical
                };
              });
              
              // Update node properties
              if (selectedNode) {
                const updatedProperties = {
                  ...selectedNode.data.properties,
                  pathLatencies: pathLatenciesArray
                };
                
                onNodeUpdate(selectedNode.id, selectedNode.id, {
                  properties: updatedProperties
                });
              }
              
              setShowLatencyMatrix(false);
              toast({
                title: "Latency Matrix Updated",
                description: `Configured ${pathLatenciesArray.length} path-specific latencies.`,
              });
            }}>
              <Save className="h-4 w-4 mr-2" />
              Save Latencies
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ScrollArea>
  );
}

