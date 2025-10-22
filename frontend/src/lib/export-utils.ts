/**
 * Export Utilities
 * Helper functions for exporting and downloading files
 */

import JSZip from 'jszip';
import pako from 'pako';
import Tar from 'tar-js';

/**
 * Download a file with the given content
 */
export function downloadFile(
  content: string | Blob,
  filename: string,
  mimeType: string = 'text/plain'
): void {
  const blob = typeof content === 'string'
    ? new Blob([content], { type: mimeType })
    : content;

  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Convert object to JSON and download
 */
export function downloadJSON(data: any, filename: string): void {
  const jsonString = JSON.stringify(data, null, 2);
  downloadFile(jsonString, filename, 'application/json');
}

/**
 * Convert array of objects to CSV and download
 */
export function downloadCSV(data: any[], filename: string): void {
  if (!data || data.length === 0) {
    throw new Error('No data to export');
  }

  // Get headers from first object
  const headers = Object.keys(data[0]);

  // Create CSV content
  const csvRows = [
    headers.join(','), // Header row
    ...data.map(row =>
      headers.map(header => {
        const value = row[header];
        // Escape quotes and wrap in quotes if contains comma or quote
        const stringValue = value === null || value === undefined ? '' : String(value);
        if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
          return `"${stringValue.replace(/"/g, '""')}"`;
        }
        return stringValue;
      }).join(',')
    )
  ];

  const csvContent = csvRows.join('\n');
  downloadFile(csvContent, filename, 'text/csv');
}

/**
 * Generate Markdown documentation
 */
export function generateMarkdownDoc(sections: { title: string; content: string }[]): string {
  let markdown = '';

  sections.forEach(section => {
    markdown += `# ${section.title}\n\n`;
    markdown += `${section.content}\n\n`;
    markdown += '---\n\n';
  });

  return markdown;
}

/**
 * Format date for filenames (YYYY-MM-DD)
 */
export function getDateStamp(): string {
  const now = new Date();
  return now.toISOString().split('T')[0];
}

/**
 * Format timestamp for filenames (YYYY-MM-DD_HH-MM-SS)
 */
export function getTimestamp(): string {
  const now = new Date();
  return now.toISOString()
    .replace(/T/, '_')
    .replace(/:/g, '-')
    .split('.')[0];
}

/**
 * Create a ZIP file with multiple files and download it
 */
export async function createAndDownloadZip(
  files: Array<{ filename: string; content: string | Blob }>,
  zipFilename: string
): Promise<void> {
  const zip = new JSZip();

  // Add all files to the zip
  for (const file of files) {
    if (typeof file.content === 'string') {
      zip.file(file.filename, file.content);
    } else {
      zip.file(file.filename, file.content);
    }
  }

  // Generate the zip file
  const blob = await zip.generateAsync({ type: 'blob' });

  // Download the zip file
  downloadFile(blob, zipFilename, 'application/zip');
}

/**
 * Create a TAR.GZ file with multiple files and download it
 */
export async function createAndDownloadTarGz(
  files: Array<{ filename: string; content: string | Blob }>,
  tarGzFilename: string
): Promise<void> {
  const tar = new Tar();

  // Add all files to the tar archive
  for (const file of files) {
    let content: string;

    if (typeof file.content === 'string') {
      content = file.content;
    } else {
      // Convert Blob to string (assuming text content)
      content = await file.content.text();
    }

    tar.append(file.filename, content);
  }

  // Get the tar data as Uint8Array
  const tarData = tar.out;

  // Compress with gzip
  const gzipData = pako.gzip(tarData);

  // Create blob and download
  const blob = new Blob([gzipData], { type: 'application/gzip' });
  downloadFile(blob, tarGzFilename, 'application/gzip');
}
