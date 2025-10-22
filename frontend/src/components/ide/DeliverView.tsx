"use client";

import * as React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import {
  Rocket,
  Download,
  FileText,
  Package,
  FolderArchive,
  CheckCircle2,
  Loader2,
  FileJson,
  FileSpreadsheet,
  AlertTriangle,
  FileCode2,
  BarChart3
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { workspaceFileAPI } from '@/lib/workspace-file-api';
import { bomAPI, BOMComponent } from '@/lib/bom-api';
import { drcAPI } from '@/lib/drc-api';
import { loadProjectAnalytics } from '@/lib/architecture-analytics-api';
import { downloadFile, downloadJSON, downloadCSV, getDateStamp, createAndDownloadZip, createAndDownloadTarGz } from '@/lib/export-utils';

interface DeliverViewProps {
  currentUser: string | null;
  currentProjectRoot: string | null;
  projectId?: string;
}

interface ExportProgress {
  current: number;
  total: number;
  status: string;
}

export function DeliverView({ currentUser, currentProjectRoot, projectId }: DeliverViewProps) {
  const { toast } = useToast();
  const [exporting, setExporting] = React.useState<string | null>(null);
  const [exportProgress, setExportProgress] = React.useState<ExportProgress | null>(null);

  // Export Architecture Diagram as JSON
  const handleExportArchitectureDiagram = async () => {
    if (!projectId) {
      toast({
        title: "Error",
        description: "No project ID available",
        variant: "destructive"
      });
      return;
    }

    try {
      setExporting('architecture');
      setExportProgress({ current: 1, total: 2, status: 'Reading architecture diagram...' });

      const diagramContent = await workspaceFileAPI.readFile(projectId, 'arch_diagram.json');

      if (!diagramContent) {
        throw new Error('Architecture diagram not found. Please create a design first.');
      }

      setExportProgress({ current: 2, total: 2, status: 'Downloading...' });

      const diagram = typeof diagramContent === 'string'
        ? JSON.parse(diagramContent)
        : diagramContent;

      const filename = `${currentProjectRoot || 'project'}_architecture_${getDateStamp()}.json`;
      downloadJSON(diagram, filename);

      toast({
        title: "Export Successful",
        description: `Architecture diagram exported as ${filename}`
      });
    } catch (error) {
      console.error('Failed to export architecture:', error);
      toast({
        title: "Export Failed",
        description: error instanceof Error ? error.message : "Failed to export architecture diagram",
        variant: "destructive"
      });
    } finally {
      setExporting(null);
      setExportProgress(null);
    }
  };

  // Export BOM as CSV
  const handleExportBOM = async () => {
    if (!projectId) {
      toast({
        title: "Error",
        description: "No project ID available",
        variant: "destructive"
      });
      return;
    }

    try {
      setExporting('bom');
      setExportProgress({ current: 1, total: 3, status: 'Loading BOM data...' });

      // Try to load from cache first
      let bomReport;
      try {
        const bomContent = await workspaceFileAPI.readFile(projectId, 'bom.json');
        if (bomContent) {
          bomReport = typeof bomContent === 'string'
            ? JSON.parse(bomContent)
            : bomContent;
        }
      } catch (err) {
        console.log('No cached BOM, generating...');
      }

      // Generate if not cached
      if (!bomReport) {
        setExportProgress({ current: 2, total: 3, status: 'Generating BOM...' });
        bomReport = await bomAPI.generateBOM(projectId);
      }

      setExportProgress({ current: 3, total: 3, status: 'Preparing CSV...' });

      // Flatten BOM data for CSV
      const csvData: any[] = [];
      bomReport.categories.forEach((category: any) => {
        category.components.forEach((component: BOMComponent) => {
          csvData.push({
            Category: category.categoryName,
            Name: component.name,
            Type: component.type,
            Quantity: component.quantity,
            Manufacturer: component.manufacturer || 'N/A',
            'Part Number': component.partNumber || 'N/A',
            Description: component.description || '',
            Specifications: component.specifications ? JSON.stringify(component.specifications) : ''
          });
        });
      });

      const filename = `${currentProjectRoot || 'project'}_BOM_${getDateStamp()}.csv`;
      downloadCSV(csvData, filename);

      toast({
        title: "Export Successful",
        description: `BOM exported as ${filename} (${csvData.length} components)`
      });
    } catch (error) {
      console.error('Failed to export BOM:', error);
      toast({
        title: "Export Failed",
        description: error instanceof Error ? error.message : "Failed to export BOM",
        variant: "destructive"
      });
    } finally {
      setExporting(null);
      setExportProgress(null);
    }
  };

  // Export Design Documentation as Markdown
  const handleExportDesignDoc = async () => {
    if (!projectId) {
      toast({
        title: "Error",
        description: "No project ID available",
        variant: "destructive"
      });
      return;
    }

    try {
      setExporting('documentation');
      setExportProgress({ current: 1, total: 5, status: 'Loading project files...' });

      // Load spec file
      let archSpec = '';
      try {
        const specContent = await workspaceFileAPI.readFile(projectId, 'arch_spec.md');
        archSpec = specContent || '';
        setExportProgress({ current: 2, total: 5, status: 'Loaded architecture specification...' });
      } catch (err) {
        console.log('No arch_spec.md found');
      }

      // Load diagram
      let diagramSummary = '';
      try {
        const diagramContent = await workspaceFileAPI.readFile(projectId, 'arch_diagram.json');
        if (diagramContent) {
          const diagram = typeof diagramContent === 'string'
            ? JSON.parse(diagramContent)
            : diagramContent;
          const componentCount = diagram.components?.length || 0;
          const connectionCount = diagram.connections?.length || 0;
          diagramSummary = `- **Components**: ${componentCount}\n- **Connections**: ${connectionCount}`;
        }
        setExportProgress({ current: 3, total: 5, status: 'Loaded diagram data...' });
      } catch (err) {
        console.log('No diagram found');
      }

      // Load BOM summary
      let bomSummary = '';
      try {
        const bomContent = await workspaceFileAPI.readFile(projectId, 'bom.json');
        if (bomContent) {
          const bom = typeof bomContent === 'string' ? JSON.parse(bomContent) : bomContent;
          const totalComponents = bom.categories?.reduce((sum: number, cat: any) => sum + cat.components.length, 0) || 0;
          bomSummary = `- **Total Components**: ${totalComponents}\n- **Categories**: ${bom.categories?.length || 0}`;
        }
        setExportProgress({ current: 4, total: 5, status: 'Loaded BOM data...' });
      } catch (err) {
        console.log('No BOM found');
      }

      setExportProgress({ current: 5, total: 5, status: 'Generating document...' });

      // Generate complete documentation
      const doc = `# ${currentProjectRoot || 'Project'} - Design Documentation

**Generated**: ${new Date().toLocaleString()}
**Project**: ${currentProjectRoot || 'Unknown'}

---

## Architecture Specification

${archSpec || '*No architecture specification available. Please generate architecture first.*'}

---

## System Overview

${diagramSummary ? `### Architecture Diagram\n\n${diagramSummary}` : '*No architecture diagram available.*'}

---

## Bill of Materials

${bomSummary ? `### Component Summary\n\n${bomSummary}` : '*No BOM data available.*'}

---

## Additional Information

This documentation was automatically generated by SOC Pilot.

For detailed component specifications and validation results, please refer to the individual export files.

---

*End of Documentation*
`;

      const filename = `${currentProjectRoot || 'project'}_documentation_${getDateStamp()}.md`;
      downloadFile(doc, filename, 'text/markdown');

      toast({
        title: "Export Successful",
        description: `Design documentation exported as ${filename}`
      });
    } catch (error) {
      console.error('Failed to export documentation:', error);
      toast({
        title: "Export Failed",
        description: error instanceof Error ? error.message : "Failed to export documentation",
        variant: "destructive"
      });
    } finally {
      setExporting(null);
      setExportProgress(null);
    }
  };

  // Export Validation Report as JSON
  const handleExportValidationReport = async () => {
    if (!projectId) {
      toast({
        title: "Error",
        description: "No project ID available",
        variant: "destructive"
      });
      return;
    }

    try {
      setExporting('validation');
      setExportProgress({ current: 1, total: 2, status: 'Loading validation results...' });

      const drcResults = await drcAPI.getDRCResults(projectId);

      if (!drcResults || drcResults.length === 0) {
        throw new Error('No validation results found. Please run validation first.');
      }

      setExportProgress({ current: 2, total: 2, status: 'Downloading...' });

      const filename = `${currentProjectRoot || 'project'}_validation_report_${getDateStamp()}.json`;
      downloadJSON(drcResults, filename);

      toast({
        title: "Export Successful",
        description: `Validation report exported as ${filename}`
      });
    } catch (error) {
      console.error('Failed to export validation report:', error);
      toast({
        title: "Export Failed",
        description: error instanceof Error ? error.message : "Failed to export validation report",
        variant: "destructive"
      });
    } finally {
      setExporting(null);
      setExportProgress(null);
    }
  };

  // Export Architecture Specification as Markdown
  const handleExportArchSpec = async () => {
    if (!projectId) {
      toast({
        title: "Error",
        description: "No project ID available",
        variant: "destructive"
      });
      return;
    }

    try {
      setExporting('archspec');
      setExportProgress({ current: 1, total: 2, status: 'Reading architecture specification...' });

      const archSpec = await workspaceFileAPI.readFile(projectId, 'arch_spec.md');

      if (!archSpec) {
        throw new Error('Architecture specification not found. Please generate architecture first.');
      }

      setExportProgress({ current: 2, total: 2, status: 'Downloading...' });

      const filename = `${currentProjectRoot || 'project'}_arch_spec_${getDateStamp()}.md`;
      downloadFile(archSpec, filename, 'text/markdown');

      toast({
        title: "Export Successful",
        description: `Architecture specification exported as ${filename}`
      });
    } catch (error) {
      console.error('Failed to export architecture spec:', error);
      toast({
        title: "Export Failed",
        description: error instanceof Error ? error.message : "Failed to export architecture specification",
        variant: "destructive"
      });
    } finally {
      setExporting(null);
      setExportProgress(null);
    }
  };

  // Export Performance Analytics Report as JSON
  const handleExportAnalytics = async () => {
    if (!projectId) {
      toast({
        title: "Error",
        description: "No project ID available",
        variant: "destructive"
      });
      return;
    }

    try {
      setExporting('analytics');
      setExportProgress({ current: 1, total: 2, status: 'Loading analytics report...' });

      const analyticsReport = await loadProjectAnalytics(projectId);

      if (!analyticsReport) {
        throw new Error('No analytics report found. Please run analytics in the Analytics view first.');
      }

      setExportProgress({ current: 2, total: 2, status: 'Downloading...' });

      const filename = `${currentProjectRoot || 'project'}_analytics_report_${getDateStamp()}.json`;
      downloadJSON(analyticsReport, filename);

      toast({
        title: "Export Successful",
        description: `Performance analytics report exported as ${filename}`
      });
    } catch (error) {
      console.error('Failed to export analytics report:', error);
      toast({
        title: "Export Failed",
        description: error instanceof Error ? error.message : "Failed to export analytics report",
        variant: "destructive"
      });
    } finally {
      setExporting(null);
      setExportProgress(null);
    }
  };

  // Export Complete Package as ZIP
  const handleExportCompletePackage = async () => {
    if (!projectId) {
      toast({
        title: "Error",
        description: "No project ID available",
        variant: "destructive"
      });
      return;
    }

    try {
      setExporting('package');
      const files: Array<{ filename: string; content: string | Blob }> = [];
      const totalSteps = 6;
      let currentStep = 0;

      // 1. Collect Architecture Diagram
      currentStep++;
      setExportProgress({
        current: currentStep,
        total: totalSteps,
        status: 'Collecting architecture diagram...'
      });

      try {
        const diagramContent = await workspaceFileAPI.readFile(projectId, 'arch_diagram.json');
        if (diagramContent) {
          const diagram = typeof diagramContent === 'string'
            ? JSON.parse(diagramContent)
            : diagramContent;
          files.push({
            filename: 'arch_diagram.json',
            content: JSON.stringify(diagram, null, 2)
          });
        }
      } catch (err) {
        console.log('Architecture diagram not found, skipping...');
      }

      // 2. Collect BOM
      currentStep++;
      setExportProgress({
        current: currentStep,
        total: totalSteps,
        status: 'Collecting BOM...'
      });

      try {
        let bomReport;
        try {
          const bomContent = await workspaceFileAPI.readFile(projectId, 'bom.json');
          if (bomContent) {
            bomReport = typeof bomContent === 'string' ? JSON.parse(bomContent) : bomContent;
          }
        } catch (err) {
          bomReport = await bomAPI.generateBOM(projectId);
        }

        if (bomReport) {
          // Add JSON version
          files.push({
            filename: 'bom.json',
            content: JSON.stringify(bomReport, null, 2)
          });

          // Add CSV version
          const csvData: any[] = [];
          bomReport.categories.forEach((category: any) => {
            category.components.forEach((component: BOMComponent) => {
              csvData.push({
                Category: category.categoryName,
                Name: component.name,
                Type: component.type,
                Quantity: component.quantity,
                Manufacturer: component.manufacturer || 'N/A',
                'Part Number': component.partNumber || 'N/A',
                Description: component.description || '',
                Specifications: component.specifications ? JSON.stringify(component.specifications) : ''
              });
            });
          });

          const headers = Object.keys(csvData[0]);
          const csvRows = [
            headers.join(','),
            ...csvData.map(row =>
              headers.map(header => {
                const value = row[header];
                const stringValue = value === null || value === undefined ? '' : String(value);
                if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
                  return `"${stringValue.replace(/"/g, '""')}"`;
                }
                return stringValue;
              }).join(',')
            )
          ];
          const csvContent = csvRows.join('\n');

          files.push({
            filename: 'bom.csv',
            content: csvContent
          });
        }
      } catch (err) {
        console.log('BOM not found, skipping...');
      }

      // 3. Collect Documentation
      currentStep++;
      setExportProgress({
        current: currentStep,
        total: totalSteps,
        status: 'Collecting documentation...'
      });

      try {
        let archSpec = '';
        try {
          const specContent = await workspaceFileAPI.readFile(projectId, 'arch_spec.md');
          archSpec = specContent || '';
        } catch (err) {
          console.log('No arch_spec.md found');
        }

        let diagramSummary = '';
        try {
          const diagramContent = await workspaceFileAPI.readFile(projectId, 'arch_diagram.json');
          if (diagramContent) {
            const diagram = typeof diagramContent === 'string' ? JSON.parse(diagramContent) : diagramContent;
            const componentCount = diagram.components?.length || 0;
            const connectionCount = diagram.connections?.length || 0;
            diagramSummary = `- **Components**: ${componentCount}\n- **Connections**: ${connectionCount}`;
          }
        } catch (err) {
          console.log('No diagram found');
        }

        let bomSummary = '';
        try {
          const bomContent = await workspaceFileAPI.readFile(projectId, 'bom.json');
          if (bomContent) {
            const bom = typeof bomContent === 'string' ? JSON.parse(bomContent) : bomContent;
            const totalComponents = bom.categories?.reduce((sum: number, cat: any) => sum + cat.components.length, 0) || 0;
            bomSummary = `- **Total Components**: ${totalComponents}\n- **Categories**: ${bom.categories?.length || 0}`;
          }
        } catch (err) {
          console.log('No BOM found');
        }

        const doc = `# ${currentProjectRoot || 'Project'} - Design Documentation

**Generated**: ${new Date().toLocaleString()}
**Project**: ${currentProjectRoot || 'Unknown'}

---

## Architecture Specification

${archSpec || '*No architecture specification available. Please generate architecture first.*'}

---

## System Overview

${diagramSummary ? `### Architecture Diagram\n\n${diagramSummary}` : '*No architecture diagram available.*'}

---

## Bill of Materials

${bomSummary ? `### Component Summary\n\n${bomSummary}` : '*No BOM data available.*'}

---

## Additional Information

This documentation was automatically generated by SOC Pilot.

For detailed component specifications and validation results, please refer to the individual export files.

---

*End of Documentation*
`;

        files.push({
          filename: 'documentation.md',
          content: doc
        });

        // Also add arch_spec.md if available
        if (archSpec) {
          files.push({
            filename: 'arch_spec.md',
            content: archSpec
          });
        }
      } catch (err) {
        console.log('Documentation generation failed, skipping...');
      }

      // 4. Collect Validation Report
      currentStep++;
      setExportProgress({
        current: currentStep,
        total: totalSteps,
        status: 'Collecting validation report...'
      });

      try {
        const drcResults = await drcAPI.getDRCResults(projectId);
        if (drcResults && drcResults.length > 0) {
          files.push({
            filename: 'validation_report.json',
            content: JSON.stringify(drcResults, null, 2)
          });
        }
      } catch (err) {
        console.log('Validation report not found, skipping...');
      }

      // 5. Collect Analytics Report
      currentStep++;
      setExportProgress({
        current: currentStep,
        total: totalSteps,
        status: 'Collecting analytics report...'
      });

      try {
        const analyticsReport = await loadProjectAnalytics(projectId);
        if (analyticsReport) {
          files.push({
            filename: 'analytics_report.json',
            content: JSON.stringify(analyticsReport, null, 2)
          });
        }
      } catch (err) {
        console.log('Analytics report not found, skipping...');
      }

      // 6. Create ZIP file
      currentStep++;
      setExportProgress({
        current: currentStep,
        total: totalSteps,
        status: 'Creating ZIP archive...'
      });

      if (files.length === 0) {
        throw new Error('No files available to export. Please generate architecture and other deliverables first.');
      }

      const zipFilename = `${currentProjectRoot || 'project'}_complete_${getDateStamp()}.zip`;
      await createAndDownloadZip(files, zipFilename);

      toast({
        title: "Package Export Complete",
        description: `Exported ${files.length} files as ${zipFilename}`,
        duration: 5000
      });
    } catch (error) {
      console.error('Failed to export package:', error);
      toast({
        title: "Export Failed",
        description: error instanceof Error ? error.message : "Failed to export complete package",
        variant: "destructive"
      });
    } finally {
      setExporting(null);
      setExportProgress(null);
    }
  };

  // Export Complete Package as TAR.GZ
  const handleExportCompletePackageTarGz = async () => {
    if (!projectId) {
      toast({
        title: "Error",
        description: "No project ID available",
        variant: "destructive"
      });
      return;
    }

    try {
      setExporting('package-targz');
      const files: Array<{ filename: string; content: string | Blob }> = [];
      const totalSteps = 6;
      let currentStep = 0;

      // 1. Collect Architecture Diagram
      currentStep++;
      setExportProgress({
        current: currentStep,
        total: totalSteps,
        status: 'Collecting architecture diagram...'
      });

      try {
        const diagramContent = await workspaceFileAPI.readFile(projectId, 'arch_diagram.json');
        if (diagramContent) {
          const diagram = typeof diagramContent === 'string'
            ? JSON.parse(diagramContent)
            : diagramContent;
          files.push({
            filename: 'arch_diagram.json',
            content: JSON.stringify(diagram, null, 2)
          });
        }
      } catch (err) {
        console.log('Architecture diagram not found, skipping...');
      }

      // 2. Collect BOM
      currentStep++;
      setExportProgress({
        current: currentStep,
        total: totalSteps,
        status: 'Collecting BOM...'
      });

      try {
        let bomReport;
        try {
          const bomContent = await workspaceFileAPI.readFile(projectId, 'bom.json');
          if (bomContent) {
            bomReport = typeof bomContent === 'string' ? JSON.parse(bomContent) : bomContent;
          }
        } catch (err) {
          bomReport = await bomAPI.generateBOM(projectId);
        }

        if (bomReport) {
          files.push({
            filename: 'bom.json',
            content: JSON.stringify(bomReport, null, 2)
          });

          const csvData: any[] = [];
          bomReport.categories.forEach((category: any) => {
            category.components.forEach((component: BOMComponent) => {
              csvData.push({
                Category: category.categoryName,
                Name: component.name,
                Type: component.type,
                Quantity: component.quantity,
                Manufacturer: component.manufacturer || 'N/A',
                'Part Number': component.partNumber || 'N/A',
                Description: component.description || '',
                Specifications: component.specifications ? JSON.stringify(component.specifications) : ''
              });
            });
          });

          const headers = Object.keys(csvData[0]);
          const csvRows = [
            headers.join(','),
            ...csvData.map(row =>
              headers.map(header => {
                const value = row[header];
                const stringValue = value === null || value === undefined ? '' : String(value);
                if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
                  return `"${stringValue.replace(/"/g, '""')}"`;
                }
                return stringValue;
              }).join(',')
            )
          ];
          const csvContent = csvRows.join('\n');

          files.push({
            filename: 'bom.csv',
            content: csvContent
          });
        }
      } catch (err) {
        console.log('BOM not found, skipping...');
      }

      // 3. Collect Documentation
      currentStep++;
      setExportProgress({
        current: currentStep,
        total: totalSteps,
        status: 'Collecting documentation...'
      });

      try {
        let archSpec = '';
        try {
          const specContent = await workspaceFileAPI.readFile(projectId, 'arch_spec.md');
          archSpec = specContent || '';
        } catch (err) {
          console.log('No arch_spec.md found');
        }

        let diagramSummary = '';
        try {
          const diagramContent = await workspaceFileAPI.readFile(projectId, 'arch_diagram.json');
          if (diagramContent) {
            const diagram = typeof diagramContent === 'string' ? JSON.parse(diagramContent) : diagramContent;
            const componentCount = diagram.components?.length || 0;
            const connectionCount = diagram.connections?.length || 0;
            diagramSummary = `- **Components**: ${componentCount}\n- **Connections**: ${connectionCount}`;
          }
        } catch (err) {
          console.log('No diagram found');
        }

        let bomSummary = '';
        try {
          const bomContent = await workspaceFileAPI.readFile(projectId, 'bom.json');
          if (bomContent) {
            const bom = typeof bomContent === 'string' ? JSON.parse(bomContent) : bomContent;
            const totalComponents = bom.categories?.reduce((sum: number, cat: any) => sum + cat.components.length, 0) || 0;
            bomSummary = `- **Total Components**: ${totalComponents}\n- **Categories**: ${bom.categories?.length || 0}`;
          }
        } catch (err) {
          console.log('No BOM found');
        }

        const doc = `# ${currentProjectRoot || 'Project'} - Design Documentation

**Generated**: ${new Date().toLocaleString()}
**Project**: ${currentProjectRoot || 'Unknown'}

---

## Architecture Specification

${archSpec || '*No architecture specification available. Please generate architecture first.*'}

---

## System Overview

${diagramSummary ? `### Architecture Diagram\n\n${diagramSummary}` : '*No architecture diagram available.*'}

---

## Bill of Materials

${bomSummary ? `### Component Summary\n\n${bomSummary}` : '*No BOM data available.*'}

---

## Additional Information

This documentation was automatically generated by SOC Pilot.

For detailed component specifications and validation results, please refer to the individual export files.

---

*End of Documentation*
`;

        files.push({
          filename: 'documentation.md',
          content: doc
        });

        if (archSpec) {
          files.push({
            filename: 'arch_spec.md',
            content: archSpec
          });
        }
      } catch (err) {
        console.log('Documentation generation failed, skipping...');
      }

      // 4. Collect Validation Report
      currentStep++;
      setExportProgress({
        current: currentStep,
        total: totalSteps,
        status: 'Collecting validation report...'
      });

      try {
        const drcResults = await drcAPI.getDRCResults(projectId);
        if (drcResults && drcResults.length > 0) {
          files.push({
            filename: 'validation_report.json',
            content: JSON.stringify(drcResults, null, 2)
          });
        }
      } catch (err) {
        console.log('Validation report not found, skipping...');
      }

      // 5. Collect Analytics Report
      currentStep++;
      setExportProgress({
        current: currentStep,
        total: totalSteps,
        status: 'Collecting analytics report...'
      });

      try {
        const analyticsReport = await loadProjectAnalytics(projectId);
        if (analyticsReport) {
          files.push({
            filename: 'analytics_report.json',
            content: JSON.stringify(analyticsReport, null, 2)
          });
        }
      } catch (err) {
        console.log('Analytics report not found, skipping...');
      }

      // 6. Create TAR.GZ file
      currentStep++;
      setExportProgress({
        current: currentStep,
        total: totalSteps,
        status: 'Creating TAR.GZ archive...'
      });

      if (files.length === 0) {
        throw new Error('No files available to export. Please generate architecture and other deliverables first.');
      }

      const tarGzFilename = `${currentProjectRoot || 'project'}_complete_${getDateStamp()}.tar.gz`;
      await createAndDownloadTarGz(files, tarGzFilename);

      toast({
        title: "Package Export Complete",
        description: `Exported ${files.length} files as ${tarGzFilename}`,
        duration: 5000
      });
    } catch (error) {
      console.error('Failed to export package:', error);
      toast({
        title: "Export Failed",
        description: error instanceof Error ? error.message : "Failed to export complete package",
        variant: "destructive"
      });
    } finally {
      setExporting(null);
      setExportProgress(null);
    }
  };

  // Complete Packages - ZIP and TAR.GZ
  const completePackages = [
    {
      id: 'package',
      title: 'Complete Package (ZIP)',
      description: 'All deliverables packaged as ZIP archive',
      icon: FolderArchive,
      action: 'Download ZIP',
      handler: handleExportCompletePackage,
      color: 'text-indigo-500',
      bgColor: 'bg-indigo-500/10'
    },
    {
      id: 'package-targz',
      title: 'Complete Package (TAR.GZ)',
      description: 'All deliverables packaged as compressed TAR archive',
      icon: FolderArchive,
      action: 'Download TAR.GZ',
      handler: handleExportCompletePackageTarGz,
      color: 'text-violet-500',
      bgColor: 'bg-violet-500/10'
    }
  ];

  // Individual Export Options
  const individualDeliverables = [
    {
      id: 'architecture',
      title: 'Architecture Diagram',
      description: 'Export system architecture design as JSON',
      icon: FileJson,
      action: 'Export JSON',
      handler: handleExportArchitectureDiagram,
      color: 'text-blue-500',
      bgColor: 'bg-blue-500/10'
    },
    {
      id: 'archspec',
      title: 'Architecture Specification',
      description: 'Detailed architecture specification document as Markdown',
      icon: FileText,
      action: 'Export Markdown',
      handler: handleExportArchSpec,
      color: 'text-cyan-500',
      bgColor: 'bg-cyan-500/10'
    },
    {
      id: 'validation',
      title: 'Validation Report',
      description: 'DRC check results and analysis as JSON',
      icon: CheckCircle2,
      action: 'Export Report',
      handler: handleExportValidationReport,
      color: 'text-amber-500',
      bgColor: 'bg-amber-500/10'
    },
    {
      id: 'analytics',
      title: 'Performance Analytics Report',
      description: 'Data flow and performance analysis as JSON',
      icon: BarChart3,
      action: 'Export Report',
      handler: handleExportAnalytics,
      color: 'text-purple-500',
      bgColor: 'bg-purple-500/10'
    },
    {
      id: 'bom',
      title: 'Bill of Materials',
      description: 'Component list with specifications as CSV',
      icon: FileSpreadsheet,
      action: 'Export CSV',
      handler: handleExportBOM,
      color: 'text-green-500',
      bgColor: 'bg-green-500/10'
    }
  ];

  if (!currentProjectRoot || !projectId) {
    return (
      <div className="flex flex-col h-full bg-background">
        <ScrollArea className="flex-1">
          <div className="container mx-auto py-6 px-4 md:px-6 max-w-7xl">
            <header className="mb-6">
              <h1 className="text-3xl font-bold tracking-tight flex items-center">
                <Rocket className="mr-3 h-7 w-7 text-primary" />
                Deliver
              </h1>
              <p className="text-muted-foreground mt-1">
                Export and package your project deliverables
              </p>
            </header>

            <Card className="border-dashed">
              <CardContent className="flex flex-col items-center justify-center py-12">
                <AlertTriangle className="h-16 w-16 text-muted-foreground/50 mb-4" />
                <h3 className="text-lg font-semibold mb-2">No Project Open</h3>
                <p className="text-sm text-muted-foreground text-center max-w-md">
                  Open a project to access delivery and export options
                </p>
              </CardContent>
            </Card>
          </div>
        </ScrollArea>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-background">
      <ScrollArea className="flex-1">
        <div className="container mx-auto py-6 px-4 md:px-6 max-w-7xl">
          {/* Header */}
          <header className="mb-6">
            <h1 className="text-3xl font-bold tracking-tight flex items-center select-text">
              <Rocket className="mr-3 h-7 w-7 text-primary select-none" />
              Deliver
            </h1>
            <p className="text-muted-foreground mt-1 select-text">
              Export and package your project deliverables
            </p>
          </header>

          {/* Congratulations Card */}
          <Card className="mb-6 border-green-500/50 bg-gradient-to-r from-green-500/5 to-emerald-500/5">
            <CardHeader className="pb-3">
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-full bg-green-500/10 select-none">
                  <CheckCircle2 className="h-5 w-5 text-green-500" />
                </div>
                <div className="flex-1">
                  <CardTitle className="text-base text-green-700 dark:text-green-400 select-text">
                    Project Ready for Delivery
                  </CardTitle>
                  <CardDescription className="mt-1 select-text">
                    Your project files are ready to export. Choose individual files or download the complete package as a ZIP archive.
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
          </Card>

          {/* Export Progress */}
          {exportProgress && (
            <Card className="mb-6 border-primary/50">
              <CardContent className="pt-6">
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-sm select-text">
                    <span className="font-medium">{exportProgress.status}</span>
                    <span className="text-muted-foreground">
                      {exportProgress.current} / {exportProgress.total}
                    </span>
                  </div>
                  <Progress
                    value={(exportProgress.current / exportProgress.total) * 100}
                    className="h-2 select-none"
                  />
                </div>
              </CardContent>
            </Card>
          )}

          {/* Complete Packages Section */}
          <div className="mb-8">
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2 select-text">
              <FolderArchive className="h-5 w-5 text-primary select-none" />
              Complete Packages
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {completePackages.map((item) => {
                const Icon = item.icon;
                const isExporting = exporting === item.id;

                return (
                  <Card
                    key={item.id}
                    className={`transition-all flex flex-col h-full ${isExporting ? 'ring-2 ring-primary' : 'hover:shadow-md'}`}
                  >
                    <CardHeader className="flex-grow">
                      <div className="flex items-start gap-3">
                        <div className={`p-2.5 rounded-lg ${item.bgColor} select-none`}>
                          <Icon className={`h-5 w-5 ${item.color}`} />
                        </div>
                        <div className="flex-1">
                          <CardTitle className="text-base flex items-center gap-2 select-text">
                            {item.title}
                            <Badge variant="secondary" className="text-xs select-none">
                              All Files
                            </Badge>
                          </CardTitle>
                          <CardDescription className="text-sm mt-1.5 select-text">
                            {item.description}
                          </CardDescription>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="mt-auto">
                      <Button
                        variant="default"
                        size="sm"
                        className="w-full select-none"
                        disabled={!!exporting}
                        onClick={item.handler}
                      >
                        {isExporting ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            Exporting...
                          </>
                        ) : (
                          <>
                            <Download className="h-4 w-4 mr-2" />
                            {item.action}
                          </>
                        )}
                      </Button>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>

          {/* Individual Exports Section */}
          <div>
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2 select-text">
              <Package className="h-5 w-5 text-primary select-none" />
              Individual Exports
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {individualDeliverables.map((item) => {
                const Icon = item.icon;
                const isExporting = exporting === item.id;

                return (
                  <Card
                    key={item.id}
                    className={`transition-all flex flex-col h-full ${isExporting ? 'ring-2 ring-primary' : 'hover:shadow-md'}`}
                  >
                    <CardHeader className="flex-grow">
                      <div className="flex items-start gap-3">
                        <div className={`p-2.5 rounded-lg ${item.bgColor} select-none`}>
                          <Icon className={`h-5 w-5 ${item.color}`} />
                        </div>
                        <div className="flex-1">
                          <CardTitle className="text-base select-text">
                            {item.title}
                          </CardTitle>
                          <CardDescription className="text-sm mt-1.5 select-text">
                            {item.description}
                          </CardDescription>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="mt-auto">
                      <Button
                        variant="default"
                        size="sm"
                        className="w-full select-none"
                        disabled={!!exporting}
                        onClick={item.handler}
                      >
                        {isExporting ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            Exporting...
                          </>
                        ) : (
                          <>
                            <Download className="h-4 w-4 mr-2" />
                            {item.action}
                          </>
                        )}
                      </Button>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}

export default DeliverView;
