import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectOption } from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useAccessKeys } from '@/hooks/useApi';
import type { Bucket } from '@/types';
import { toast } from 'sonner';

interface BucketSettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bucket: Bucket | null;
  onGrantPermission: (bucketName: string, accessKeyId: string, permissions: { read: boolean; write: boolean; owner: boolean }) => Promise<boolean>;
}

export function BucketSettingsDialog({ open, onOpenChange, bucket, onGrantPermission }: BucketSettingsDialogProps) {
  const { data: availableKeys = [] } = useAccessKeys();
  const [selectedAccessKey, setSelectedAccessKey] = useState<string>('');
  const [permissionRead, setPermissionRead] = useState(false);
  const [permissionWrite, setPermissionWrite] = useState(false);
  const [permissionOwner, setPermissionOwner] = useState(false);

  useEffect(() => {
    if (open && bucket) {
      resetForm();
    }
  }, [open, bucket]);

  const resetForm = () => {
    setSelectedAccessKey('');
    setPermissionRead(false);
    setPermissionWrite(false);
    setPermissionOwner(false);
  };

  const handleAccessKeyChange = (accessKeyId: string) => {
    setSelectedAccessKey(accessKeyId);

    if (!accessKeyId) {
      setPermissionRead(false);
      setPermissionWrite(false);
      setPermissionOwner(false);
      return;
    }

    const selectedKey = availableKeys.find(key => key.accessKeyId === accessKeyId);
    if (selectedKey && bucket) {
      const bucketPermission = selectedKey.permissions.find(
        perm => perm.bucketName === bucket.name || perm.bucketId === bucket.name
      );

      if (bucketPermission) {
        setPermissionRead(bucketPermission.read);
        setPermissionWrite(bucketPermission.write);
        setPermissionOwner(bucketPermission.owner);
      } else {
        setPermissionRead(false);
        setPermissionWrite(false);
        setPermissionOwner(false);
      }
    }
  };

  const handleGrantPermission = async () => {
    if (!bucket || !selectedAccessKey) {
      toast.error('Please select an access key');
      return;
    }

    if (!permissionRead && !permissionWrite && !permissionOwner) {
      toast.error('Please select at least one permission');
      return;
    }

    const success = await onGrantPermission(bucket.name, selectedAccessKey, {
      read: permissionRead,
      write: permissionWrite,
      owner: permissionOwner,
    });

    if (success) {
      resetForm();
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Bucket Settings - {bucket?.name}</DialogTitle>
          <DialogDescription>
            Grant access key permissions for this bucket
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-6 py-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Select Access Key</label>
            <Select
              value={selectedAccessKey}
              onChange={(value) => handleAccessKeyChange(value)}
            >
              <SelectOption value="">-- Select an access key --</SelectOption>
              {availableKeys.map((key) => (
                <SelectOption key={key.accessKeyId} value={key.accessKeyId}>
                  {key.name} ({key.accessKeyId})
                </SelectOption>
              ))}
            </Select>
            <p className="text-xs text-muted-foreground">
              Choose which access key should have permissions on this bucket. Current permissions will be displayed when selected.
            </p>
          </div>

          <div className="space-y-3">
            <label className="text-sm font-medium">Permissions</label>
            <div className="space-y-3 border rounded-lg p-4">
              <div className="flex items-start space-x-3">
                <Checkbox
                  id="permission-read"
                  checked={permissionRead}
                  onCheckedChange={(checked) => setPermissionRead(checked as boolean)}
                />
                <div className="flex-1">
                  <label
                    htmlFor="permission-read"
                    className="text-sm font-medium leading-none cursor-pointer"
                  >
                    Read
                  </label>
                  <p className="text-xs text-muted-foreground mt-1">
                    Allows reading objects from the bucket (GetObject, HeadObject, ListObjects)
                  </p>
                </div>
              </div>

              <div className="flex items-start space-x-3">
                <Checkbox
                  id="permission-write"
                  checked={permissionWrite}
                  onCheckedChange={(checked) => setPermissionWrite(checked as boolean)}
                />
                <div className="flex-1">
                  <label
                    htmlFor="permission-write"
                    className="text-sm font-medium leading-none cursor-pointer"
                  >
                    Write
                  </label>
                  <p className="text-xs text-muted-foreground mt-1">
                    Allows writing and deleting objects in the bucket (PutObject, DeleteObject)
                  </p>
                </div>
              </div>

              <div className="flex items-start space-x-3">
                <Checkbox
                  id="permission-owner"
                  checked={permissionOwner}
                  onCheckedChange={(checked) => setPermissionOwner(checked as boolean)}
                />
                <div className="flex-1">
                  <label
                    htmlFor="permission-owner"
                    className="text-sm font-medium leading-none cursor-pointer"
                  >
                    Owner
                  </label>
                  <p className="text-xs text-muted-foreground mt-1">
                    Allows managing bucket settings and policies (DeleteBucket, PutBucketPolicy)
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleGrantPermission} disabled={!selectedAccessKey}>
            Grant Permission
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
