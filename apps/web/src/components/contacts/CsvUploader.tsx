import { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload, FileText, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { contactsApi } from '../../services/api';
import { Button } from '../common/Button';

interface CsvUploaderProps {
  onSuccess?: () => void;
}

export function CsvUploader({ onSuccess }: CsvUploaderProps) {
  const [file, setFile] = useState<File | null>(null);
  const [batchName, setBatchName] = useState(() => `Import ${new Date().toLocaleString()}`);
  const queryClient = useQueryClient();

  const importMutation = useMutation({
    mutationFn: (file: File) => contactsApi.import(file, batchName),
    onSuccess: (response) => {
      const result = response.data.data;
      toast.success(
        `Imported ${result.created} new contacts, updated ${result.updated} existing`
      );
      queryClient.invalidateQueries({ queryKey: ['contacts'] });
      queryClient.invalidateQueries({ queryKey: ['importBatches'] });
      setFile(null);
      onSuccess?.();
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to import contacts');
    },
  });

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const csvFile = acceptedFiles[0];
    if (csvFile) {
      setFile(csvFile);
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'text/csv': ['.csv'],
    },
    maxFiles: 1,
    maxSize: 10 * 1024 * 1024, // 10MB
  });

  const handleUpload = () => {
    if (file) {
      importMutation.mutate(file);
    }
  };

  const handleDownloadTemplate = () => {
    // Direct link download - more reliable than fetching blob
    const link = document.createElement('a');
    link.href = '/api/contacts/template';
    link.download = 'contacts_template.csv';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-4">
      {/* Dropzone */}
      <div
        {...getRootProps()}
        className={`cursor-pointer rounded-lg border-2 border-dashed p-8 text-center transition-colors ${
          isDragActive
            ? 'border-primary-500 bg-primary-50'
            : 'border-gray-300 hover:border-gray-400'
        }`}
      >
        <input {...getInputProps()} />
        <Upload className="mx-auto h-12 w-12 text-gray-400" />
        <p className="mt-4 text-sm text-gray-600">
          {isDragActive ? (
            'Drop the CSV file here...'
          ) : (
            <>
              Drag and drop a CSV file here, or{' '}
              <span className="text-primary-600">click to browse</span>
            </>
          )}
        </p>
        <p className="mt-2 text-xs text-gray-500">Maximum file size: 10MB</p>
      </div>

      {/* Batch name */}
      {file && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Batch Name
          </label>
          <input
            type="text"
            value={batchName}
            onChange={(e) => setBatchName(e.target.value)}
            placeholder="e.g., Spring 2026 Prospects"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
          />
        </div>
      )}

      {/* Selected file */}
      {file && (
        <div className="flex items-center justify-between rounded-lg bg-gray-50 p-4">
          <div className="flex items-center gap-3">
            <FileText className="h-8 w-8 text-gray-400" />
            <div>
              <p className="font-medium text-gray-900">{file.name}</p>
              <p className="text-sm text-gray-500">
                {(file.size / 1024).toFixed(1)} KB
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setFile(null)}
              disabled={importMutation.isPending}
            >
              Remove
            </Button>
            <Button
              size="sm"
              onClick={handleUpload}
              isLoading={importMutation.isPending}
            >
              Upload
            </Button>
          </div>
        </div>
      )}

      {/* Import result */}
      {importMutation.isSuccess && (
        <div className="rounded-lg bg-green-50 p-4">
          <div className="flex items-center gap-2">
            <CheckCircle className="h-5 w-5 text-green-500" />
            <span className="font-medium text-green-800">Import successful!</span>
          </div>
          <div className="mt-2 text-sm text-green-700">
            <p>Created: {importMutation.data?.data?.data?.created ?? 0} contacts</p>
            <p>Updated: {importMutation.data?.data?.data?.updated ?? 0} contacts</p>
            {(importMutation.data?.data?.data?.errors?.length ?? 0) > 0 && (
              <p className="mt-1 text-yellow-700">
                Errors: {importMutation.data?.data?.data?.errors?.length} rows skipped
              </p>
            )}
          </div>
        </div>
      )}

      {/* Error display */}
      {importMutation.isError && (
        <div className="rounded-lg bg-red-50 p-4">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-red-500" />
            <span className="font-medium text-red-800">Import failed</span>
          </div>
          <p className="mt-1 text-sm text-red-700">
            {importMutation.error?.message || 'An error occurred during import'}
          </p>
        </div>
      )}

      {/* Template download */}
      <div className="flex items-center justify-between rounded-lg border border-gray-200 bg-gray-50 p-4">
        <div>
          <p className="font-medium text-gray-900">Need a template?</p>
          <p className="text-sm text-gray-500">
            Download our CSV template with the correct column headers
          </p>
        </div>
        <Button variant="secondary" size="sm" onClick={handleDownloadTemplate}>
          Download Template
        </Button>
      </div>
    </div>
  );
}
