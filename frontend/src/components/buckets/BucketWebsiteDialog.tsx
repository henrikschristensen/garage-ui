import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import type { Bucket } from '@/types';

interface BucketWebsiteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bucket: Bucket | null;
  onSave: (
    bucketName: string,
    payload: { enabled: boolean; indexDocument?: string; errorDocument?: string }
  ) => Promise<boolean>;
}

export function BucketWebsiteDialog({
  open,
  onOpenChange,
  bucket,
  onSave,
}: BucketWebsiteDialogProps) {
  const [enabled, setEnabled] = useState(false);
  const [indexDocument, setIndexDocument] = useState('index.html');
  const [errorDocument, setErrorDocument] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open && bucket) {
      setEnabled(bucket.websiteAccess);
      setIndexDocument(bucket.websiteConfig?.indexDocument ?? 'index.html');
      setErrorDocument(bucket.websiteConfig?.errorDocument ?? '');
    }
  }, [open, bucket]);

  const handleSave = async () => {
    if (!bucket) return;
    setSaving(true);
    const success = await onSave(bucket.name, {
      enabled,
      indexDocument: enabled ? indexDocument : undefined,
      errorDocument: enabled && errorDocument ? errorDocument : undefined,
    });
    setSaving(false);
    if (success) onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Website Hosting — {bucket?.name}</DialogTitle>
          <DialogDescription>
            Configure this bucket to serve a static website.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Website access</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Allow public HTTP access to bucket objects
              </p>
            </div>
            <div className="flex items-center gap-3">
              <Badge variant={enabled ? 'default' : 'secondary'}>
                {enabled ? 'Enabled' : 'Disabled'}
              </Badge>
              <Switch checked={enabled} onCheckedChange={setEnabled} />
            </div>
          </div>

          {enabled && (
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">
                  Index document <span className="text-destructive">*</span>
                </label>
                <Input
                  value={indexDocument}
                  onChange={(e) => setIndexDocument(e.target.value)}
                  placeholder="index.html"
                />
                <p className="text-xs text-muted-foreground">
                  The file served when a directory is requested (e.g. index.html)
                </p>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Error document</label>
                <Input
                  value={errorDocument}
                  onChange={(e) => setErrorDocument(e.target.value)}
                  placeholder="404.html (optional)"
                />
                <p className="text-xs text-muted-foreground">
                  The file served when an object is not found (optional)
                </p>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            variant={!enabled && bucket?.websiteAccess ? 'destructive' : 'default'}
            disabled={saving || (enabled && !indexDocument)}
          >
            {saving
              ? 'Saving...'
              : !enabled && bucket?.websiteAccess
              ? 'Disable Website'
              : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
