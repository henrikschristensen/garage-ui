import { useState, useEffect, useCallback } from 'react';
import { objectsApi } from '@/lib/api';
import type { S3Object, UploadTask } from '@/types';
import { toast } from 'sonner';

export function useBucketObjects(bucketName: string | null, currentPath: string = '') {
  const [objects, setObjects] = useState<S3Object[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isNavigating, setIsNavigating] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [isTruncated, setIsTruncated] = useState(false);
  const [nextContinuationToken, setNextContinuationToken] = useState<string | undefined>(undefined);
  const [itemsPerPage, setItemsPerPage] = useState(25);
  const [currentContinuationToken, setCurrentContinuationToken] = useState<string | undefined>(undefined);
  const [previousPath, setPreviousPath] = useState<string>(currentPath);
  const [uploadTasks, setUploadTasks] = useState<UploadTask[]>([]);

  const fetchObjects = useCallback(async (continuationToken?: string, isRefresh = false, isNav = false) => {
    if (!bucketName) return;

    try {
      if (isRefresh) {
        setIsRefreshing(true);
      } else if (isNav) {
        setIsNavigating(true);
      } else {
        setIsLoading(true);
      }
      setError(null);
      const response = await objectsApi.list(bucketName, currentPath, itemsPerPage, continuationToken);
      setObjects(response.objects);
      setIsTruncated(response.isTruncated);
      setNextContinuationToken(response.nextContinuationToken);
      setCurrentContinuationToken(continuationToken);
    } catch (err) {
      setError(err as Error);
      console.error('Failed to fetch objects:', err);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
      setIsNavigating(false);
    }
  }, [bucketName, currentPath, itemsPerPage]);

  useEffect(() => {
    if (!bucketName) return;

    // Detect if this is a path change (navigation) or initial load
    const isPathChange = previousPath !== currentPath && objects.length > 0;
    setPreviousPath(currentPath);

    // Use navigation mode if it's a path change, otherwise use normal loading
    fetchObjects(undefined, false, isPathChange);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bucketName, currentPath, itemsPerPage]);

  const uploadFiles = useCallback(async (files: File[]) => {
    if (!bucketName) return false;

    // Check if files are from a folder upload
    const hasRelativePaths = files.some((file: any) => file.webkitRelativePath);

    // Get unique folders from the files
    const folders = new Set<string>();
    files.forEach((file: any) => {
      if (file.webkitRelativePath) {
        const parts = file.webkitRelativePath.split('/');
        if (parts.length > 1) {
          folders.add(parts[0]);
        }
      }
    });

    // Initialize upload tasks
    const tasks: UploadTask[] = files.map((file, index) => {
      const relativePath = (file as any).webkitRelativePath || file.name;
      const key = currentPath ? `${currentPath}${relativePath}` : relativePath;
      return {
        id: `${Date.now()}-${index}`,
        file,
        key,
        bucket: bucketName,
        progress: 0,
        status: 'pending' as const,
      };
    });

    setUploadTasks(tasks);

    // Upload files with progress tracking and error handling
    let successCount = 0;
    let errorCount = 0;

    // Upload files one by one
    const concurrency = 1;
    const uploadPromises: Promise<void>[] = [];

    for (let i = 0; i < tasks.length; i += concurrency) {
      const batch = tasks.slice(i, Math.min(i + concurrency, tasks.length));

      const batchPromises = batch.map(async (task) => {
        try {
          // Update task status to uploading
          setUploadTasks(prev => prev.map(t =>
            t.id === task.id ? { ...t, status: 'uploading' as const } : t
          ));

          await objectsApi.upload(bucketName, task.key, task.file, (progress) => {
            setUploadTasks(prev => prev.map(t =>
              t.id === task.id ? { ...t, progress } : t
            ));
          });

          // Update task status to completed
          setUploadTasks(prev => prev.map(t =>
            t.id === task.id ? { ...t, status: 'completed' as const, progress: 100 } : t
          ));
          successCount++;
        } catch (error) {
          // Update task status to error but continue with other uploads
          const errorMessage = error instanceof Error ? error.message : 'Upload failed';
          setUploadTasks(prev => prev.map(t =>
            t.id === task.id ? { ...t, status: 'error' as const, error: errorMessage } : t
          ));
          errorCount++;
          console.error(`Failed to upload ${task.key}:`, error);
        }
      });

      uploadPromises.push(...batchPromises);
      await Promise.all(batchPromises);
    }

    await Promise.all(uploadPromises);

    // Show summary toast
    if (errorCount === 0) {
      if (hasRelativePaths && folders.size > 0) {
        const folderNames = Array.from(folders).join(', ');
        toast.success(`Successfully uploaded ${successCount} file${successCount > 1 ? 's' : ''} from ${folders.size} folder${folders.size > 1 ? 's' : ''} (${folderNames})`);
      } else {
        toast.success(`Successfully uploaded ${successCount} file${successCount > 1 ? 's' : ''}`);
      }
    } else if (successCount > 0) {
      toast.warning(`Uploaded ${successCount} file${successCount > 1 ? 's' : ''}, ${errorCount} failed`);
    } else {
      toast.error(`Failed to upload ${errorCount} file${errorCount > 1 ? 's' : ''}`);
    }

    // Clear upload tasks after a delay
    setTimeout(() => {
      setUploadTasks([]);
    }, 3000);

    await fetchObjects(currentContinuationToken, true);
    return successCount > 0;
  }, [bucketName, currentPath, currentContinuationToken, fetchObjects]);

  const deleteObject = useCallback(async (key: string) => {
    if (!bucketName) return false;

    try {
      // Optimistically remove the object from the UI
      setObjects(prev => prev.filter(obj => obj.key !== key));

      await objectsApi.delete(bucketName, key);
      toast.success(`Object "${key}" deleted successfully`);
      await fetchObjects(currentContinuationToken, true);
      return true;
    } catch (error) {
      console.error('Delete object error:', error);
      // Revert the optimistic update by refetching
      await fetchObjects(currentContinuationToken, true);
      return false;
    }
  }, [bucketName, currentContinuationToken, fetchObjects]);

  const deleteMultipleObjects = useCallback(async (keys: string[]) => {
    if (!bucketName || keys.length === 0) return false;

    try {
      // Optimistically remove the objects from the UI
      setObjects(prev => prev.filter(obj => !keys.includes(obj.key)));

      await objectsApi.deleteMultiple(bucketName, keys, currentPath || undefined);
      toast.success(`Successfully deleted ${keys.length} file${keys.length > 1 ? 's' : ''}`);
      await fetchObjects(currentContinuationToken, true);
      return true;
    } catch (error) {
      console.error('Bulk delete error:', error);
      // Revert the optimistic update by refetching
      await fetchObjects(currentContinuationToken, true);
      return false;
    }
  }, [bucketName, currentPath, currentContinuationToken, fetchObjects]);

  const createDirectory = useCallback(async (dirName: string) => {
    if (!bucketName) return false;

    try {
      const dirKey = currentPath ? `${currentPath}${dirName}/` : `${dirName}/`;
      await objectsApi.upload(bucketName, dirKey, new File([], '.keep'));
      toast.success(`Directory "${dirName}" created successfully`);
      await fetchObjects(currentContinuationToken, true);
      return true;
    } catch (error) {
      console.error('Create directory error:', error);
      return false;
    }
  }, [bucketName, currentPath, currentContinuationToken, fetchObjects]);

  return {
    objects,
    isLoading,
    isRefreshing,
    isNavigating,
    error,
    isTruncated,
    nextContinuationToken,
    currentContinuationToken,
    itemsPerPage,
    setItemsPerPage,
    fetchObjects,
    uploadFiles,
    uploadTasks,
    deleteObject,
    deleteMultipleObjects,
    createDirectory,
  };
}
