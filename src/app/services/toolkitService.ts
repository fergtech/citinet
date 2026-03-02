import { Tool, ToolSubmission, ToolCategory, ToolTag } from '../types/toolkit';
import { seedTools } from '../data/toolkitData';

const STORAGE_KEYS = {
  SUBMISSIONS: 'citinet-toolkit-submissions',
  APPROVED_TOOLS: 'citinet-toolkit-approved',
  USER_SUBMISSIONS: 'citinet-toolkit-user-submissions',
  CATEGORIES: 'citinet-toolkit-categories',
};

export const BUILTIN_CATEGORIES: ToolCategory[] = [
  'Web Browsing',
  'Search',
  'Messaging',
  'Storage',
  'Productivity',
  'Creative Tools',
  'Developer Tools',
  'Open Hardware',
];

/**
 * Toolkit Service
 * 
 * This service provides a data access layer for toolkit operations.
 * Currently uses localStorage for persistence (mock backend).
 * Can be easily replaced with real API calls later.
 */

class ToolkitService {
  /**
   * Get all active tools (seed + approved submissions)
   */
  getAllTools(): Tool[] {
    const approvedTools = this.getApprovedTools();
    return [...seedTools, ...approvedTools];
  }

  /**
   * Get tools by category
   */
  getToolsByCategory(category: ToolCategory): Tool[] {
    return this.getAllTools().filter(tool => 
      tool.categories.includes(category)
    );
  }

  /**
   * Search tools by name or description
   */
  searchTools(query: string): Tool[] {
    const lowerQuery = query.toLowerCase();
    return this.getAllTools().filter(tool => 
      tool.name.toLowerCase().includes(lowerQuery) ||
      tool.shortDescription.toLowerCase().includes(lowerQuery) ||
      tool.tags.some(tag => tag.toLowerCase().includes(lowerQuery))
    );
  }

  /**
   * Filter tools by tags
   */
  filterToolsByTags(tags: ToolTag[]): Tool[] {
    if (tags.length === 0) return this.getAllTools();
    
    return this.getAllTools().filter(tool =>
      tags.some(tag => tool.tags.includes(tag))
    );
  }

  /**
   * Get tool by ID
   */
  getToolById(id: string): Tool | undefined {
    return this.getAllTools().find(tool => tool.id === id);
  }

