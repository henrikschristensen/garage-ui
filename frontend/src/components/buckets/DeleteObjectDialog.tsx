import { Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { IconTile } from '@/components/ui/icon-tile';
import type { S3Object } from '@/types';

interface DeleteObjectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  object: S3Object | null;
  onDeleteObject: (key: string) => Promise<boolean>;
}

export function DeleteObjectDialog({ open, onOpenChange, object, onDeleteObject }: DeleteObjectDialogProps) {
  const handleDelete = async () => {
    if (!object) return;

    const success = await onDeleteObject(object.key);
    if (success) {
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange} size="destructive">
      <DialogContent>
        <DialogHeader>
          <IconTile icon={<Trash2 />} tone="destructive" size="md" />
          <div className="flex-1">
            <DialogTitle>Delete Object</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete "{object?.key}"? This action cannot be undone.
            </DialogDescription>
          </div>
        </DialogHeader>
        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={handleDelete}>
            Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
