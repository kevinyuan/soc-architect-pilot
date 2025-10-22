// Diagram Validator - Pre-process diagrams before DRC
// Detects and fixes invalid edges and connections

export interface ValidationIssue {
  type: 'missing_node' | 'missing_interface' | 'reversed_connection' | 'duplicate_node_id';
  severity: 'error' | 'warning';
  edgeId?: string;
  nodeId?: string;
  description: string;
  autoFix?: 'remove' | 'reverse' | 'rename' | 'remove_duplicate' | 'offset_position';
  details: {
    source?: string;
    target?: string;
    sourceHandle?: string;
    targetHandle?: string;
    sourceNodeName?: string;
    targetNodeName?: string;
    duplicateIds?: string[];
    newId?: string;
    duplicateStrategy?: 'different_position' | 'exact_duplicate' | 'same_position_different_props';
    nodeIndices?: number[];
    positions?: Array<{ x: number; y: number }>;
    properties?: any[];
  };
}

export interface ValidationResult {
  isValid: boolean;
  issues: ValidationIssue[];
  fixedDiagram?: any;
}

export function validateDiagram(diagram: any): ValidationResult {
  const issues: ValidationIssue[] = [];
  
  if (!diagram || !diagram.nodes || !diagram.edges) {
    return { isValid: true, issues: [] };
  }

  // Check for duplicate node IDs with intelligent detection
  const nodeIdCounts = new Map<string, number>();
  const nodeIdIndices = new Map<string, number[]>();
  
  diagram.nodes.forEach((node: any, index: number) => {
    const count = nodeIdCounts.get(node.id) || 0;
    nodeIdCounts.set(node.id, count + 1);
    
    const indices = nodeIdIndices.get(node.id) || [];
    indices.push(index);
    nodeIdIndices.set(node.id, indices);
  });

  // Analyze duplicate node IDs
  nodeIdCounts.forEach((count, nodeId) => {
    if (count > 1) {
      const indices = nodeIdIndices.get(nodeId) || [];
      const duplicateNodes = indices.map(i => diagram.nodes[i]);
      const firstNode = duplicateNodes[0];
      const nodeName = firstNode?.data?.label || nodeId;
      
      // Analyze positions and properties
      const positions = duplicateNodes.map((n: any) => n.position || { x: 0, y: 0 });
      const properties = duplicateNodes.map((n: any) => ({
        label: n.data?.label,
        type: n.data?.model_type,
        interfaces: n.data?.interfaces?.length || 0,
        width: n.width,
        height: n.height,
      }));

      // Check if positions are different (tolerance: 10px)
      const positionsDifferent = positions.some((pos: any, i: number) => {
        if (i === 0) return false;
        const firstPos = positions[0];
        return Math.abs(pos.x - firstPos.x) > 10 || Math.abs(pos.y - firstPos.y) > 10;
      });

      // Check if all properties are identical
      const propertiesIdentical = properties.every((prop: any, i: number) => {
        if (i === 0) return true;
        const firstProp = properties[0];
        return JSON.stringify(prop) === JSON.stringify(firstProp);
      });

      // Determine strategy
      let strategy: 'different_position' | 'exact_duplicate' | 'same_position_different_props';
      let autoFix: 'rename' | 'remove_duplicate' | 'offset_position';
      let description: string;

      if (positionsDifferent) {
        // Case 1: Different positions - likely intentional duplicates, rename them
        strategy = 'different_position';
        autoFix = 'rename';
        description = `Duplicate node ID '${nodeId}' (${nodeName}) found ${count} times at different positions. These appear to be separate components that need unique IDs.`;
      } else if (propertiesIdentical) {
        // Case 2: Same position, identical properties - likely save/generation error, remove duplicates
        strategy = 'exact_duplicate';
        autoFix = 'remove_duplicate';
        description = `Duplicate node ID '${nodeId}' (${nodeName}) found ${count} times at the same position with identical properties. This appears to be a save/generation error - duplicates will be removed.`;
      } else {
        // Case 3: Same position, different properties - likely placement overlap, offset positions
        strategy = 'same_position_different_props';
        autoFix = 'offset_position';
        description = `Duplicate node ID '${nodeId}' (${nodeName}) found ${count} times at the same position with different properties. These appear to be overlapping components - positions will be offset.`;
      }

      issues.push({
        type: 'duplicate_node_id',
        severity: 'error',
        nodeId: nodeId,
        description,
        autoFix,
        details: {
          duplicateIds: [nodeId],
          duplicateStrategy: strategy,
          nodeIndices: indices,
          positions,
          properties,
        }
      });
    }
  });

  const nodeIds = new Set(diagram.nodes.map((n: any) => n.id));
  const nodeInterfaces = new Map<string, Set<string>>();

  // Build interface map
  diagram.nodes.forEach((node: any) => {
    const interfaces = node.data?.interfaces || [];
    const interfaceIds = new Set<string>(interfaces.map((i: any) => i.id as string));
    nodeInterfaces.set(node.id, interfaceIds);
  });

  // Check each edge
  diagram.edges.forEach((edge: any) => {
    const sourceExists = nodeIds.has(edge.source);
    const targetExists = nodeIds.has(edge.target);

    // Issue 1: Missing source node
    if (!sourceExists) {
      issues.push({
        type: 'missing_node',
        severity: 'error',
        edgeId: edge.id,
        description: `Source node '${edge.source}' does not exist`,
        autoFix: 'remove',
        details: {
          source: edge.source,
          target: edge.target,
          sourceHandle: edge.sourceHandle,
          targetHandle: edge.targetHandle
        }
      });
      return;
    }

    // Issue 2: Missing target node
    if (!targetExists) {
      issues.push({
        type: 'missing_node',
        severity: 'error',
        edgeId: edge.id,
        description: `Target node '${edge.target}' does not exist`,
        autoFix: 'remove',
        details: {
          source: edge.source,
          target: edge.target,
          sourceHandle: edge.sourceHandle,
          targetHandle: edge.targetHandle
        }
      });
      return;
    }

    // Get node names for better error messages
    const sourceNode = diagram.nodes.find((n: any) => n.id === edge.source);
    const targetNode = diagram.nodes.find((n: any) => n.id === edge.target);
    const sourceNodeName = sourceNode?.data?.label || edge.source;
    const targetNodeName = targetNode?.data?.label || edge.target;

    // Issue 3: Missing source interface
    if (edge.sourceHandle) {
      const sourceInterfaces = nodeInterfaces.get(edge.source);
      if (sourceInterfaces && !sourceInterfaces.has(edge.sourceHandle)) {
        issues.push({
          type: 'missing_interface',
          severity: 'error',
          edgeId: edge.id,
          description: `Source interface '${edge.sourceHandle}' does not exist on node '${sourceNodeName}'`,
          autoFix: 'remove',
          details: {
            source: edge.source,
            target: edge.target,
            sourceHandle: edge.sourceHandle,
            targetHandle: edge.targetHandle,
            sourceNodeName,
            targetNodeName
          }
        });
        return;
      }
    }

    // Issue 4: Missing target interface
    if (edge.targetHandle) {
      const targetInterfaces = nodeInterfaces.get(edge.target);
      if (targetInterfaces && !targetInterfaces.has(edge.targetHandle)) {
        issues.push({
          type: 'missing_interface',
          severity: 'error',
          edgeId: edge.id,
          description: `Target interface '${edge.targetHandle}' does not exist on node '${targetNodeName}'`,
          autoFix: 'remove',
          details: {
            source: edge.source,
            target: edge.target,
            sourceHandle: edge.sourceHandle,
            targetHandle: edge.targetHandle,
            sourceNodeName,
            targetNodeName
          }
        });
        return;
      }
    }

    // Issue 5: Check for reversed connections (slave -> master)
    if (edge.sourceHandle && edge.targetHandle) {
      const sourceInterfaces = sourceNode?.data?.interfaces || [];
      const targetInterfaces = targetNode?.data?.interfaces || [];
      
      const sourceIntf = sourceInterfaces.find((i: any) => i.id === edge.sourceHandle);
      const targetIntf = targetInterfaces.find((i: any) => i.id === edge.targetHandle);

      if (sourceIntf && targetIntf) {
        // Check if connection is reversed (slave -> master)
        if (sourceIntf.direction === 'slave' && targetIntf.direction === 'master') {
          issues.push({
            type: 'reversed_connection',
            severity: 'warning',
            edgeId: edge.id,
            description: `Connection appears reversed: slave '${sourceNodeName}.${sourceIntf.name}' → master '${targetNodeName}.${targetIntf.name}'`,
            autoFix: 'reverse',
            details: {
              source: edge.source,
              target: edge.target,
              sourceHandle: edge.sourceHandle,
              targetHandle: edge.targetHandle,
              sourceNodeName,
              targetNodeName
            }
          });
        }
      }
    }
  });

  return {
    isValid: issues.length === 0,
    issues
  };
}

