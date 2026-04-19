import * as React from 'react';
import { Trash2, AlertTriangle } from 'lucide-react';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './dialog';
import { IconTile } from './icon-tile';
import { Button } from './button';

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  icon?: React.ReactNode;
  tone?: 'destructive' | 'primary';
  loading?: boolean;
  onConfirm: () => void | Promise<void>;
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = 'Delete',
  cancelLabel = 'Cancel',
  icon,
  tone = 'destructive',
  loading = false,
  onConfirm,
}: ConfirmDialogProps) {
  const defaultIcon = tone === 'destructive' ? <Trash2 /> : <AlertTriangle />;
  return (
    <Dialog open={open} onOpenChange={onOpenChange} size="destructive">
      <DialogContent>
        <DialogHeader>
          <IconTile icon={icon ?? defaultIcon} tone={tone} size="md" />
          <div className="flex-1">
            <DialogTitle>{title}</DialogTitle>
            {description && <DialogDescription>{description}</DialogDescription>}
          </div>
        </DialogHeader>
        <DialogBody>
          <p className="text-[13.5px] text-[var(--muted-foreground)]">This action cannot be undone.</p>
        </DialogBody>
        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={loading}>
            {cancelLabel}
          </Button>
          <Button
            variant={tone === 'destructive' ? 'destructive' : 'primary'}
            onClick={() => onConfirm()}
            disabled={loading}
          >
            {loading ? 'Working…' : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
