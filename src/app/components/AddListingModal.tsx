import { useState, useRef } from 'react';
import { X, Plus, Loader2, Image, Tag } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { marketplaceService } from '../services/marketplaceService';
import { hubService } from '../services/hubService';
import type { HubListing } from '../types/hub';

const LISTING_CATEGORIES = ['Goods', 'Services', 'Food', 'Electronics', 'Events', 'Arts & Crafts', 'Other'];
const PRICE_TYPES = [
  { value: 'fixed', label: 'Fixed price' },
  { value: 'negotiable', label: 'Negotiable' },
  { value: 'free', label: 'Free / Give away' },
  { value: 'hourly', label: 'Per hour' },
  { value: 'contact', label: 'Contact for price' },
];
const CONDITIONS = ['New', 'Like New', 'Used', 'Fair'];

interface AddListingModalProps {
  isOpen: boolean;
  hubSlug: string;
  onClose: () => void;
  onCreated: (listing: HubListing) => void;
  existingListing?: HubListing;
}

export function AddListingModal({ isOpen, hubSlug, onClose, onCreated, existingListing }: AddListingModalProps) {
  const isEdit = !!existingListing;
  const [title, setTitle] = useState(existingListing?.title ?? '');
  const [description, setDescription] = useState(existingListing?.description ?? '');
  const [category, setCategory] = useState(existingListing?.category ?? 'Goods');
  const [priceType, setPriceType] = useState<HubListing['price_type']>(existingListing?.price_type ?? 'fixed');
  const [price, setPrice] = useState(existingListing?.price != null ? String(existingListing.price) : '');
  const [condition, setCondition] = useState(existingListing?.condition ?? '');
  const [imageFileName, setImageFileName] = useState<string | null>(existingListing?.image_file_name ?? null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isService = category === 'Services' || category === 'Events';
  const showPrice = priceType !== 'free' && priceType !== 'contact';

  const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const preview = URL.createObjectURL(file);
    setImagePreview(preview);
    setUploadingImage(true);
    setError('');
    try {
      const uploaded = await hubService.uploadFile(hubSlug, file, true);
      setImageFileName(uploaded.name);
    } catch (err: any) {
      setError('Image upload failed: ' + (err.message || 'unknown error'));
      setImagePreview(null);
    } finally {
      setUploadingImage(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) { setError('Title is required'); return; }
    if (uploadingImage) { setError('Please wait for image to finish uploading'); return; }
    setSaving(true);
    setError('');
    try {
      const parsedPrice = showPrice && price ? parseFloat(price) : null;
      const payload = {
        title: title.trim(),
        description: description.trim() || undefined,
        category,
        price_type: priceType,
        price: parsedPrice,
        condition: !isService && condition ? condition.toLowerCase().replace(' ', '-') : undefined,
        image_file_name: imageFileName ?? undefined,
      };
      let listing: HubListing;
      if (isEdit && existingListing) {
        listing = await marketplaceService.updateListing(hubSlug, existingListing.id, payload);
      } else {
        listing = await marketplaceService.createListing(hubSlug, payload);
      }
      onCreated(listing);
      onClose();
      if (!isEdit) {
        // Reset only for create mode
        setTitle(''); setDescription(''); setCategory('Goods'); setPriceType('fixed');
        setPrice(''); setCondition(''); setImageFileName(null); setImagePreview(null);
      }
    } catch (err: any) {
      setError(err.message || (isEdit ? 'Failed to update listing' : 'Failed to create listing'));
    } finally {
      setSaving(false);
    }
  };

  const inputCls = 'w-full px-3 py-2.5 bg-slate-100 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-xl text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500/30 focus:border-purple-500';

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          />
          <motion.div
            initial={{ opacity: 0, y: 40, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 24, scale: 0.97 }}
            className="relative w-full sm:max-w-lg bg-white dark:bg-zinc-900 rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden max-h-[92vh] flex flex-col"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-zinc-800 shrink-0">
              <div className="flex items-center gap-2">
                <Plus className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                <h2 className="text-base font-bold text-slate-900 dark:text-white">{isEdit ? 'Edit Listing' : 'Add Listing'}</h2>
              </div>
              <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors">
                <X className="w-4 h-4 text-slate-500" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="overflow-y-auto flex-1">
              <div className="px-5 py-4 space-y-4">

                {/* Image upload */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">Photo (optional)</label>
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    className="relative w-full aspect-video rounded-xl bg-slate-100 dark:bg-zinc-800 border-2 border-dashed border-slate-300 dark:border-zinc-600 flex items-center justify-center cursor-pointer hover:border-purple-400 transition-colors overflow-hidden"
                  >
                    {imagePreview ? (
                      <img src={imagePreview} alt="Preview" className="w-full h-full object-cover" />
                    ) : imageFileName ? (
                      <img src={marketplaceService.getListingImageUrl(hubSlug, imageFileName) ?? undefined} alt="Current" className="w-full h-full object-cover" />
                    ) : (
                      <div className="flex flex-col items-center gap-2 text-slate-400">
                        <Image className="w-8 h-8" />
                        <span className="text-xs">Tap to add photo</span>
                      </div>
                    )}
                    {uploadingImage && (
                      <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                        <Loader2 className="w-6 h-6 text-white animate-spin" />
                      </div>
                    )}
                  </div>
                  <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageChange} />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                    Title <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={title}
                    onChange={e => setTitle(e.target.value)}
                    placeholder="What are you selling or offering?"
                    className={inputCls}
                    maxLength={200}
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">Category</label>
                    <select value={category} onChange={e => setCategory(e.target.value)} className={inputCls}>
                      {LISTING_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  {!isService && (
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">Condition</label>
                      <select value={condition} onChange={e => setCondition(e.target.value)} className={inputCls}>
                        <option value="">Not applicable</option>
                        {CONDITIONS.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">Pricing</label>
                  <div className="grid grid-cols-2 gap-2 mb-2">
                    {PRICE_TYPES.map(pt => (
                      <button
                        key={pt.value}
                        type="button"
                        onClick={() => setPriceType(pt.value as HubListing['price_type'])}
                        className={`px-3 py-2 rounded-lg text-xs font-medium border transition-colors text-left ${
                          priceType === pt.value
                            ? 'bg-purple-600 text-white border-purple-600'
                            : 'bg-slate-50 dark:bg-zinc-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-zinc-700 hover:border-purple-400'
                        }`}
                      >
                        {pt.label}
                      </button>
                    ))}
                  </div>
                  {showPrice && (
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm font-medium">$</span>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={price}
                        onChange={e => setPrice(e.target.value)}
                        placeholder="0.00"
                        className={inputCls + ' pl-7'}
                      />
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">Description</label>
                  <textarea
                    value={description}
                    onChange={e => setDescription(e.target.value)}
                    placeholder="Describe what you're offering, condition, pickup/delivery info, etc."
                    rows={3}
                    maxLength={1000}
                    className={inputCls + ' resize-none'}
                  />
                  <p className="text-[10px] text-slate-400 mt-1 text-right">{description.length}/1000</p>
                </div>

                {error && (
                  <p className="text-sm text-red-500 bg-red-50 dark:bg-red-900/20 rounded-lg px-3 py-2">{error}</p>
                )}
              </div>

              <div className="px-5 py-4 border-t border-slate-200 dark:border-zinc-800 shrink-0">
                <div className="flex gap-3">
                  <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-slate-200 dark:border-zinc-700 text-sm font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-zinc-800 transition-colors">
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={saving || !title.trim() || uploadingImage}
                    className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-purple-600 text-white text-sm font-semibold hover:from-blue-700 hover:to-purple-700 disabled:opacity-50 transition-all"
                  >
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Tag className="w-4 h-4" />}
                    {saving ? (isEdit ? 'Saving…' : 'Listing…') : (isEdit ? 'Save Changes' : 'Post Listing')}
                  </button>
                </div>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
