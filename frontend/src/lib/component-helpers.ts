/**
 * Component Helper Functions
 * 
 * Convenience functions for working with ArchitecturalComponent and DynamicCanvasNodeData.
 * These are not adapter layers - they simply provide convenient access to component data.
 */

import type { ArchitecturalComponent } from '@/types/backend';
import type { DynamicCanvasNodeData } from '@/types/ide';

/**
 * Extract Canvas node data from ArchitecturalComponent
 * This is a convenience function for rendering components on the canvas
 * Supports both old format (icon) and new format (visualization.icon)
 */
export function getNodeDataFromComponent(
  component: ArchitecturalComponent
): DynamicCanvasNodeData {
  // Support both old and new format
  const comp = component as any;
  const iconName = comp.visualization?.icon || comp.icon || 'Shapes';
  const width = comp.visualization?.width;
  const height = comp.visualization?.height;

  return {
    label: component.name,
    model_type: component.type || component.category,
    iconName,
    width,
    height,
    interfaces: component.interfaces, // Include interfaces for dynamic handle generation
    target_addr_base: component.addressMapping?.baseAddress || '-',
    target_addr_space: component.addressMapping?.addressSpace || '-',
    base_address: component.addressMapping?.baseAddress,
    address_mask: component.addressMapping?.addressMask,
    is_read_only: component.addressMapping?.isReadOnly,
  };
}

/**
 * Update ArchitecturalComponent from node data changes
 * Used when user modifies component properties in the inspector
 * Supports both old format (icon) and new format (visualization.icon)
 */
export function updateComponentFromNodeData(
  component: ArchitecturalComponent,
  nodeData: Partial<DynamicCanvasNodeData>
): ArchitecturalComponent {
  // Support both old and new format
  const comp = component as any;
  const existingIcon = comp.visualization?.icon || comp.icon || 'Shapes';
  const existingWidth = comp.visualization?.width;
  const existingHeight = comp.visualization?.height;

  return {
    ...component,
    name: nodeData.label || component.name,
    type: nodeData.model_type || component.type,
    visualization: {
      icon: nodeData.iconName || existingIcon,
      width: nodeData.width ?? existingWidth,
      height: nodeData.height ?? existingHeight,
    },
    addressMapping: {
      baseAddress: nodeData.target_addr_base || component.addressMapping?.baseAddress,
      addressSpace: nodeData.target_addr_space || component.addressMapping?.addressSpace,
      addressMask: nodeData.address_mask || component.addressMapping?.addressMask,
      isReadOnly: nodeData.is_read_only ?? component.addressMapping?.isReadOnly,
    },
  } as ArchitecturalComponent;
}

/**
 * Create a new custom component from node data
 * Used when exporting a canvas node to the component library
 */
export function createCustomComponent(
  nodeData: DynamicCanvasNodeData,
  id?: string
): ArchitecturalComponent {
  return {
    id: id || crypto.randomUUID(),
    name: nodeData.label || 'Custom Component',
    category: 'Custom',
    type: nodeData.model_type || 'Custom',
    properties: {
      interfaces: [],
      protocols: []
    },
    interfaces: [],
    estimatedMetrics: {},
    compatibility: [],
    visualization: {
      icon: nodeData.iconName || 'Box',
      width: nodeData.width,
      height: nodeData.height,
    },
    addressMapping: {
      baseAddress: nodeData.target_addr_base,
      addressSpace: nodeData.target_addr_space,
      addressMask: nodeData.address_mask,
      isReadOnly: nodeData.is_read_only,
    },
    description: '',
    tags: ['custom'],
    customizable: true,
  };
}
