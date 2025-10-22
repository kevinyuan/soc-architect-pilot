"use client";

import * as React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Shield, Database, ChevronLeft, ChevronRight, Search, RefreshCw, ChevronDown, ChevronUp, FileText, MessageSquare, Trash2, Users, Mail, Clock, FolderOpen, Share2, Package, FolderTree, Edit } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import { ProjectFileExplorer } from './ProjectFileExplorer';
import { JsonEditorDialog } from './JsonEditorDialog';
// Removed apiClient import - using fetch directly for admin routes

interface TableInfo {
  name: string;
  displayName: string;
  primaryKey: string;
  icon?: string;
  sortKey: string | null;
  description: string;
  recordCount?: number;
}

interface AdminViewProps {
  userRole?: string;
}

// Helper function to get icon component based on icon name
const getTableIcon = (iconName?: string) => {
  const iconMap: Record<string, any> = {
    'Users': Users,
    'Mail': Mail,
    'Clock': Clock,
    'FolderOpen': FolderOpen,
    'Share2': Share2,
    'MessageSquare': MessageSquare,
    'Package': Package,
  };
  return iconMap[iconName || 'Database'] || Database;
};

export function AdminView({ userRole }: AdminViewProps) {
  const [tables, setTables] = React.useState<TableInfo[]>([]);
  const [selectedTable, setSelectedTable] = React.useState<string | null>(null);
  const [records, setRecords] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [lastKey, setLastKey] = React.useState<any>(null);
  const [hasMore, setHasMore] = React.useState(false);
  const [queryColumn, setQueryColumn] = React.useState('');
  const [queryValue, setQueryValue] = React.useState('');
  const [expandedRows, setExpandedRows] = React.useState<Set<number>>(new Set());
  const [selectedRows, setSelectedRows] = React.useState<Set<number>>(new Set());
  const [selectAll, setSelectAll] = React.useState(false);
  const [fileExplorerOpen, setFileExplorerOpen] = React.useState(false);
  const [selectedProject, setSelectedProject] = React.useState<{ id: string; name: string } | null>(null);
  const [currentPageStart, setCurrentPageStart] = React.useState(1);
  const [totalRecordsCount, setTotalRecordsCount] = React.useState(0);
  const [editorOpen, setEditorOpen] = React.useState(false);
  const [editorFile, setEditorFile] = React.useState<{ id: string; type: string; content: string } | null>(null);
  const [loadTablesRetryCount, setLoadTablesRetryCount] = React.useState(0);
  const { toast } = useToast();

  // Check if user is admin
  if (userRole !== 'admin') {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 text-center">
        <Shield className="h-16 w-16 text-muted-foreground mb-4" />
        <h2 className="text-2xl font-bold mb-2">Access Denied</h2>
        <p className="text-muted-foreground">
          You need admin privileges to access this page.
        </p>
      </div>
    );
  }

  // Load tables on mount
  React.useEffect(() => {
    loadTables();
  }, []);

  const loadTables = async () => {
    try {
      const token = localStorage.getItem('auth_token');
      
      if (!token) {
        console.error('No auth token found');
        toast({
          title: 'Authentication Error',
          description: 'Please log in again',
          variant: 'destructive'
        });
        return;
      }
      
      const response = await fetch('http://localhost:3000/api/admin/tables', {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      
      console.log('Response status:', response.status);
      console.log('Response headers:', response.headers);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Error response:', errorText);
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      // Read response as text first to debug
      const responseText = await response.text();
      console.log('Response text:', responseText);
      console.log('Response text length:', responseText.length);

      // Check if response is empty
      if (!responseText || responseText.length === 0) {
        if (loadTablesRetryCount < 3) {
          console.warn(`Empty response from server, retrying (${loadTablesRetryCount + 1}/3)...`);
          setLoadTablesRetryCount(prev => prev + 1);
          // Retry after a short delay
          setTimeout(() => loadTables(), 1000);
          return;
        } else {
          throw new Error('Server returned empty response after 3 retries');
        }
      }

      // Reset retry count on success
      setLoadTablesRetryCount(0);

      // Parse JSON
      const data = JSON.parse(responseText);
      console.log('Received data:', data);

      if (data.success && data.tables) {
        setTables(data.tables);
      } else {
        console.error('Invalid response format:', data);
      }
    } catch (error) {
      console.error('Error loading tables:', error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to load admin tables',
        variant: 'destructive'
      });
    }
  };

  // Helper to get the complete key for a record
  const getRecordKey = (record: any, tableInfo: TableInfo) => {
    const key: any = {};
    
    // Always include primary key (partition key)
    if (record[tableInfo.primaryKey] !== undefined) {
      key[tableInfo.primaryKey] = record[tableInfo.primaryKey];
    }
    
    // Include sort key if table has one
    if (tableInfo.sortKey && record[tableInfo.sortKey] !== undefined) {
      key[tableInfo.sortKey] = record[tableInfo.sortKey];
    }
    
    return key;
  };

  const loadRecords = async (tableName: string, direction: 'forward' | 'backward' = 'forward') => {
    setLoading(true);
    try {
      const token = localStorage.getItem('auth_token');
      const params = new URLSearchParams({ 
        limit: '10', 
        direction 
      });
      if (direction === 'forward' && lastKey) {
        params.append('lastKey', JSON.stringify(lastKey));
      }

      const response = await fetch(`http://localhost:3000/api/admin/tables/${tableName}/records?${params}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      const data = await response.json();

      if (data.success) {
        setRecords(data.items);
        setLastKey(data.lastEvaluatedKey);
        setHasMore(data.hasMore);
        setTotalRecordsCount(data.totalCount || 0);
        
        // Update page start based on direction
        if (direction === 'forward' && lastKey) {
          setCurrentPageStart(prev => prev + 10);
        } else if (direction === 'backward') {
          setCurrentPageStart(prev => Math.max(1, prev - 10));
        } else {
          // Initial load or reset
          setCurrentPageStart(1);
        }
      } else {
        console.error('Failed to load records:', data.error);
        toast({
          title: 'Error Loading Records',
          description: data.error?.message || 'Failed to load records',
          variant: 'destructive'
        });
        // Reset pagination on error
        setLastKey(null);
        setHasMore(false);
      }
    } catch (error) {
      console.error('Error loading records:', error);
      toast({
        title: 'Error',
        description: 'Failed to load records',
        variant: 'destructive'
      });
      // Reset pagination on error
      setLastKey(null);
      setHasMore(false);
    } finally {
      setLoading(false);
    }
  };

  const handleTableSelect = (tableName: string) => {
    setSelectedTable(tableName);
    setLastKey(null);
    setHasMore(false);
    setQueryColumn('');
    setQueryValue('');
    setRecords([]);
    setExpandedRows(new Set());
    setSelectedRows(new Set());
    setSelectAll(false);
    setCurrentPageStart(1);
    setTotalRecordsCount(0);
    loadRecords(tableName);
  };

  const handleQuery = async () => {
    if (!selectedTable || !queryColumn || !queryValue) return;

    setLoading(true);
    try {
      const token = localStorage.getItem('auth_token');
      const response = await fetch(`http://localhost:3000/api/admin/tables/${selectedTable}/query`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          column: queryColumn,
          value: queryValue,
          limit: 10
        })
      });
      const data = await response.json();

      if (data.success) {
        setRecords(data.items);
        setLastKey(null);
        setHasMore(false);
      }
    } catch (error) {
      console.error('Error querying records:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    if (selectedTable) {
      // Invalidate component library cache if viewing component library table
      if (selectedTable.name === 'soc-pilot-component-library') {
        try {
          console.log('[AdminView] Invalidating component library cache...');
          const response = await fetch('/api/admin/cache/invalidate', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
          });

          if (response.ok) {
            console.log('[AdminView] Cache invalidated successfully');
            toast({
              title: "Cache Invalidated",
              description: "Component library cache cleared. Fresh data will be loaded from S3.",
            });
          }
        } catch (error) {
          console.error('[AdminView] Failed to invalidate cache:', error);
        }
      }

      setLastKey(null);
      setSelectedRows(new Set());
      setSelectAll(false);
      loadRecords(selectedTable);
    }
  };

  const handleOpenEditor = async (record: any) => {
    try {
      const token = localStorage.getItem('auth_token');
      if (!token) {
        toast({
          title: 'Authentication Error',
          description: 'Please log in again',
          variant: 'destructive'
        });
        return;
      }

      // Determine file type and ID based on selected table
      let fileType: string;
      let fileId: string;

      if (selectedTable === 'file-system:components') {
        fileType = 'components';
        fileId = record.id;
      } else if (selectedTable === 'file-system:templates') {
        fileType = 'design_examples';
        fileId = record.id;
      } else {
        toast({
          title: 'Error',
          description: 'Editor is only available for components and design examples',
          variant: 'destructive'
        });
        return;
      }

      // Fetch file content
      const response = await fetch(`http://localhost:3000/api/admin/files/${fileType}/${fileId}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      const data = await response.json();

      if (data.success) {
        setEditorFile({
          id: fileId,
          type: fileType,
          content: data.data.content
        });
        setEditorOpen(true);
      } else {
        toast({
          title: 'Error',
          description: data.error?.message || 'Failed to load file',
          variant: 'destructive'
        });
      }
    } catch (error) {
      console.error('Error opening editor:', error);
      toast({
        title: 'Error',
        description: 'Failed to open editor',
        variant: 'destructive'
      });
    }
  };

  const handleSaveFile = async (newContent: string) => {
    if (!editorFile) return;

    try {
      const token = localStorage.getItem('auth_token');
      if (!token) {
        throw new Error('Authentication required');
      }

      const response = await fetch(`http://localhost:3000/api/admin/files/${editorFile.type}/${editorFile.id}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ content: newContent })
      });

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error?.message || 'Failed to save file');
      }

      // Update local state
      setEditorFile({
        ...editorFile,
        content: newContent
      });

      // Refresh the records to show updated data
      if (selectedTable) {
        loadRecords(selectedTable);
      }
    } catch (error) {
      throw error; // Re-throw to let the editor component handle it
    }
  };

  const handleSelectAll = (checked: boolean) => {
    setSelectAll(checked);
    if (checked) {
      const allIndices = new Set(records.map((_, index) => index));
      setSelectedRows(allIndices);
    } else {
      setSelectedRows(new Set());
    }
  };

  const handleRowSelect = (index: number, checked: boolean) => {
    const newSelected = new Set(selectedRows);
    if (checked) {
      newSelected.add(index);
    } else {
      newSelected.delete(index);
      setSelectAll(false);
    }
    setSelectedRows(newSelected);
  };

  const handleDeleteSelected = async () => {
    if (selectedRows.size === 0 || !selectedTable) return;

    const confirmed = window.confirm(
      `Are you sure you want to delete ${selectedRows.size} record(s)? This action cannot be undone.`
    );

    if (!confirmed) return;

    try {
      setLoading(true);
      const token = localStorage.getItem('auth_token');
      const selectedTableInfo = tables.find(t => t.name === selectedTable);
      
      if (!selectedTableInfo) {
        throw new Error('Table info not found');
      }

      // Get the complete keys of selected records (including sort key if present)
      const recordsToDelete = Array.from(selectedRows).map(index => {
        const record = records[index];
        return getRecordKey(record, selectedTableInfo);
      });

      // Delete each record
      let successCount = 0;
      let failCount = 0;

      for (const key of recordsToDelete) {
        try {
          const response = await fetch(
            `http://localhost:3000/api/admin/tables/${selectedTable}/records`,
            {
              method: 'DELETE',
              headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({ key })
            }
          );

          if (response.ok) {
            successCount++;
          } else {
            failCount++;
          }
        } catch (error) {
          console.error('Error deleting record:', error);
          failCount++;
        }
      }

      // Show result
      if (successCount > 0) {
        toast({
          title: 'Records Deleted',
          description: `Successfully deleted ${successCount} record(s)${failCount > 0 ? `, ${failCount} failed` : ''}`,
        });
      } else {
        toast({
          title: 'Delete Failed',
          description: 'Failed to delete records',
          variant: 'destructive'
        });
      }

      // Refresh the table
      setSelectedRows(new Set());
      setSelectAll(false);
      handleRefresh();
    } catch (error) {
      console.error('Error deleting records:', error);
      toast({
        title: 'Error',
        description: 'An error occurred while deleting records',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  const getColumns = () => {
    if (records.length === 0) return [];
    
    // For S3 tables, use specific column order
    if (selectedTable?.name?.startsWith('s3:')) {
      return ['name', 'size', 'lastModified'];
    }
    
    return Object.keys(records[0]);
  };

  const toggleRowExpansion = (index: number) => {
    const newExpanded = new Set(expandedRows);
    if (newExpanded.has(index)) {
      newExpanded.delete(index);
    } else {
      newExpanded.add(index);
    }
    setExpandedRows(newExpanded);
  };

  const formatCellValue = (value: any, columnName: string): React.ReactNode => {
    if (value === null || value === undefined) {
      return <span className="text-muted-foreground italic">null</span>;
    }

    // Handle arrays
    if (Array.isArray(value)) {
      return (
        <Badge variant="secondary" className="font-mono text-xs">
          Array[{value.length}]
        </Badge>
      );
    }

    // Handle objects
    if (typeof value === 'object') {
      const keys = Object.keys(value);
      return (
        <Badge variant="secondary" className="font-mono text-xs">
          Object{'{' + keys.length + '}'}
        </Badge>
      );
    }

    // Handle booleans
    if (typeof value === 'boolean') {
      return (
        <Badge variant={value ? 'default' : 'outline'} className="text-xs">
          {value.toString()}
        </Badge>
      );
    }

    // Handle dates
    if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(value)) {
      return (
        <span className="text-xs" title={value}>
          {new Date(value).toLocaleString()}
        </span>
      );
    }

    // Handle long strings
    const strValue = String(value);
    if (strValue.length > 50) {
      return (
        <span className="text-xs" title={strValue}>
          {strValue.substring(0, 50)}...
        </span>
      );
    }

    return <span className="text-xs">{strValue}</span>;
  };

  const renderExpandedContent = (record: any) => {
    return (
      <div className="p-4 bg-muted/50 space-y-3">
        {Object.entries(record).map(([key, value]) => {
          // Skip simple values, only show complex ones
          if (typeof value !== 'object' || value === null) {
            return null;
          }

          return (
            <div key={key} className="space-y-2">
              <div className="flex items-center gap-2">
                {Array.isArray(value) ? (
                  <FileText className="h-4 w-4 text-primary" />
                ) : (
                  <MessageSquare className="h-4 w-4 text-primary" />
                )}
                <span className="font-semibold text-sm">{key}</span>
                <Badge variant="outline" className="text-xs">
                  {Array.isArray(value) ? `${value.length} items` : 'Object'}
                </Badge>
              </div>
              <pre className="text-xs bg-background p-3 rounded border overflow-x-auto max-h-96">
                {JSON.stringify(value, null, 2)}
              </pre>
            </div>
          );
        })}
      </div>
    );
  };

  const selectedTableInfo = tables.find(t => t.name === selectedTable);

  return (
    <div className="flex h-full bg-background">
      {/* Left Sidebar - Database Tables */}
      <div className="w-64 border-r border-border flex-shrink-0 flex flex-col">
        <div className="p-4 border-b border-border">
          <h2 className="text-lg font-semibold flex items-center">
            <Database className="mr-2 h-5 w-5 text-primary" />
            Tables
          </h2>
          <p className="text-xs text-muted-foreground mt-1">
            {tables.length} tables
          </p>
        </div>
        <ScrollArea className="flex-1">
          <div className="p-2 space-y-1">
            {tables.map((table) => {
              const IconComponent = getTableIcon(table.icon);
              return (
                <button
                  key={table.name}
                  className={`w-full text-left p-3 rounded-md transition-colors hover:bg-accent ${
                    selectedTable === table.name ? 'bg-primary/10 border border-primary' : 'border border-transparent'
                  }`}
                  onClick={() => handleTableSelect(table.name)}
                >
                  <div className="flex items-center gap-2">
                    <IconComponent className="h-4 w-4 text-primary flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold leading-none truncate" title={table.displayName}>
                        {table.displayName}
                      </p>
                      <p className="text-xs font-mono text-muted-foreground leading-none truncate mt-1" title={table.name}>
                        {table.name}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {table.recordCount !== undefined ? `${table.recordCount} records` : 'Loading...'}
                      </p>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </ScrollArea>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="p-6 border-b border-border flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center">
              <Shield className="mr-3 h-6 w-6 text-primary" />
              Admin Panel
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Database management and system administration
            </p>
          </div>
          
          {/* Query Card */}
          {selectedTable && selectedTableInfo && (
            <Card className="flex-shrink-0">
              <CardContent className="p-3">
                <div className="flex items-end gap-2">
                  <div className="flex-1 min-w-[100px]">
                    <Label htmlFor="query-column" className="text-xs">Column</Label>
                    <Input
                      id="query-column"
                      className="h-8 text-sm mt-1"
                      placeholder="e.g., email"
                      value={queryColumn}
                      onChange={(e) => setQueryColumn(e.target.value)}
                    />
                  </div>
                  <div className="flex-1 min-w-[100px]">
                    <Label htmlFor="query-value" className="text-xs">Value</Label>
                    <Input
                      id="query-value"
                      className="h-8 text-sm mt-1"
                      placeholder="Search"
                      value={queryValue}
                      onChange={(e) => setQueryValue(e.target.value)}
                    />
                  </div>
                  <Button
                    onClick={handleQuery}
                    disabled={loading || !queryColumn || !queryValue}
                    className="h-8 text-sm"
                    size="sm"
                  >
                    <Search className="h-3 w-3 mr-1" />
                    Query
                  </Button>
                  <Button
                    variant="outline"
                    onClick={handleRefresh}
                    disabled={loading}
                    className="h-8 text-sm"
                    size="sm"
                  >
                    <RefreshCw className="h-3 w-3 mr-1" />
                    Refresh
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        <div className="flex-1 overflow-hidden flex flex-col p-6">
          {!selectedTable ? (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <Database className="h-16 w-16 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">No Table Selected</h3>
              <p className="text-sm text-muted-foreground">
                Select a table from the left sidebar to view and manage records
              </p>
            </div>
          ) : (
            <div className="flex h-full gap-4 overflow-hidden">
              {/* Main Content */}
              <div className="flex-1 flex flex-col gap-4 overflow-hidden">

              {/* Records Table */}
              <Card className="flex-1 flex flex-col overflow-hidden">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle>{selectedTableInfo?.displayName} Records</CardTitle>
                      <CardDescription>
                        {records.length > 0 ? (
                          <>
                            Showing {currentPageStart}-{currentPageStart + records.length - 1}
                            {totalRecordsCount > 0 && ` of ${totalRecordsCount}`} records
                            {selectedRows.size > 0 && ` (${selectedRows.size} selected)`}
                          </>
                        ) : (
                          'No records found'
                        )}
                      </CardDescription>
                    </div>
                    <div className="flex gap-2">
                      {selectedRows.size > 0 && (
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={handleDeleteSelected}
                          disabled={loading}
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Delete Selected ({selectedRows.size})
                        </Button>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => loadRecords(selectedTable, 'backward')}
                        disabled={loading || !lastKey}
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => loadRecords(selectedTable, 'forward')}
                        disabled={loading || !hasMore}
                      >
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="flex-1 overflow-hidden">
                  {loading ? (
                    <div className="flex items-center justify-center py-8">
                      <RefreshCw className="h-6 w-6 animate-spin text-primary" />
                    </div>
                  ) : records.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      No records found
                    </div>
                  ) : (
                    <div className="relative h-full overflow-auto block">
                      <Table className="min-w-full">
                        <TableHeader className="sticky top-0 bg-muted z-20 shadow-sm after:absolute after:bottom-0 after:left-0 after:right-0 after:h-px after:bg-border">
                          <TableRow>
                            <TableHead className="w-12 bg-muted border-r border-border">
                              <Checkbox
                                checked={selectAll}
                                onCheckedChange={handleSelectAll}
                                aria-label="Select all"
                              />
                            </TableHead>
                            {records.some(r => Object.values(r).some(v => typeof v === 'object' && v !== null)) && (
                              <TableHead className="w-10 bg-muted border-r border-border"></TableHead>
                            )}
                            {getColumns().map((column) => (
                              <TableHead key={column} className="whitespace-nowrap bg-muted border-r border-border">
                                {column}
                              </TableHead>
                            ))}
                            {(selectedTable === 'soc-pilot-projects' ||
                              selectedTable === 'file-system:components' ||
                              selectedTable === 'file-system:templates') && (
                              <TableHead className="w-20 bg-muted border-r border-border">Actions</TableHead>
                            )}
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {records.map((record, index) => {
                            const hasComplexData = Object.values(record).some(
                              v => typeof v === 'object' && v !== null
                            );
                            const isExpanded = expandedRows.has(index);
                            const isFileSystemTable = selectedTable === 'file-system:components' || selectedTable === 'file-system:templates';

                            return (
                              <React.Fragment key={index}>
                                <TableRow className={isExpanded ? 'border-b-0' : ''}>
                                  <TableCell className="w-12">
                                    <Checkbox
                                      checked={selectedRows.has(index)}
                                      onCheckedChange={(checked) => handleRowSelect(index, checked as boolean)}
                                      aria-label={`Select row ${index + 1}`}
                                    />
                                  </TableCell>
                                  {hasComplexData && (
                                    <TableCell className="w-10">
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-6 w-6 p-0"
                                        onClick={() => toggleRowExpansion(index)}
                                      >
                                        {isExpanded ? (
                                          <ChevronUp className="h-4 w-4" />
                                        ) : (
                                          <ChevronDown className="h-4 w-4" />
                                        )}
                                      </Button>
                                    </TableCell>
                                  )}
                                  {getColumns().map((column) => (
                                    <TableCell key={column} className="max-w-xs border-r border-border">
                                      {formatCellValue(record[column], column)}
                                    </TableCell>
                                  ))}
                                  {isFileSystemTable && (
                                    <TableCell>
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => handleOpenEditor(record)}
                                        title="Edit file in Monaco Editor"
                                      >
                                        <Edit className="h-4 w-4" />
                                      </Button>
                                    </TableCell>
                                  )}
                                  {selectedTable === 'soc-pilot-projects' && (
                                    <TableCell>
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => {
                                          setSelectedProject({
                                            id: record.id,
                                            name: record.name || record.id
                                          });
                                          setFileExplorerOpen(true);
                                        }}
                                        title="Browse project files"
                                      >
                                        <FolderTree className="h-4 w-4" />
                                      </Button>
                                    </TableCell>
                                  )}
                                </TableRow>
                                {isExpanded && hasComplexData && (
                                  <TableRow>
                                    <TableCell colSpan={getColumns().length + 2} className="p-0">
                                      {renderExpandedContent(record)}
                                    </TableCell>
                                  </TableRow>
                                )}
                              </React.Fragment>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
          )}
        </div>
      </div>

      {/* Project File Explorer */}
      {selectedProject && (
        <ProjectFileExplorer
          open={fileExplorerOpen}
          onClose={() => {
            setFileExplorerOpen(false);
            setSelectedProject(null);
          }}
          projectId={selectedProject.id}
          projectName={selectedProject.name}
        />
      )}

      {/* JSON Editor Dialog */}
      {editorFile && (
        <JsonEditorDialog
          open={editorOpen}
          onClose={() => {
            setEditorOpen(false);
            setEditorFile(null);
          }}
          title={`Edit ${editorFile.type === 'components' ? 'Component' : 'Design Example'}: ${editorFile.id}`}
          description={`File path: data/${editorFile.type}/${editorFile.id}.json`}
          content={editorFile.content}
          onSave={handleSaveFile}
        />
      )}
    </div>
  );
}

export default AdminView;
