/**
 * Hub Context for Citinet
 * 
 * Provides the current hub connection and user data to all components.
 * Handles periodic health checks and status updates.
 */

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import type { Hub, HubConnectionStatus, HubUser } from '../types/hub';
import { hubService } from '../services/hubService';
import { registryService } from '../services/registryService';
import { getSubdomain, navigateToHub, clearSubdomainCache } from '../utils/subdomain';

interface HubContextValue {
  /** Current hub connection (null if not connected to any hub) */
  currentHub: Hub | null;
  /** Current user data for the active hub */
  currentUser: HubUser | null;
  /** All hubs the user has joined */
  joinedHubs: Hub[];
  /** Whether hub data is loading */
  loading: boolean;
  /** Switch to a different hub */
  switchHub: (slug: string) => void;
  /** Refresh the current hub's connection status */
  refreshStatus: () => Promise<void>;
  /** Leave/disconnect from a hub */
  leaveHub: (slug: string) => void;
  /** Update the hub context after onboarding completion */
  onOnboardingComplete: (hubSlug: string, userData: HubUser) => void;
  /** Update after joining a new hub */
  onHubJoined: (hub: Hub) => void;
  /** Update the tunnel URL when it rotates */
  updateTunnelUrl: (newUrl: string, skipProbe?: boolean) => Promise<{ ok: boolean; error?: string }>;
  /** Update the current user's local profile */
  updateUserProfile: (updates: Partial<Pick<HubUser, 'displayName' | 'email' | 'location' | 'tags'>>) => HubUser | null;
  /** Update the hub's location and geocoded coordinates (server + localStorage) */
  updateLocation: (location: string, lat: number, lng: number) => Promise<Hub | null>;
  /** Update the hub's description (server + localStorage) */
  updateDescription: (description: string) => Promise<Hub | null>;
}

const HubContext = createContext<HubContextValue | null>(null);

