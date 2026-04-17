import {useEffect, useMemo, useState} from 'react';
import {Header} from '@/components/layout/header';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Badge} from '@/components/ui/badge';
import {Table, TableBody, TableCell, TableHead, TableHeader, TableRow,} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {Tabs, TabsContent} from '@/components/ui/tabs';
import {Card, CardContent, CardHeader, CardTitle} from '@/components/ui/card';
import {Checkbox} from '@/components/ui/checkbox';
import {Select, SelectOption} from '@/components/ui/select';
import {accessApi, bucketsApi} from '@/lib/api';
import {formatDate} from '@/lib/utils';
import type {AccessKey, Bucket, BucketPermission} from '@/types';
import {Copy, Edit, Key, Loader2, MoreVertical, Plus, Search, ShieldCheck, ShieldX, Trash2,} from 'lucide-react';
import {toast} from 'sonner';

export function AccessControl() {
  const [keys, setKeys] = useState<AccessKey[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedKey, setSelectedKey] = useState<AccessKey | null>(null);
  const [newKeyName, setNewKeyName] = useState('');

  // Create key with permissions state
  const [createAvailableBuckets, setCreateAvailableBuckets] = useState<Bucket[]>([]);
  const [createSelectedBucket, setCreateSelectedBucket] = useState<string>('');
  const [createPermissionRead, setCreatePermissionRead] = useState(false);
  const [createPermissionWrite, setCreatePermissionWrite] = useState(false);
  const [createPermissionOwner, setCreatePermissionOwner] = useState(false);
  const [createGrantPermissions, setCreateGrantPermissions] = useState(false);
  const [newlyCreatedKey, setNewlyCreatedKey] = useState<AccessKey | null>(null);

  // Edit permissions state
  const [editPermissionsDialogOpen, setEditPermissionsDialogOpen] = useState(false);
  const [editingKey, setEditingKey] = useState<AccessKey | null>(null);
  const [availableBuckets, setAvailableBuckets] = useState<Bucket[]>([]);
  const [selectedBucket, setSelectedBucket] = useState<string>('');
  const [permissionRead, setPermissionRead] = useState(false);
  const [permissionWrite, setPermissionWrite] = useState(false);
  const [permissionOwner, setPermissionOwner] = useState(false);

  // Key settings state (activation/expiration)
  const [settingsDialogOpen, setSettingsDialogOpen] = useState(false);
  const [settingsKey, setSettingsKey] = useState<AccessKey | null>(null);
  const [keyStatus, setKeyStatus] = useState<'active' | 'inactive'>('active');
  const [expirationDate, setExpirationDate] = useState<string>('');
  const [neverExpires, setNeverExpires] = useState(true);

  // Secret key dialog state
  const [secretKeyDialogOpen, setSecretKeyDialogOpen] = useState(false);
  const [revealedSecretKey, setRevealedSecretKey] = useState<string>('');
  const [isLoadingSecretKey, setIsLoadingSecretKey] = useState(false);

  // Key details dialog state
  const [keyDetailsDialogOpen, setKeyDetailsDialogOpen] = useState(false);
  const [viewingKey, setViewingKey] = useState<AccessKey | null>(null);
  const [detailsSecretKey, setDetailsSecretKey] = useState<string>('');
  const [isLoadingDetailsSecretKey, setIsLoadingDetailsSecretKey] = useState(false);
  const [copiedAccessKeyId, setCopiedAccessKeyId] = useState(false);
  const [copiedSecretKey, setCopiedSecretKey] = useState(false);

  useEffect(() => {
    const fetchKeys = async () => {
      try {
        setIsLoading(true);
        const data = await accessApi.listKeys();
        setKeys(data);
      } catch (error) {
        console.error('Failed to fetch keys:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchKeys();
  }, []);

  const filteredKeys = useMemo(
    () =>
      keys.filter(
        (key) =>
          key.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          key.accessKeyId.toLowerCase().includes(searchQuery.toLowerCase())
      ),
    [keys, searchQuery]
  );

  const handleCreateKey = async () => {
    if (!newKeyName) {
      toast.error('Please enter a key name');
      return;
    }

    try {
      const newKey = await accessApi.createKey(newKeyName);

      // If user wants to grant permissions inline
      if (createGrantPermissions && createSelectedBucket) {
        if (createPermissionRead || createPermissionWrite || createPermissionOwner) {
          try {
            await bucketsApi.grantPermission(createSelectedBucket, newKey.accessKeyId, {
              read: createPermissionRead,
              write: createPermissionWrite,
              owner: createPermissionOwner,
            });
          } catch (error) {
            console.error('Failed to grant permissions:', error);
            // Continue even if permission grant fails - key is already created
          }
        }
      }

      // Store the newly created key to show the secret key
      setNewlyCreatedKey(newKey);

      // Refresh keys list
      const data = await accessApi.listKeys();
      setKeys(data);
      toast.success(`API Key "${newKeyName}" created successfully`);
    } catch (error) {
      // Error toast is handled by API interceptor
      console.error('Create key error:', error);
    }
  };

  const handleCloseCreateDialog = () => {
    setCreateDialogOpen(false);
    setNewKeyName('');
    setCreateSelectedBucket('');
    setCreatePermissionRead(false);
    setCreatePermissionWrite(false);
    setCreatePermissionOwner(false);
    setCreateGrantPermissions(false);
    setNewlyCreatedKey(null);
  };

  const handleOpenCreateDialog = async () => {
    setCreateDialogOpen(true);
    setNewKeyName('');
    setCreateSelectedBucket('');
    setCreatePermissionRead(false);
    setCreatePermissionWrite(false);
    setCreatePermissionOwner(false);
    setCreateGrantPermissions(false);

    // Load available buckets
    try {
      const buckets = await bucketsApi.list();
      setCreateAvailableBuckets(buckets);
    } catch (error) {
      console.error('Failed to load buckets:', error);
    }
  };

  const handleDeleteKey = async () => {
    if (!selectedKey) return;

    try {
      await accessApi.deleteKey(selectedKey.accessKeyId);
      const keyName = selectedKey.name;
      setDeleteDialogOpen(false);
      setSelectedKey(null);

      // Refresh keys list
      const data = await accessApi.listKeys();
      setKeys(data);
      toast.success(`API Key "${keyName}" deleted successfully`);
    } catch (error) {
      // Error toast is handled by API interceptor
      console.error('Delete key error:', error);
    }
  };

  const handleOpenSettings = (key: AccessKey) => {
    setSettingsKey(key);
    setKeyStatus(key.status);
    setSettingsDialogOpen(true);

    // Set expiration date if it exists
    if (key.expiration) {
      const expDate = new Date(key.expiration);
      // Format as YYYY-MM-DDTHH:mm for datetime-local input
      const formattedDate = expDate.toISOString().slice(0, 16);
      setExpirationDate(formattedDate);
      setNeverExpires(false);
    } else {
      setExpirationDate('');
      setNeverExpires(true);
    }
  };

  const handleSaveKeySettings = async () => {
    if (!settingsKey) return;

    try {
      const updates: { status?: string; expiration?: string } = {};

      updates.status = keyStatus;

      if (!neverExpires && expirationDate) {
        updates.expiration = new Date(expirationDate).toISOString();
      } else if (neverExpires) {
        // Clear expiration by setting status to active
        updates.status = 'active';
      }

      await accessApi.updateKey(settingsKey.accessKeyId, updates);

      // Refresh keys list
      const data = await accessApi.listKeys();
      setKeys(data);

      setSettingsDialogOpen(false);
      toast.success(`Key settings updated successfully`);
    } catch (error) {
      // Error toast is handled by API interceptor
      console.error('Update key settings error:', error);
    }
  };

  const handleRevealSecretKey = async (key: AccessKey) => {
    setSelectedKey(key);
    setIsLoadingSecretKey(true);
    setSecretKeyDialogOpen(true);
    setRevealedSecretKey('');

    try {
      const secretKey = await accessApi.getSecretKey(key.accessKeyId);
      setRevealedSecretKey(secretKey);
    } catch (error) {
      console.error('Failed to fetch secret key:', error);
      setSecretKeyDialogOpen(false);
    } finally {
      setIsLoadingSecretKey(false);
    }
  };

  const handleOpenEditPermissions = async (key: AccessKey) => {
    setEditingKey(key);
    setEditPermissionsDialogOpen(true);
    setSelectedBucket('');
    setPermissionRead(false);
    setPermissionWrite(false);
    setPermissionOwner(false);

    // Load available buckets
    try {
      const buckets = await bucketsApi.list();
      setAvailableBuckets(buckets);
    } catch (error) {
      console.error('Failed to load buckets:', error);
    }
  };

  const handleBucketChange = (bucketName: string) => {
    setSelectedBucket(bucketName);

    if (!bucketName || !editingKey) {
      // Reset permissions if no bucket selected
      setPermissionRead(false);
      setPermissionWrite(false);
      setPermissionOwner(false);
      return;
    }

    // Find if this key already has permissions on the selected bucket
    const bucketPermission = editingKey.permissions.find(
      perm => perm.bucketName === bucketName || perm.bucketId === bucketName
    );

    if (bucketPermission) {
      // Set the checkboxes to reflect current permissions
      setPermissionRead(bucketPermission.read);
      setPermissionWrite(bucketPermission.write);
      setPermissionOwner(bucketPermission.owner);
    } else {
      // No permissions set yet, reset checkboxes
      setPermissionRead(false);
      setPermissionWrite(false);
      setPermissionOwner(false);
    }
  };

  const handleGrantBucketPermission = async () => {
    if (!editingKey || !selectedBucket) {
      toast.error('Please select a bucket');
      return;
    }

    if (!permissionRead && !permissionWrite && !permissionOwner) {
      toast.error('Please select at least one permission');
      return;
    }

    try {
      // Call backend API to grant bucket permissions
      await bucketsApi.grantPermission(selectedBucket, editingKey.accessKeyId, {
        read: permissionRead,
        write: permissionWrite,
        owner: permissionOwner,
      });

      toast.success(`Permissions granted on bucket "${selectedBucket}" successfully`);
      setEditPermissionsDialogOpen(false);
      setSelectedBucket('');
      setPermissionRead(false);
      setPermissionWrite(false);
      setPermissionOwner(false);

      // Refresh keys list to update permissions
      const data = await accessApi.listKeys();
      setKeys(data);
    } catch (error) {
      // Error toast is handled by API interceptor
      console.error('Grant permission error:', error);
    }
  };

  // Helper function to format permission flags as a readable string
  const formatPermissions = (perm: BucketPermission): string => {
    const perms = [];
    if (perm.read) perms.push('Read');
    if (perm.write) perms.push('Write');
    if (perm.owner) perms.push('Owner');
    return perms.join(', ') || 'None';
  };

  const handleRowClick = async (key: AccessKey) => {
    setViewingKey(key);
    setKeyDetailsDialogOpen(true);
    setDetailsSecretKey('');
    setIsLoadingDetailsSecretKey(true);
    setCopiedAccessKeyId(false);
    setCopiedSecretKey(false);

    // Fetch the secret key immediately
    try {
      const secretKey = await accessApi.getSecretKey(key.accessKeyId);
      setDetailsSecretKey(secretKey);
    } catch (error) {
      console.error('Failed to fetch secret key:', error);
    } finally {
      setIsLoadingDetailsSecretKey(false);
    }
  };

  return (
    <div>
      <Header
        title="Access Control"
      />
      <div className="p-4 sm:p-6 space-y-4 sm:space-y-6">
        <Tabs defaultValue="keys">
          <TabsContent value="keys" className="space-y-4 sm:space-y-6 mt-4 sm:mt-6">
            {/* Stats */}
            <div className="grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Total Keys</CardTitle>
                  <Key className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{keys.length}</div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Active Keys</CardTitle>
                  <ShieldCheck className="h-4 w-4 text-green-600" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {keys.filter((k) => k.status === 'active').length}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Inactive Keys</CardTitle>
                  <ShieldX className="h-4 w-4 text-red-600" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {keys.filter((k) => k.status === 'inactive').length}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Toolbar */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
              <div className="relative flex-1 max-w-full sm:max-w-xs">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search keys..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-8"
                />
              </div>
              <Button onClick={handleOpenCreateDialog} className="w-full sm:w-auto">
                <Plus className="h-4 w-4" />
                Create Key
              </Button>
            </div>

            {/* Keys Table */}
            <div className="border rounded-lg overflow-visible">
              <div className="overflow-x-auto">
                <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead className="hidden sm:table-cell">Access Key ID</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="hidden md:table-cell">Created</TableHead>
                    <TableHead className="hidden md:table-cell">Permissions</TableHead>
                    <TableHead className="w-[50px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-12">
                        <div className="flex items-center justify-center gap-2 text-muted-foreground">
                          <Loader2 className="h-5 w-5 animate-spin" />
                          <span>Loading API keys...</span>
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : filteredKeys.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-12 text-muted-foreground">
                        {searchQuery ? 'No keys found matching your search' : 'No API keys yet'}
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredKeys.map((key) => (
                      <TableRow
                        key={key.accessKeyId}
                        onClick={() => handleRowClick(key)}
                        className="cursor-pointer hover:bg-muted/50"
                      >
                        <TableCell className="font-medium truncate max-w-[150px]">{key.name}</TableCell>
                        <TableCell className="hidden sm:table-cell">
                          <div className="flex items-center gap-2">
                            <code
                              className="text-xs bg-muted px-2 py-1 rounded truncate max-w-[150px] block cursor-pointer hover:bg-muted/80 transition-colors"
                              onClick={(e) => {
                                e.stopPropagation();
                                navigator.clipboard.writeText(key.accessKeyId);
                                toast.success('Access Key ID copied to clipboard');
                              }}
                            >
                              {key.accessKeyId}
                            </code>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 flex-shrink-0"
                              onClick={(e) => {
                                e.stopPropagation();
                                navigator.clipboard.writeText(key.accessKeyId);
                                toast.success('Access Key ID copied to clipboard');
                              }}
                            >
                              <Copy className="h-3 w-3" />
                            </Button>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant={key.status === 'active' ? 'default' : 'secondary'}>
                            {key.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="hidden md:table-cell">{formatDate(key.createdAt)}</TableCell>
                        <TableCell className="hidden md:table-cell">
                          <div className="flex flex-wrap gap-1">
                            {key.permissions.slice(0, 2).map((perm, idx) => (
                              <Badge key={idx} variant="outline" className="text-xs">
                                {perm.bucketName}: {formatPermissions(perm)}
                              </Badge>
                            ))}
                            {key.permissions.length > 2 && (
                              <Badge variant="outline" className="text-xs">
                                +{key.permissions.length - 2} more
                              </Badge>
                            )}
                            {key.permissions.length === 0 && (
                              <span className="text-xs text-muted-foreground">No permissions</span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <DropdownMenu>
                            <DropdownMenuTrigger>
                              <Button variant="ghost" size="icon">
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => handleRevealSecretKey(key)}>
                                <Key className="h-4 w-4" />
                                View Secret Key
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem onClick={() => handleOpenEditPermissions(key)}>
                                <Edit className="h-4 w-4" />
                                Edit Permissions
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleOpenSettings(key)}>
                                {key.status === 'active' ? (
                                  <>
                                    <ShieldX className="h-4 w-4" />
                                    Manage Status
                                  </>
                                ) : (
                                  <>
                                    <ShieldCheck className="h-4 w-4" />
                                    Manage Status
                                  </>
                                )}
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                className="text-destructive"
                                onClick={() => {
                                  setSelectedKey(key);
                                  setDeleteDialogOpen(true);
                                }}
                              >
                                <Trash2 className="mr-2 h-4 w-4" />
                                Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>

      {/* Create Key Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={handleCloseCreateDialog}>
        <DialogContent className="max-w-2xl">
          {newlyCreatedKey ? (
            // Success state - show the secret key
            <>
              <DialogHeader>
                <DialogTitle>API Key Created Successfully</DialogTitle>
                <DialogDescription>
                  Save your secret access key now. You won't be able to see it again.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Key Name</label>
                  <div className="text-sm text-muted-foreground">{newlyCreatedKey.name}</div>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Access Key ID</label>
                  <div className="flex items-center gap-2">
                    <code
                      className="text-sm bg-muted px-3 py-2 rounded flex-1 cursor-pointer hover:bg-muted/80 transition-colors"
                      onClick={() => {
                        navigator.clipboard.writeText(newlyCreatedKey.accessKeyId);
                        toast.success('Access Key ID copied to clipboard');
                      }}
                    >
                      {newlyCreatedKey.accessKeyId}
                    </code>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        navigator.clipboard.writeText(newlyCreatedKey.accessKeyId);
                        toast.success('Access Key ID copied to clipboard');
                      }}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Secret Access Key</label>
                  <div className="flex items-center gap-2">
                    <code
                      className="text-sm bg-muted px-3 py-2 rounded flex-1 break-all cursor-pointer hover:bg-muted/80 transition-colors"
                      onClick={() => {
                        if (newlyCreatedKey.secretKey) {
                          navigator.clipboard.writeText(newlyCreatedKey.secretKey);
                          toast.success('Secret Access Key copied to clipboard');
                        }
                      }}
                    >
                      {newlyCreatedKey.secretKey}
                    </code>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        if (newlyCreatedKey.secretKey) {
                          navigator.clipboard.writeText(newlyCreatedKey.secretKey);
                          toast.success('Secret Access Key copied to clipboard');
                        }
                      }}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                <div className="border rounded-lg p-4 bg-orange-100 border-orange-300 dark:bg-orange-950/20 dark:border-orange-900">
                  <div className="flex gap-2">
                    <ShieldX className="h-5 w-5 text-orange-700 dark:text-orange-500 flex-shrink-0" />
                    <div className="space-y-1">
                      <p className="text-sm font-medium text-orange-950 dark:text-orange-200">
                        Important: Save This Key Now
                      </p>
                      <p className="text-xs text-orange-900 dark:text-orange-300">
                        This is the only time you'll see the secret access key. Make sure to copy and save it securely.
                        If you lose it, you'll need to create a new key.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button onClick={handleCloseCreateDialog}>
                  Done
                </Button>
              </DialogFooter>
            </>
          ) : (
            // Creation form
            <>
              <DialogHeader>
                <DialogTitle>Create API Key</DialogTitle>
                <DialogDescription>
                  Create a new API key with optional bucket permissions
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Key Name</label>
                  <Input
                    placeholder="My Application Key"
                    value={newKeyName}
                    onChange={(e) => setNewKeyName(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    A friendly name to identify this API key
                  </p>
                </div>

                {/* Optional: Grant permissions during creation */}
                <div className="space-y-3 border-t pt-4">
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <Checkbox
                      id="grant-permissions-on-create"
                      checked={createGrantPermissions}
                      onCheckedChange={(checked) => {
                        setCreateGrantPermissions(checked as boolean);
                        if (!checked) {
                          setCreateSelectedBucket('');
                          setCreatePermissionRead(false);
                          setCreatePermissionWrite(false);
                          setCreatePermissionOwner(false);
                        }
                      }}
                    />
                    <span className="text-sm font-medium">Grant bucket permissions now</span>
                  </label>
                  <p className="text-xs text-muted-foreground">
                    You can also grant permissions later from the Edit Permissions menu
                  </p>

                  {createGrantPermissions && (
                    <div className="space-y-4 pl-6 pt-2">
                      {/* Bucket Selection */}
                      <div className="space-y-2">
                        <label className="text-sm font-medium">Select Bucket</label>
                        <Select
                          value={createSelectedBucket}
                          onChange={(value) => setCreateSelectedBucket(value)}
                        >
                          <SelectOption value="">-- Select a bucket --</SelectOption>
                          {createAvailableBuckets.map((bucket) => (
                            <SelectOption key={bucket.name} value={bucket.name}>
                              {bucket.name}
                            </SelectOption>
                          ))}
                        </Select>
                      </div>

                      {/* Permissions */}
                      {createSelectedBucket && (
                        <div className="space-y-3">
                          <label className="text-sm font-medium">Permissions</label>
                          <div className="space-y-2 border rounded-lg p-3">
                            <label className="flex items-center space-x-2 cursor-pointer">
                              <Checkbox
                                id="create-permission-read"
                                checked={createPermissionRead}
                                onCheckedChange={(checked) => setCreatePermissionRead(checked as boolean)}
                              />
                              <div>
                                <span className="text-sm font-medium">Read</span>
                                <p className="text-xs text-muted-foreground">GetObject, HeadObject, ListObjects</p>
                              </div>
                            </label>

                            <label className="flex items-center space-x-2 cursor-pointer">
                              <Checkbox
                                id="create-permission-write"
                                checked={createPermissionWrite}
                                onCheckedChange={(checked) => setCreatePermissionWrite(checked as boolean)}
                              />
                              <div>
                                <span className="text-sm font-medium">Write</span>
                                <p className="text-xs text-muted-foreground">PutObject, DeleteObject</p>
                              </div>
                            </label>

                            <label className="flex items-center space-x-2 cursor-pointer">
                              <Checkbox
                                id="create-permission-owner"
                                checked={createPermissionOwner}
                                onCheckedChange={(checked) => setCreatePermissionOwner(checked as boolean)}
                              />
                              <div>
                                <span className="text-sm font-medium">Owner</span>
                                <p className="text-xs text-muted-foreground">DeleteBucket, PutBucketPolicy</p>
                              </div>
                            </label>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={handleCloseCreateDialog}>
                  Cancel
                </Button>
                <Button onClick={handleCreateKey} disabled={!newKeyName}>
                  Create Key
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Key Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete API Key</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete "{selectedKey?.name}"? Applications using this key
              will lose access immediately.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDeleteKey}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Secret Key Dialog */}
      <Dialog open={secretKeyDialogOpen} onOpenChange={setSecretKeyDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Secret Access Key</DialogTitle>
            <DialogDescription>
              Copy your secret access key now. For security reasons, it cannot be viewed again.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Key Name</label>
              <div className="text-sm text-muted-foreground">{selectedKey?.name}</div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Access Key ID</label>
              <div className="flex items-center gap-2">
                <code
                  className="text-sm bg-muted px-3 py-2 rounded flex-1 cursor-pointer hover:bg-muted/80 transition-colors"
                  onClick={() => {
                    if (selectedKey?.accessKeyId) {
                      navigator.clipboard.writeText(selectedKey.accessKeyId);
                      toast.success('Access Key ID copied to clipboard');
                    }
                  }}
                >
                  {selectedKey?.accessKeyId}
                </code>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    if (selectedKey?.accessKeyId) {
                      navigator.clipboard.writeText(selectedKey.accessKeyId);
                      toast.success('Access Key ID copied to clipboard');
                    }
                  }}
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Secret Access Key</label>
              <div className="flex items-center gap-2">
                {isLoadingSecretKey ? (
                  <div className="flex items-center gap-2 text-muted-foreground flex-1 bg-muted px-3 py-2 rounded">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span className="text-sm">Loading secret key...</span>
                  </div>
                ) : (
                  <>
                    <code
                      className="text-sm bg-muted px-3 py-2 rounded flex-1 break-all cursor-pointer hover:bg-muted/80 transition-colors"
                      onClick={() => {
                        if (revealedSecretKey) {
                          navigator.clipboard.writeText(revealedSecretKey);
                          toast.success('Secret Access Key copied to clipboard');
                        }
                      }}
                    >
                      {revealedSecretKey}
                    </code>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        if (revealedSecretKey) {
                          navigator.clipboard.writeText(revealedSecretKey);
                          toast.success('Secret Access Key copied to clipboard');
                        }
                      }}
                      disabled={!revealedSecretKey}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </>
                )}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => setSecretKeyDialogOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Key Settings Dialog */}
      <Dialog open={settingsDialogOpen} onOpenChange={setSettingsDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Key Settings - {settingsKey?.name}</DialogTitle>
            <DialogDescription>
              Manage activation status and expiration date for this API key
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-6 py-4">
            {/* Status */}
            <div className="space-y-3">
              <label className="text-sm font-medium">Status</label>
              <div className="flex gap-4">
                <label className="flex items-center space-x-2 cursor-pointer">
                  <input
                    type="radio"
                    name="status"
                    value="active"
                    checked={keyStatus === 'active'}
                    onChange={(e) => setKeyStatus(e.target.value as 'active' | 'inactive')}
                    className="w-4 h-4"
                  />
                  <span className="text-sm">Active</span>
                </label>
                <label className="flex items-center space-x-2 cursor-pointer">
                  <input
                    type="radio"
                    name="status"
                    value="inactive"
                    checked={keyStatus === 'inactive'}
                    onChange={(e) => setKeyStatus(e.target.value as 'active' | 'inactive')}
                    className="w-4 h-4"
                  />
                  <span className="text-sm">Inactive</span>
                </label>
              </div>
              <p className="text-xs text-muted-foreground">
                Inactive keys cannot be used for authentication
              </p>
            </div>

            {/* Expiration */}
            <div className="space-y-3">
              <label className="text-sm font-medium">Expiration</label>
              <div className="space-y-3">
                <label className="flex items-center space-x-2 cursor-pointer">
                  <Checkbox
                    id="never-expires"
                    checked={neverExpires}
                    onCheckedChange={(checked) => setNeverExpires(checked as boolean)}
                  />
                  <span className="text-sm">Never expires</span>
                </label>

                {!neverExpires && (
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Expiration Date & Time</label>
                    <Input
                      type="datetime-local"
                      value={expirationDate}
                      onChange={(e) => setExpirationDate(e.target.value)}
                      className="w-full"
                    />
                    <p className="text-xs text-muted-foreground">
                      Key will automatically become inactive after this date
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSettingsDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveKeySettings}>
              Save Settings
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Key Details Dialog */}
      <Dialog open={keyDetailsDialogOpen} onOpenChange={setKeyDetailsDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>API Key Details</DialogTitle>
            <DialogDescription>
              View and manage your API key credentials and permissions
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {/* Key Name and Status */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Key Name</label>
                <div className="text-sm text-muted-foreground">{viewingKey?.name}</div>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Status</label>
                <div>
                  <Badge variant={viewingKey?.status === 'active' ? 'default' : 'secondary'}>
                    {viewingKey?.status}
                  </Badge>
                </div>
              </div>
            </div>

            {/* Access Key ID */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Access Key ID</label>
              <div className="flex items-center gap-2">
                <code
                  className="text-sm bg-muted px-3 py-2 rounded flex-1 break-all cursor-pointer hover:bg-muted/80 transition-colors"
                  onClick={() => {
                    if (viewingKey?.accessKeyId) {
                      navigator.clipboard.writeText(viewingKey.accessKeyId);
                      setCopiedAccessKeyId(true);
                      setTimeout(() => setCopiedAccessKeyId(false), 2000);
                      toast.success('Access Key ID copied to clipboard');
                    }
                  }}
                >
                  {viewingKey?.accessKeyId}
                </code>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    if (viewingKey?.accessKeyId) {
                      navigator.clipboard.writeText(viewingKey.accessKeyId);
                      setCopiedAccessKeyId(true);
                      setTimeout(() => setCopiedAccessKeyId(false), 2000);
                      toast.success('Access Key ID copied to clipboard');
                    }
                  }}
                >
                  {copiedAccessKeyId ? 'Copied' : <Copy className="h-4 w-4" />}
                </Button>
              </div>
            </div>

            {/* Secret Access Key */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Secret Access Key</label>
              <div className="flex items-center gap-2">
                {isLoadingDetailsSecretKey ? (
                  <div className="flex items-center gap-2 text-muted-foreground flex-1 bg-muted px-3 py-2 rounded">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span className="text-sm">Loading secret key...</span>
                  </div>
                ) : (
                  <>
                    <code
                      className="text-sm bg-muted px-3 py-2 rounded flex-1 break-all cursor-pointer hover:bg-muted/80 transition-colors"
                      onClick={() => {
                        if (detailsSecretKey) {
                          navigator.clipboard.writeText(detailsSecretKey);
                          setCopiedSecretKey(true);
                          setTimeout(() => setCopiedSecretKey(false), 2000);
                          toast.success('Secret Access Key copied to clipboard');
                        }
                      }}
                    >
                      {'•'.repeat(40)}
                    </code>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        if (detailsSecretKey) {
                          navigator.clipboard.writeText(detailsSecretKey);
                          setCopiedSecretKey(true);
                          setTimeout(() => setCopiedSecretKey(false), 2000);
                          toast.success('Secret Access Key copied to clipboard');
                        }
                      }}
                      disabled={!detailsSecretKey}
                    >
                      {copiedSecretKey ? 'Copied' : <Copy className="h-4 w-4" />}
                    </Button>
                  </>
                )}
              </div>
            </div>

            {/* Metadata */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Created</label>
                <div className="text-sm text-muted-foreground">{viewingKey && formatDate(viewingKey.createdAt)}</div>
              </div>
              {viewingKey?.expiration && (
                <div className="space-y-2">
                  <label className="text-sm font-medium">Expiration</label>
                  <div className="text-sm text-muted-foreground">{formatDate(viewingKey.expiration)}</div>
                </div>
              )}
            </div>

            {/* Bucket Permissions */}
            <div className="space-y-3">
              <label className="text-sm font-medium">Bucket Permissions</label>
              {viewingKey && viewingKey.permissions.length > 0 ? (
                <div className="border rounded-lg divide-y">
                  {viewingKey.permissions.map((perm, idx) => (
                    <div key={idx} className="p-3 flex items-center justify-between">
                      <div className="space-y-1">
                        <div className="text-sm font-medium">{perm.bucketName}</div>
                        <div className="text-xs text-muted-foreground">
                          {formatPermissions(perm)}
                        </div>
                      </div>
                      <div className="flex gap-1">
                        {perm.read && (
                          <Badge variant="outline" className="text-xs">
                            Read
                          </Badge>
                        )}
                        {perm.write && (
                          <Badge variant="outline" className="text-xs">
                            Write
                          </Badge>
                        )}
                        {perm.owner && (
                          <Badge variant="outline" className="text-xs">
                            Owner
                          </Badge>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="border rounded-lg p-6 text-center">
                  <p className="text-sm text-muted-foreground">
                    This key has no bucket permissions yet
                  </p>
                </div>
              )}
            </div>
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setKeyDetailsDialogOpen(false);
                if (viewingKey) {
                  handleOpenEditPermissions(viewingKey);
                }
              }}
              className="w-full sm:w-auto"
            >
              <Edit className="h-4 w-4" />
              Edit Permissions
            </Button>
            <Button
              onClick={() => setKeyDetailsDialogOpen(false)}
              className="w-full sm:w-auto"
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Permissions Dialog */}
      <Dialog open={editPermissionsDialogOpen} onOpenChange={setEditPermissionsDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit Bucket Permissions - {editingKey?.name}</DialogTitle>
            <DialogDescription>
              Grant this access key permissions on buckets
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-6 py-4">
            {/* Bucket Selection */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Select Bucket</label>
              <Select
                value={selectedBucket}
                onChange={(value) => handleBucketChange(value)}
              >
                <SelectOption value="">-- Select a bucket --</SelectOption>
                {availableBuckets.map((bucket) => (
                  <SelectOption key={bucket.name} value={bucket.name}>
                    {bucket.name}
                  </SelectOption>
                ))}
              </Select>
              <p className="text-xs text-muted-foreground">
                Choose which bucket this key should have permissions on. Current permissions will be displayed when selected.
              </p>
            </div>

            {/* Permissions */}
            <div className="space-y-3">
              <label className="text-sm font-medium">Permissions</label>
              <div className="space-y-3 border rounded-lg p-4">
                <div className="flex items-start space-x-3">
                  <Checkbox
                    id="edit-permission-read"
                    checked={permissionRead}
                    onCheckedChange={(checked) => setPermissionRead(checked as boolean)}
                  />
                  <div className="flex-1">
                    <label
                      htmlFor="edit-permission-read"
                      className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
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
                    id="edit-permission-write"
                    checked={permissionWrite}
                    onCheckedChange={(checked) => setPermissionWrite(checked as boolean)}
                  />
                  <div className="flex-1">
                    <label
                      htmlFor="edit-permission-write"
                      className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
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
                    id="edit-permission-owner"
                    checked={permissionOwner}
                    onCheckedChange={(checked) => setPermissionOwner(checked as boolean)}
                  />
                  <div className="flex-1">
                    <label
                      htmlFor="edit-permission-owner"
                      className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
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

            {/* Current Permissions Info */}
            {selectedBucket && editingKey && (
              <div className="space-y-2">
                <label className="text-sm font-medium">Current Status</label>
                <div className="border rounded-lg p-4 bg-muted/50">
                  {(() => {
                    const bucketPermission = editingKey.permissions.find(
                      perm => perm.bucketName === selectedBucket || perm.bucketId === selectedBucket
                    );

                    if (bucketPermission) {
                      const hasPermissions = bucketPermission.read || bucketPermission.write || bucketPermission.owner;
                      if (hasPermissions) {
                        return (
                          <div className="space-y-2">
                            <p className="text-sm font-medium text-foreground">
                              This key currently has the following permissions on this bucket:
                            </p>
                            <div className="flex flex-wrap gap-2">
                              {bucketPermission.read && (
                                <Badge variant="secondary">Read</Badge>
                              )}
                              {bucketPermission.write && (
                                <Badge variant="secondary">Write</Badge>
                              )}
                              {bucketPermission.owner && (
                                <Badge variant="secondary">Owner</Badge>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground mt-2">
                              Modify the checkboxes above to update permissions
                            </p>
                          </div>
                        );
                      }
                    }
                    return (
                      <p className="text-sm text-muted-foreground">
                        This key has no permissions on this bucket yet. Select permissions above to grant access.
                      </p>
                    );
                  })()}
                </div>
              </div>
            )}

            {/* Current Bucket Permissions List */}
            {editingKey && editingKey.permissions.length > 0 && (
              <div className="space-y-2">
                <label className="text-sm font-medium">Current Bucket Permissions</label>
                <div className="border rounded-lg p-4 max-h-48 overflow-y-auto">
                  <div className="space-y-2">
                    {editingKey.permissions.map((perm, idx) => (
                      <div key={idx} className="flex items-center justify-between text-sm p-2 bg-muted/30 rounded">
                        <span className="font-medium">{perm.bucketName}</span>
                        <div className="flex gap-1">
                          {perm.read && <Badge variant="outline" className="text-xs">R</Badge>}
                          {perm.write && <Badge variant="outline" className="text-xs">W</Badge>}
                          {perm.owner && <Badge variant="outline" className="text-xs">O</Badge>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditPermissionsDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleGrantBucketPermission}
              disabled={!selectedBucket}
            >
              Grant Permission
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
