import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { AlertTriangle, Info } from 'lucide-react';
import { useBuckets, useDeleteBucket } from '@/hooks/useApi';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { DangerousConfirmDialog } from '@/components/ui/dangerous-confirm-dialog';
import { toast } from 'sonner';
import { formatBytes } from '@/lib/file-utils';
import { formatDate as formatDateUtil } from '@/lib/utils';

const formatBytesOrDash = (n?: number) => (n == null ? '—' : formatBytes(n));
const formatDateOrDash = (iso?: string) => (iso ? formatDateUtil(iso) : '—');

export function BucketSettings() {
  const { bucketName = '' } = useParams<{ bucketName: string }>();
  const navigate = useNavigate();
  const { data: buckets = [], isLoading } = useBuckets();
  const bucket = buckets.find((b) => b.name === bucketName);
  const deleteMutation = useDeleteBucket();

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  if (isLoading) {
    return <div className="px-7 py-6 text-[13.5px] text-[var(--muted-foreground)]">Loading…</div>;
  }
  if (!bucket) {
    return (
      <div className="px-7 py-6">
        <EmptyState
          icon={<AlertTriangle />}
          tone="neutral"
          title="Bucket not found"
          description="The bucket you're looking for doesn't exist or you don't have access."
        />
      </div>
    );
  }

  const confirmDelete = async () => {
    setDeleting(true);
    try {
      await deleteMutation.mutateAsync(bucket.name);
      toast.success('Bucket deleted');
      navigate('/buckets');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Delete failed');
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-6 px-7 py-6">
      {/* Info */}
      <section className="rounded-xl border border-[var(--border)] bg-[var(--card)]">
        <header className="flex items-center gap-2 border-b border-[var(--border)] px-5 py-3">
          <Info className="h-4 w-4 text-[var(--primary)]" />
          <h2 className="text-[15px] font-semibold">Bucket info</h2>
        </header>
        <dl className="grid grid-cols-1 gap-x-6 gap-y-4 px-5 py-5 sm:grid-cols-2">
          <Field label="Name" value={<span className="font-mono text-[13.5px]">{bucket.name}</span>} />
          <Field label="Region" value={bucket.region ?? '—'} />
          <Field label="Created" value={formatDateOrDash(bucket.creationDate)} />
          <Field label="Objects" value={bucket.objectCount != null ? bucket.objectCount.toLocaleString() : '—'} />
          <Field label="Size" value={formatBytesOrDash(bucket.size)} />
          <Field
            label="Website"
            value={
              <Badge variant={bucket.websiteAccess ? 'success' : 'neutral'}>
                {bucket.websiteAccess ? 'Enabled' : 'Disabled'}
              </Badge>
            }
          />
        </dl>
      </section>

      {/* Danger zone */}
      <section className="rounded-xl border border-[var(--danger-border)] bg-[var(--card)]">
        <header className="border-b border-[var(--danger-border)] px-5 py-3">
          <h2 className="text-[15px] font-semibold text-[var(--destructive)]">Danger zone</h2>
          <p className="mt-0.5 text-[13.5px] text-[var(--muted-foreground)]">
            Destructive actions for this bucket.
          </p>
        </header>
        <div className="flex items-center justify-between gap-4 px-5 py-4">
          <div className="min-w-0">
            <div className="text-[14px] font-medium">Delete bucket</div>
            <div className="text-[13.5px] text-[var(--muted-foreground)]">
              All objects in this bucket will be permanently removed.
            </div>
          </div>
          <Button variant="destructive" onClick={() => setDeleteOpen(true)}>
            Delete bucket
          </Button>
        </div>
      </section>

      <DangerousConfirmDialog
        open={deleteOpen}
        onOpenChange={(o) => {
          if (!o && !deleting) setDeleteOpen(false);
        }}
        title={`Delete bucket "${bucket.name}"?`}
        description="This action cannot be undone."
        confirmationText={bucket.name}
        confirmLabel="Delete bucket"
        loading={deleting}
        onConfirm={confirmDelete}
      />
    </div>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[11px] font-medium uppercase tracking-[0.08em] text-[var(--muted-foreground)]">{label}</dt>
      <dd className="mt-1 text-[14px]">{value}</dd>
    </div>
  );
}