export function applyAutoFixes(diagram: any, issues: ValidationIssue[]): any {
  const fixedDiagram = JSON.parse(JSON.stringify(diagram)); // Deep clone
  const edgesToRemove = new Set<string>();
  const edgesToReverse: string[] = [];
  const nodeIdRenames = new Map<string, string>();
  const nodeIndicesToRemove = new Set<number>();

  // First pass: Handle duplicate node IDs with intelligent strategies
  issues.forEach(issue => {
    if (issue.type === 'duplicate_node_id' && issue.nodeId && issue.details.nodeIndices) {
      const indices = issue.details.nodeIndices;
      const strategy = issue.details.duplicateStrategy;

      if (strategy === 'different_position' && issue.autoFix === 'rename') {
        // Case 1: Different positions - rename duplicates
        indices.forEach((index: number, i: number) => {
          if (i > 0) {
            const node = fixedDiagram.nodes[index];
            const newId = `${node.id}-${i}`;
            nodeIdRenames.set(`${node.id}_${index}`, newId);
            console.log(`[Validator] Case 1: Renaming duplicate node at different position ${node.id} → ${newId}`);
          }
        });
      } else if (strategy === 'exact_duplicate' && issue.autoFix === 'remove_duplicate') {
        // Case 2: Exact duplicates - remove all but first
        indices.forEach((index: number, i: number) => {
          if (i > 0) {
            nodeIndicesToRemove.add(index);
            console.log(`[Validator] Case 2: Removing exact duplicate node at index ${index}`);
          }
        });
      } else if (strategy === 'same_position_different_props' && issue.autoFix === 'offset_position') {
        // Case 3: Same position, different props - offset positions and rename
        indices.forEach((index: number, i: number) => {
          if (i > 0) {
            const node = fixedDiagram.nodes[index];
            const newId = `${node.id}-${i}`;
            nodeIdRenames.set(`${node.id}_${index}`, newId);
            // Offset position by 50px * i
            if (node.position) {
              node.position.x += 50 * i;
              node.position.y += 50 * i;
            }
            console.log(`[Validator] Case 3: Offsetting position and renaming ${node.id} → ${newId}`);
          }
        });
      }
    }
  });

  // Apply node ID renames
  fixedDiagram.nodes = fixedDiagram.nodes.map((node: any, index: number) => {
    const renameKey = `${node.id}_${index}`;
    if (nodeIdRenames.has(renameKey)) {
      return { ...node, id: nodeIdRenames.get(renameKey) };
    }
    return node;
  });

  // Remove duplicate nodes
  fixedDiagram.nodes = fixedDiagram.nodes.filter((_: any, index: number) => 
    !nodeIndicesToRemove.has(index)
  );

  // Update edge references to renamed nodes
  const oldToNewIdMap = new Map<string, string>();
  nodeIdRenames.forEach((newId, key) => {
    const oldId = key.split('_')[0];
    oldToNewIdMap.set(oldId, newId);
  });

  fixedDiagram.edges = fixedDiagram.edges.map((edge: any) => {
    let updated = { ...edge };
    if (oldToNewIdMap.has(edge.source)) {
      updated.source = oldToNewIdMap.get(edge.source);
    }
    if (oldToNewIdMap.has(edge.target)) {
      updated.target = oldToNewIdMap.get(edge.target);
    }
    return updated;
  });

  // Second pass: Handle edge issues
  issues.forEach(issue => {
    if (issue.autoFix === 'remove' && issue.edgeId) {
      edgesToRemove.add(issue.edgeId);
    } else if (issue.autoFix === 'reverse' && issue.edgeId) {
      edgesToReverse.push(issue.edgeId);
    }
  });

  // Remove invalid edges
  fixedDiagram.edges = fixedDiagram.edges.filter((edge: any) => 
    !edgesToRemove.has(edge.id)
  );

  // Reverse connections
  fixedDiagram.edges = fixedDiagram.edges.map((edge: any) => {
    if (edgesToReverse.includes(edge.id)) {
      return {
        ...edge,
        source: edge.target,
        target: edge.source,
        sourceHandle: edge.targetHandle,
        targetHandle: edge.sourceHandle,
        id: edge.id.replace(
          `${edge.source}${edge.sourceHandle || ''}-${edge.target}${edge.targetHandle || ''}`,
          `${edge.target}${edge.targetHandle || ''}-${edge.source}${edge.sourceHandle || ''}`
        )
      };
    }
    return edge;
  });

  return fixedDiagram;
}