  /**
   * Submit a new tool
   */
  submitTool(submission: Omit<ToolSubmission, 'id' | 'status' | 'createdAt' | 'updatedAt'>): ToolSubmission {
    const newSubmission: ToolSubmission = {
      ...submission,
      id: this.generateId(),
      status: 'pending',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // Save to submissions list
    const submissions = this.getAllSubmissions();
    submissions.push(newSubmission);
    this.saveSubmissions(submissions);

    // Track user's submissions
    this.trackUserSubmission(newSubmission.id, submission.submittedBy);

    return newSubmission;
  }

  /**
   * Get all submissions (for moderation)
   */
  getAllSubmissions(): ToolSubmission[] {
    const stored = localStorage.getItem(STORAGE_KEYS.SUBMISSIONS);
    return stored ? JSON.parse(stored) : [];
  }

  /**
   * Get pending submissions
   */
  getPendingSubmissions(): ToolSubmission[] {
    return this.getAllSubmissions().filter(s => s.status === 'pending');
  }

  /**
   * Get submissions by user
   */
  getUserSubmissions(userId: string): ToolSubmission[] {
    const userSubmissionIds = this.getUserSubmissionIds(userId);
    const allSubmissions = this.getAllSubmissions();
    
    return allSubmissions.filter(s => userSubmissionIds.includes(s.id));
  }

  /**
   * Approve a submission (converts to tool)
   */
  approveSubmission(
    submissionId: string, 
    reviewerId: string,
    _reviewerName: string,
    edits?: Partial<Pick<ToolSubmission, 'name' | 'shortDescription' | 'categories' | 'tags' | 'websiteUrl'>>
  ): Tool {
    const submissions = this.getAllSubmissions();
    const submission = submissions.find(s => s.id === submissionId);
    
    if (!submission) {
      throw new Error('Submission not found');
    }

    // Update submission status
    submission.status = 'approved';
    submission.reviewedBy = reviewerId;
    submission.reviewedAt = new Date().toISOString();
    submission.updatedAt = new Date().toISOString();

    // Apply edits if provided
    if (edits) {
      Object.assign(submission, edits);
    }

    this.saveSubmissions(submissions);

    // Convert to tool
    const newTool: Tool = {
      id: submission.id,
      slug: this.slugify(submission.name),
      name: submission.name,
      categories: submission.categories,
      shortDescription: submission.shortDescription,
      tags: submission.tags,
      websiteUrl: submission.websiteUrl,
      status: 'active',
      createdAt: submission.createdAt,
      updatedAt: new Date().toISOString(),
    };

    // Save to approved tools
    const approvedTools = this.getApprovedTools();
    approvedTools.push(newTool);
    this.saveApprovedTools(approvedTools);

    return newTool;
  }

  /**
   * Reject a submission
   */
  rejectSubmission(
    submissionId: string,
    reviewerId: string,
    _reviewerName: string,
    notes?: string
  ): void {
    const submissions = this.getAllSubmissions();
    const submission = submissions.find(s => s.id === submissionId);
    
    if (!submission) {
      throw new Error('Submission not found');
    }

    submission.status = 'rejected';
    submission.reviewedBy = reviewerId;
    submission.reviewedAt = new Date().toISOString();
    submission.reviewerNotes = notes;
    submission.updatedAt = new Date().toISOString();

    this.saveSubmissions(submissions);
  }

  // ── Category management ──────────────────────────────────────

  /** Returns all categories: built-ins first, then admin-created custom ones */
  getCategories(): ToolCategory[] {
    const custom: ToolCategory[] = JSON.parse(localStorage.getItem(STORAGE_KEYS.CATEGORIES) || '[]');
    return [...BUILTIN_CATEGORIES, ...custom];
  }

  /** Admin: add a new custom category. Silently ignores duplicates (case-insensitive). */
  addCategory(name: string): void {
    const trimmed = name.trim();
    if (!trimmed) return;
    const all = this.getCategories();
    if (all.some((c) => c.toLowerCase() === trimmed.toLowerCase())) return;
    const custom: ToolCategory[] = JSON.parse(localStorage.getItem(STORAGE_KEYS.CATEGORIES) || '[]');
    custom.push(trimmed);
    localStorage.setItem(STORAGE_KEYS.CATEGORIES, JSON.stringify(custom));
  }

  /** Admin: remove a custom category. Built-in categories cannot be removed. */
  removeCategory(name: string): void {
    const custom: ToolCategory[] = JSON.parse(localStorage.getItem(STORAGE_KEYS.CATEGORIES) || '[]');
    const updated = custom.filter((c) => c.toLowerCase() !== name.trim().toLowerCase());
    localStorage.setItem(STORAGE_KEYS.CATEGORIES, JSON.stringify(updated));
  }

  // Private helper methods

  private getApprovedTools(): Tool[] {
    const stored = localStorage.getItem(STORAGE_KEYS.APPROVED_TOOLS);
    return stored ? JSON.parse(stored) : [];
  }

  private saveApprovedTools(tools: Tool[]): void {
    localStorage.setItem(STORAGE_KEYS.APPROVED_TOOLS, JSON.stringify(tools));
  }

  private saveSubmissions(submissions: ToolSubmission[]): void {
    localStorage.setItem(STORAGE_KEYS.SUBMISSIONS, JSON.stringify(submissions));
  }

  private trackUserSubmission(submissionId: string, userId: string): void {
    const userSubmissions = this.getUserSubmissionIds(userId);
    userSubmissions.push(submissionId);
    
    const allUserSubmissions = this.getAllUserSubmissions();
    allUserSubmissions[userId] = userSubmissions;
    
    localStorage.setItem(STORAGE_KEYS.USER_SUBMISSIONS, JSON.stringify(allUserSubmissions));
  }

  private getUserSubmissionIds(userId: string): string[] {
    const allUserSubmissions = this.getAllUserSubmissions();
    return allUserSubmissions[userId] || [];
  }

  private getAllUserSubmissions(): Record<string, string[]> {
    const stored = localStorage.getItem(STORAGE_KEYS.USER_SUBMISSIONS);
    return stored ? JSON.parse(stored) : {};
  }

  private generateId(): string {
    return `tool_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private slugify(text: string): string {
    return text
      .toLowerCase()
      .replace(/[^\w\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/--+/g, '-')
      .trim();
  }
}

// Export singleton instance
export const toolkitService = new ToolkitService();
