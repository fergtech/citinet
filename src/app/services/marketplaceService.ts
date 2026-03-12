import { hubService } from './hubService';
import type { HubVendor, HubListing } from '../types/hub';

export interface MarketplaceBannerConfig {
  marketplace_banner_image?: string;    // MinIO filename
  marketplace_banner_position?: string; // '0'–'100', vertical objectPosition %
  marketplace_banner_title?: string;
  marketplace_banner_subtitle?: string;
}

class MarketplaceService {
  private getAuth(hubSlug: string) {
    const conn = hubService.getHubConnection(hubSlug);
    if (!conn) throw new Error('Not connected to hub');
    return { baseUrl: conn.hub.tunnelUrl, token: (conn as any).user?.authToken };
  }

  private async request<T>(hubSlug: string, path: string, options: RequestInit = {}): Promise<T> {
    const { baseUrl, token } = this.getAuth(hubSlug);
    const res = await fetch(`${baseUrl}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options.headers ?? {}),
      },
    });
    if (res.status === 204) return undefined as T;
    const data = await res.json().catch(() => ({ error: res.statusText }));
    if (!res.ok) {
      const err = new Error(data.error ?? res.statusText) as any;
      err.status = res.status;
      throw err;
    }
    return data;
  }

  getListingImageUrl(hubSlug: string, fileName: string): string | null {
    return hubService.getPublicFileUrl(hubSlug, fileName);
  }

  getVendorLogoUrl(hubSlug: string, fileName: string): string | null {
    return hubService.getPublicFileUrl(hubSlug, fileName);
  }

  getVendorBannerUrl(hubSlug: string, fileName: string): string | null {
    return hubService.getPublicFileUrl(hubSlug, fileName);
  }

  async getListings(hubSlug: string, category?: string): Promise<HubListing[]> {
    const params = category && category !== 'All'
      ? `?category=${encodeURIComponent(category)}`
      : '';
    return this.request(hubSlug, `/api/marketplace/listings${params}`);
  }

  async getMyVendor(hubSlug: string): Promise<HubVendor | null> {
    try {
      return await this.request<HubVendor>(hubSlug, '/api/vendors/me');
    } catch (err: any) {
      if (err.status === 404) return null;
      throw err;
    }
  }

  async getVendor(hubSlug: string, vendorId: string): Promise<{ vendor: HubVendor; listings: HubListing[] }> {
    return this.request(hubSlug, `/api/vendors/${vendorId}`);
  }

  async createVendor(hubSlug: string, data: Partial<HubVendor>): Promise<HubVendor> {
    return this.request(hubSlug, '/api/vendors', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateVendor(hubSlug: string, data: Partial<HubVendor>): Promise<HubVendor> {
    return this.request(hubSlug, '/api/vendors/me', {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async createListing(hubSlug: string, data: Partial<HubListing> & { title: string }): Promise<HubListing> {
    return this.request(hubSlug, '/api/marketplace/listings', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateListing(hubSlug: string, listingId: string, data: Partial<HubListing>): Promise<HubListing> {
    return this.request(hubSlug, `/api/marketplace/listings/${listingId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async deleteListing(hubSlug: string, listingId: string): Promise<void> {
    return this.request(hubSlug, `/api/marketplace/listings/${listingId}`, {
      method: 'DELETE',
    });
  }

  async getBannerConfig(hubSlug: string): Promise<MarketplaceBannerConfig> {
    try {
      return await this.request<MarketplaceBannerConfig>(hubSlug, '/api/marketplace-config');
    } catch {
      return {};
    }
  }

  async updateBannerConfig(hubSlug: string, config: Partial<MarketplaceBannerConfig>): Promise<void> {
    await this.request(hubSlug, '/api/marketplace-config', {
      method: 'PATCH',
      body: JSON.stringify(config),
    });
  }
}

export const marketplaceService = new MarketplaceService();
