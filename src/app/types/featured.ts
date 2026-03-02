export interface FeaturedItem {
  id: string;
  type: 'post' | 'custom';
  /** ID of the referenced hub post (post-type items only) */
  refId?: string;
  title: string;
  caption?: string;
  categoryLabel?: string;
  /** External image URL (custom-type cards) */
  imageUrl?: string;
  /** MinIO filename resolved from the post's media_file_id */
  mediaFileName?: string;
  /** Resolved from mediaFileName extension or imageUrl presence */
  mediaType: 'image' | 'video' | 'gradient';
  displayOrder: number;
  createdAt: string;
  authorUsername?: string;
}
