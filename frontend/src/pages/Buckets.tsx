import { useState, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { Header } from '@/components/layout/header';
import { useBuckets, useCreateBucket, useDeleteBucket, useGrantBucketPermission } from '@/hooks/useApi';
import { useBucketObjects } from '@/hooks/useBucketObjects';
import { BucketListView } from '@/components/buckets/BucketListView';
import { ObjectBrowserView } from '@/components/buckets/ObjectBrowserView';
import { CreateBucketDialog } from '@/components/buckets/CreateBucketDialog';
import { DeleteBucketDialog } from '@/components/buckets/DeleteBucketDialog';
import { BucketSettingsDialog } from '@/components/buckets/BucketSettingsDialog';
import { BucketWebsiteDialog } from '@/components/buckets/BucketWebsiteDialog';
import type { Bucket } from '@/types';
import { toast } from 'sonner';
import { bucketsApi } from '@/lib/api';

export function Buckets() {
  const [searchParams, setSearchParams] = useSearchParams();

  // Bucket state
  const [searchQuery, setSearchQuery] = useState('');
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [deleteBucketDialogOpen, setDeleteBucketDialogOpen] = useState(false);
  const [selectedBucket, setSelectedBucket] = useState<Bucket | null>(null);
  const [settingsDialogOpen, setSettingsDialogOpen] = useState(false);
  const [settingsBucket, setSettingsBucket] = useState<Bucket | null>(null);
  const [websiteDialogOpen, setWebsiteDialogOpen] = useState(false);
  const [websiteBucket, setWebsiteBucket] = useState<Bucket | null>(null);

  // Object browser state - initialize from URL params
  const [viewingBucket, setViewingBucket] = useState<string | null>(searchParams.get('bucket'));
  const [currentPath, setCurrentPath] = useState<string>(searchParams.get('prefix') || '');
  const [objectSearchQuery, setObjectSearchQuery] = useState('');
  const [initialPageToken, setInitialPageToken] = useState<string | undefined>(
    searchParams.get('page') || undefined
  );
  const [initialItemsPerPage, setInitialItemsPerPage] = useState<number>(
    parseInt(searchParams.get('limit') || '25', 10)
  );

  // Sync URL params with state on mount and when URL changes
  useEffect(() => {
    const bucketParam = searchParams.get('bucket');
    const prefixParam = searchParams.get('prefix') || '';
    const pageParam = searchParams.get('page') || undefined;
    const limitParam = parseInt(searchParams.get('limit') || '25', 10);

    if (bucketParam !== viewingBucket) {
      setViewingBucket(bucketParam);
    }
    if (prefixParam !== currentPath) {
      setCurrentPath(prefixParam);
    }
    setInitialPageToken(pageParam);
    setInitialItemsPerPage(limitParam);
  }, [searchParams]);

  // Custom hooks
  const queryClient = useQueryClient();
  const { data: buckets = [], isLoading: bucketsLoading } = useBuckets();
  const createBucketMutation = useCreateBucket();
  const deleteBucketMutation = useDeleteBucket();
  const grantPermissionMutation = useGrantBucketPermission();
  const {
    objects,
    isLoading: objectsLoading,
    isRefreshing,
    isNavigating,
    isTruncated,
    nextContinuationToken,
    itemsPerPage,
    setItemsPerPage,
    uploadFiles,
    uploadTasks,
    deleteObject,
    deleteMultipleObjects,
    createDirectory,
    fetchObjects
  } = useBucketObjects(
    viewingBucket,
    currentPath
  );

  const handleViewBucket = (bucketName: string) => {
    setViewingBucket(bucketName);
    setCurrentPath('');
    setObjectSearchQuery('');
    setSearchParams({ bucket: bucketName });
  };

  const handleBackToBuckets = () => {
    setViewingBucket(null);
    setCurrentPath('');
    setObjectSearchQuery('');
    setSearchParams({});
  };

  const handleNavigateToFolder = (path: string) => {
    setCurrentPath(path);
    if (viewingBucket) {
      const params: Record<string, string> = { bucket: viewingBucket };
      if (path) {
        params.prefix = path;
      }
      // Reset pagination when navigating to a new folder
      setSearchParams(params);
    }
  };

  const handlePageChange = (token?: string) => {
    fetchObjects(token);
    // Update URL with page token
    if (viewingBucket) {
      const params: Record<string, string> = { bucket: viewingBucket };
      if (currentPath) {
        params.prefix = currentPath;
      }
      if (token) {
        params.page = token;
      }
      if (itemsPerPage !== 25) {
        params.limit = itemsPerPage.toString();
      }
      setSearchParams(params);
    }
  };

  const handleItemsPerPageChange = (count: number) => {
    setItemsPerPage(count);
    // Update URL with new limit
    if (viewingBucket) {
      const params: Record<string, string> = { bucket: viewingBucket };
      if (currentPath) {
        params.prefix = currentPath;
      }
      if (count !== 25) {
        params.limit = count.toString();
      }
      setSearchParams(params);
    }
  };

  const handleOpenSettings = (bucket: Bucket) => {
    setSettingsBucket(bucket);
    setSettingsDialogOpen(true);
  };

  const handleOpenWebsiteSettings = (bucket: Bucket) => {
    setWebsiteBucket(bucket);
    setWebsiteDialogOpen(true);
  };

  const handleSaveWebsite = async (
    bucketName: string,
    payload: { enabled: boolean; indexDocument?: string; errorDocument?: string }
  ): Promise<boolean> => {
    try {
      await bucketsApi.updateBucketWebsite(bucketName, payload);
      queryClient.invalidateQueries({ queryKey: ['buckets'] });
      toast.success('Website configuration updated');
      return true;
    } catch {
      return false;
    }
  };

  const handleRefreshObjects = async () => {
    if (isRefreshing) return;
    try {
      await fetchObjects(undefined, true);
      toast.success('Objects refreshed successfully');
    } catch (error) {
      console.error('Refresh error:', error);
    }
  };

  // Wrapper functions for mutations to match dialog APIs
  const createBucket = async (name: string, region?: string) => {
    try {
      await createBucketMutation.mutateAsync({ name, region });
      return true;
    } catch (error) {
      return false;
    }
  };

  const deleteBucket = async (name: string) => {
    try {
      await deleteBucketMutation.mutateAsync(name);
      return true;
    } catch (error) {
      return false;
    }
  };

  const grantPermission = async (
    bucketName: string,
    accessKeyId: string,
    permissions: { read: boolean; write: boolean; owner: boolean }
  ) => {
    try {
      await grantPermissionMutation.mutateAsync({ bucketName, accessKeyId, permissions });
      return true;
    } catch (error) {
      return false;
    }
  };

  // If viewing a bucket's objects, show the object browser view
  if (viewingBucket) {
    return (
      <ObjectBrowserView
        bucketName={viewingBucket}
        objects={objects}
        currentPath={currentPath}
        searchQuery={objectSearchQuery}
        isLoading={objectsLoading}
        isTruncated={isTruncated}
        nextContinuationToken={nextContinuationToken}
        itemsPerPage={itemsPerPage}
        onSearchChange={setObjectSearchQuery}
        onNavigateToFolder={handleNavigateToFolder}
        onBackToBuckets={handleBackToBuckets}
        onUploadFiles={uploadFiles}
        uploadTasks={uploadTasks}
        onDeleteObject={deleteObject}
        onDeleteMultipleObjects={deleteMultipleObjects}
        onCreateDirectory={createDirectory}
        onRefresh={handleRefreshObjects}
        onPageChange={handlePageChange}
        onItemsPerPageChange={handleItemsPerPageChange}
        isRefreshing={isRefreshing}
        isNavigating={isNavigating}
        initialPageToken={initialPageToken}
        initialItemsPerPage={initialItemsPerPage}
      />
    );
  }

  // Default view: show buckets list
  return (
    <div>
      <Header title="Buckets" />
      <div className="p-4 sm:p-6">
        <BucketListView
          buckets={buckets}
          searchQuery={searchQuery}
          isLoading={bucketsLoading}
          onSearchChange={setSearchQuery}
          onViewBucket={handleViewBucket}
          onOpenSettings={handleOpenSettings}
          onWebsiteSettings={handleOpenWebsiteSettings}
          onCreateBucket={() => setCreateDialogOpen(true)}
          onDeleteBucket={(bucket) => {
            setSelectedBucket(bucket);
            setDeleteBucketDialogOpen(true);
          }}
        />
      </div>

      {/* Dialogs */}
      <CreateBucketDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        onCreateBucket={createBucket}
      />

      <DeleteBucketDialog
        open={deleteBucketDialogOpen}
        onOpenChange={setDeleteBucketDialogOpen}
        bucket={selectedBucket}
        onDeleteBucket={deleteBucket}
      />

      <BucketSettingsDialog
        open={settingsDialogOpen}
        onOpenChange={setSettingsDialogOpen}
        bucket={settingsBucket}
        onGrantPermission={grantPermission}
      />

      <BucketWebsiteDialog
        open={websiteDialogOpen}
        onOpenChange={setWebsiteDialogOpen}
        bucket={websiteBucket}
        onSave={handleSaveWebsite}
      />
    </div>
  );
}
