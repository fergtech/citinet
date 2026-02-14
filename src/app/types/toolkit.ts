// Toolkit Types

export type ToolCategory = 
  | 'Web Browsing'
  | 'Search'
  | 'Messaging'
  | 'Storage'
  | 'Productivity'
  | 'Creative Tools'
  | 'Developer Tools'
  | 'Open Hardware';

export type ToolTag = 
  | 'open-source'
  | 'privacy-focused'
  | 'decentralized'
  | 'encrypted'
  | 'community-owned'
  | 'self-hostable'
  | 'cross-platform'
  | 'mobile'
  | 'desktop'
  | 'web'
  | 'peer-to-peer';

export interface Tool {
  id: string;
  slug: string;
  name: string;
  categories: ToolCategory[];
  shortDescription: string;
  tags: ToolTag[];
  websiteUrl: string;
  icon?: string;
  recommendedScore?: number;
  status: 'active' | 'deprecated';
  createdAt: string;
  updatedAt: string;
}

export type SubmissionStatus = 'pending' | 'approved' | 'rejected';

export interface ToolSubmission {
  id: string;
  name: string;
  websiteUrl: string;
  categories: ToolCategory[];
  shortDescription: string;
  tags: ToolTag[];
  rationale?: string;
  status: SubmissionStatus;
  submittedBy: string;
  submittedByName: string;
  createdAt: string;
  updatedAt: string;
  reviewerNotes?: string;
  reviewedBy?: string;
  reviewedAt?: string;
}
