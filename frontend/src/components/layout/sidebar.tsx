import {Link, useLocation} from 'react-router-dom';
import {cn} from '@/lib/utils';
import {Database, Key, LayoutDashboard, LogOut, Server, User} from 'lucide-react';
import {useAuthStore} from '@/store/auth-store';
import {Button} from '@/components/ui/button';
import { useQuery } from '@tanstack/react-query';
import { healthApi, garageApi } from '@/lib/api';

interface NavItem {
  title: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
}

const navItems: NavItem[] = [
  {
    title: 'Dashboard',
    href: '/',
    icon: LayoutDashboard,
  },
  {
    title: 'Buckets',
    href: '/buckets',
    icon: Database,
  },
  {
    title: 'Cluster',
    href: '/cluster',
    icon: Server,
  },
  {
    title: 'Access Control',
    href: '/access',
    icon: Key,
  },
];

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

export function Sidebar({ isOpen, onClose }: SidebarProps) {
  const location = useLocation();
  const { user, config, logout } = useAuthStore();

  const handleLogout = () => {
    logout();
  };

  const { data: uiVersion } = useQuery({
    queryKey: ['ui-version'],
    queryFn: healthApi.getVersion,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  const { data: nodeInfo } = useQuery({
    queryKey: ['garage-version'],
    queryFn: () => garageApi.getNodeInfo('self'),
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  const garageVersion = nodeInfo
    ? Object.values(nodeInfo.success)[0]?.garageVersion
    : undefined;

  return (
    <div
      className={cn(
        'flex h-full w-64 flex-col border-r transition-transform duration-300 ease-in-out md:translate-x-0',
        'fixed md:static z-50',
        isOpen ? 'translate-x-0' : '-translate-x-full'
      )}
      style={{ backgroundColor: 'var(--background)' }}
    >
      <div className="flex h-16 items-center border-b px-6">
        <img src="/garage.png" alt="Garage UI Logo" className="h-8 w-8 mr-2" />
        <span className="text-lg font-semibold">Garage UI</span>
      </div>
      <nav className="flex-1 space-y-1 p-4">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = location.pathname === item.href;

          return (
            <Link
              key={item.href}
              to={item.href}
              onClick={onClose}
              className={cn(
                'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-primary shadow-sm'
                  : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
              )}
              style={isActive ? { backgroundColor: 'var(--primary)', color: '#000000' } : undefined}
            >
              <Icon className="h-5 w-5" />
              {item.title}
            </Link>
          );
        })}
      </nav>
      {config && (config.admin.enabled || config.oidc.enabled) && user && (
        <div className="border-t p-4 space-y-2">
          <div className="flex items-center gap-3 rounded-lg bg-muted px-3 py-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-semibold">
              <User className="h-4 w-4" />
            </div>
            <div className="flex-1 overflow-hidden">
              <p className="text-sm font-medium truncate">{user.name || user.username}</p>
              {user.email && (
                <p className="text-xs text-muted-foreground truncate">{user.email}</p>
              )}
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="w-full justify-start"
            onClick={handleLogout}
          >
            <LogOut className="mr-2 h-4 w-4" />
            Logout
          </Button>
        </div>
      )}
      {(uiVersion || garageVersion) && (
        <div className="px-4 pb-3 text-xs text-muted-foreground text-center">
          {uiVersion && `UI ${uiVersion}`}
          {uiVersion && garageVersion && ' | '}
          {garageVersion && `Garage ${garageVersion}`}
        </div>
      )}
    </div>
  );
}