export function HubProvider({ children }: { children: ReactNode }) {
  const [currentHub, setCurrentHub] = useState<Hub | null>(null);
  const [currentUser, setCurrentUser] = useState<HubUser | null>(null);
  const [joinedHubs, setJoinedHubs] = useState<Hub[]>([]);
  const [loading, setLoading] = useState(true);

  // Initialize: load hub data from the subdomain (hub mode) or skip (onboarding mode)
  useEffect(() => {
    hubService.migrateLegacyData();

    const slug = getSubdomain();
    if (slug) {
      // Bootstrap localStorage from URL param when navigating between hubs
      // (localStorage is origin-scoped — start and hub subdomains can't share it directly)
      const params = new URLSearchParams(window.location.search);
      const encoded = params.get('_cc');
      if (encoded) {
        try {
          const conn = JSON.parse(atob(encoded));
          const hubs = hubService.getAllHubConnections();
          hubs[slug] = conn;
          localStorage.setItem('citinet-hubs', JSON.stringify(hubs));
          hubService.setActiveHub(slug);
        } catch {
          // ignore malformed param
        }
        // Clean the param from the URL without reloading
        params.delete('_cc');
        const clean = window.location.pathname + (params.toString() ? '?' + params.toString() : '');
        window.history.replaceState({}, '', clean);
      }

      // Hub mode (e.g. ?hub=riverdale or subdomain) — load connection by subdomain slug
      const connection = hubService.getHubConnection(slug);
      if (connection) {
        setCurrentHub(connection.hub);
        setCurrentUser(connection.user);
      }

      // Refresh tunnel URL from registry in the background.
      // Quick tunnels rotate on restart — registry always has the current URL.
      registryService.getHubBySlug(slug).then(registryHub => {
        if (!registryHub?.tunnel_url) return;
        const stored = hubService.getHubConnection(slug);
        if (stored && stored.hub.tunnelUrl !== registryHub.tunnel_url) {
          hubService.updateTunnelUrl(slug, registryHub.tunnel_url, true).then(updatedHub => {
            setCurrentHub(updatedHub);
          }).catch(() => {});
        }
      });
    }
    // On onboarding screen, no hub context is needed — onboarding handles hub selection
    setJoinedHubs(hubService.getJoinedHubs());
    setLoading(false);
  }, []);

  // Periodic health check for active hub (every 60 seconds)
  useEffect(() => {
    if (!currentHub?.slug || !currentHub.tunnelUrl) return;

    const checkHealth = async () => {
      try {
        await hubService.refreshHubStatus(currentHub.slug);
        // Re-read from storage — slug may have been re-keyed
        const activeConn = hubService.getActiveHubConnection();
        if (activeConn) {
          setCurrentHub(activeConn.hub);
          setCurrentUser(activeConn.user);
        }
      } catch {
        // Silent fail — don't break the UI
      }
    };

    // Initial check after 5 seconds
    const initialTimeout = setTimeout(checkHealth, 5000);
    // Then every 60 seconds
    const interval = setInterval(checkHealth, 60000);

    return () => {
      clearTimeout(initialTimeout);
      clearInterval(interval);
    };
  }, [currentHub?.slug, currentHub?.tunnelUrl]);

  const switchHub = useCallback((slug: string) => {
    if (getSubdomain()) {
      // In hub mode, switching hubs = navigating to their subdomain
      navigateToHub(slug);
      return;
    }
    const connection = hubService.getHubConnection(slug);
    if (connection) {
      hubService.setActiveHub(slug);
      setCurrentHub(connection.hub);
      setCurrentUser(connection.user);
    }
  }, []);

  const refreshStatus = useCallback(async () => {
    if (!currentHub?.slug) return;
    await hubService.refreshHubStatus(currentHub.slug);
    const refreshed = hubService.getHubConnection(currentHub.slug);
    if (refreshed) {
      setCurrentHub(refreshed.hub);
    }
  }, [currentHub?.slug]);

  const leaveHub = useCallback((slug: string) => {
    hubService.leaveHub(slug);
    clearSubdomainCache();
    setJoinedHubs(hubService.getJoinedHubs());
    
    if (currentHub?.slug === slug) {
      const activeConnection = hubService.getActiveHubConnection();
      setCurrentHub(activeConnection?.hub || null);
      setCurrentUser(activeConnection?.user || null);
    }
  }, [currentHub?.slug]);

  const onOnboardingComplete = useCallback((hubSlug: string, userData: HubUser) => {
    // Update context immediately
    const connection = hubService.getHubConnection(hubSlug);
    if (connection) {
      setCurrentHub(connection.hub);
      setCurrentUser(userData);
    }
    setJoinedHubs(hubService.getJoinedHubs());
  }, []);

  const onHubJoined = useCallback((hub: Hub) => {
    setCurrentHub(hub);
    // Also load user data from storage (registerUser/loginUser already saved it)
    const connection = hubService.getHubConnection(hub.slug);
    if (connection?.user?.username) {
      setCurrentUser(connection.user);
    }
    setJoinedHubs(hubService.getJoinedHubs());
  }, []);

  const updateUserProfile = useCallback((
    updates: Partial<Pick<HubUser, 'displayName' | 'email' | 'location' | 'tags'>>
  ): HubUser | null => {
    if (!currentHub?.slug) return null;
    try {
      const updatedUser = hubService.updateUserProfile(currentHub.slug, updates);
      setCurrentUser(updatedUser);
      return updatedUser;
    } catch {
      return null;
    }
  }, [currentHub?.slug]);

  const updateLocation = useCallback(async (location: string, lat: number, lng: number): Promise<Hub | null> => {
    if (!currentHub?.slug) return null;
    try {
      const updatedHub = await hubService.updateHubInfo(currentHub.slug, { location, lat, lng });
      setCurrentHub(updatedHub);
      return updatedHub;
    } catch {
      return null;
    }
  }, [currentHub?.slug]);

  const updateDescription = useCallback(async (description: string): Promise<Hub | null> => {
    if (!currentHub?.slug) return null;
    try {
      const updatedHub = await hubService.updateHubInfo(currentHub.slug, { description });
      setCurrentHub(updatedHub);
      return updatedHub;
    } catch {
      return null;
    }
  }, [currentHub?.slug]);

  const updateTunnelUrl = useCallback(async (newUrl: string, skipProbe = false): Promise<{ ok: boolean; error?: string }> => {
    if (!currentHub?.slug) return { ok: false, error: 'No active hub' };
    try {
      const updatedHub = await hubService.updateTunnelUrl(currentHub.slug, newUrl, skipProbe);
      setCurrentHub(updatedHub);
      setJoinedHubs(hubService.getJoinedHubs());
      return { ok: true };
    } catch (err) {
      // Even on probe failure, the URL was saved — reload hub state
      const refreshed = hubService.getHubConnection(currentHub.slug);
      if (refreshed) setCurrentHub(refreshed.hub);
      const msg = err instanceof Error ? err.message : 'Could not reach hub at that URL';
      return { ok: false, error: msg };
    }
  }, [currentHub?.slug]);

  return (
    <HubContext.Provider value={{
      currentHub,
      currentUser,
      joinedHubs,
      loading,
      switchHub,
      refreshStatus,
      leaveHub,
      onOnboardingComplete,
      onHubJoined,
      updateTunnelUrl,
      updateUserProfile,
      updateLocation,
      updateDescription,
    }}>
      {children}
    </HubContext.Provider>
  );
}

export function useHub(): HubContextValue {
  const context = useContext(HubContext);
  if (!context) {
    throw new Error('useHub must be used within a HubProvider');
  }
  return context;
}

/** Helper hook to get connection status display info */
export function useHubStatus(): {
  status: HubConnectionStatus;
  label: string;
  color: string;
  dotColor: string;
} {
  const { currentHub } = useHub();
  const status = currentHub?.connectionStatus || 'disconnected';
  
  const statusMap: Record<HubConnectionStatus, { label: string; color: string; dotColor: string }> = {
    connected: { label: 'Connected', color: 'text-green-600 dark:text-green-400', dotColor: 'bg-green-500' },
    connecting: { label: 'Connecting...', color: 'text-yellow-600 dark:text-yellow-400', dotColor: 'bg-yellow-500' },
    disconnected: { label: 'Local Only', color: 'text-slate-600 dark:text-slate-400', dotColor: 'bg-slate-400' },
    unreachable: { label: 'Hub Unreachable', color: 'text-orange-600 dark:text-orange-400', dotColor: 'bg-orange-500' },
  };

  return { status, ...statusMap[status] };
}
