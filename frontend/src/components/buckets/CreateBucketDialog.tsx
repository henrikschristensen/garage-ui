import { useEffect, useState } from 'react';
import { Database } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { IconTile } from '@/components/ui/icon-tile';
import { toast } from 'sonner';

interface CreateBucketDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreateBucket: (name: string) => Promise<boolean>;
}

export function CreateBucketDialog({ open, onOpenChange, onCreateBucket }: CreateBucketDialogProps) {
  const [bucketName, setBucketName] = useState('');

  useEffect(() => { if (!open) setBucketName(''); }, [open]);

  const handleCreate = async () => {
    if (!bucketName) {
      toast.error('Please enter a bucket name');
      return;
    }

    const success = await onCreateBucket(bucketName);
    if (success) {
      setBucketName('');
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <IconTile icon={<Database />} tone="primary" size="md" />
          <div className="flex-1">
            <DialogTitle>Create New Bucket</DialogTitle>
            <DialogDescription>
              Create a new storage bucket for your objects
            </DialogDescription>
          </div>
        </DialogHeader>
        <DialogBody className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Bucket Name</label>
            <Input
              autoFocus
              placeholder="my-bucket-name"
              value={bucketName}
              onChange={(e) => setBucketName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleCreate();
                }
              }}
            />
            <p className="text-xs text-muted-foreground">
              Must be unique and follow DNS naming conventions
            </p>
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={handleCreate}
            disabled={!bucketName}
          >
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
