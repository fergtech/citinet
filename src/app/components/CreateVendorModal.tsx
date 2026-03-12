import { useState } from 'react';
import { X, Store, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { marketplaceService } from '../services/marketplaceService';
import type { HubVendor } from '../types/hub';

const VENDOR_CATEGORIES = [
  'General', 'Food & Beverage', 'Services', 'Goods & Products',
  'Arts & Crafts', 'Technology', 'Health & Wellness',
  'Events & Education', 'Other',
];

interface CreateVendorModalProps {
  isOpen: boolean;
  hubSlug: string;
  onClose: () => void;
  onCreated: (vendor: HubVendor) => void;
  existingVendor?: HubVendor;
}

export function CreateVendorModal({ isOpen, hubSlug, onClose, onCreated, existingVendor }: CreateVendorModalProps) {
  const isEdit = !!existingVendor;
  const [name, setName] = useState(existingVendor?.name ?? '');
  const [description, setDescription] = useState(existingVendor?.description ?? '');
  const [category, setCategory] = useState(existingVendor?.category ?? 'General');
  const [email, setEmail] = useState(existingVendor?.contact_email ?? '');
  const [phone, setPhone] = useState(existingVendor?.contact_phone ?? '');
  const [website, setWebsite] = useState(existingVendor?.website ?? '');
  const [hours, setHours] = useState(existingVendor?.hours ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) { setError('Vendor name is required'); return; }
    setSaving(true);
    setError('');
    try {
      let vendor: HubVendor;
      if (isEdit && existingVendor) {
        vendor = await marketplaceService.updateVendor(hubSlug, {
          id: existingVendor.id,
          name: name.trim(),
          description: description.trim() || undefined,
          category,
          contact_email: email.trim() || undefined,
          contact_phone: phone.trim() || undefined,
          website: website.trim() || undefined,
          hours: hours.trim() || undefined,
        });
      } else {
        vendor = await marketplaceService.createVendor(hubSlug, {
          name: name.trim(),
          description: description.trim() || undefined,
          category,
          contact_email: email.trim() || undefined,
          contact_phone: phone.trim() || undefined,
          website: website.trim() || undefined,
          hours: hours.trim() || undefined,
        });
      }
      onCreated(vendor);
      onClose();
    } catch (err: any) {
      setError(err.message || (isEdit ? 'Failed to update vendor page' : 'Failed to create vendor page'));
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
            className="relative w-full sm:max-w-lg bg-white dark:bg-zinc-900 rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-zinc-800 shrink-0">
              <div className="flex items-center gap-2">
                <Store className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                <h2 className="text-base font-bold text-slate-900 dark:text-white">{isEdit ? 'Edit Vendor Page' : 'Create Vendor Page'}</h2>
              </div>
              <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors">
                <X className="w-4 h-4 text-slate-500" />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="overflow-y-auto flex-1">
              <div className="px-5 py-4 space-y-4">
                {!isEdit && (
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Create a vendor page to list products and services on the community exchange. Your existing account stays the same.
                  </p>
                )}

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                    Vendor / Organization Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    placeholder="e.g. Corner Bakery, Freelance Tech Help"
                    className={inputCls}
                    maxLength={100}
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">Category</label>
                  <select value={category} onChange={e => setCategory(e.target.value)} className={inputCls}>
                    {VENDOR_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">Description</label>
                  <textarea
                    value={description}
                    onChange={e => setDescription(e.target.value)}
                    placeholder="What do you offer? Tell your neighbors about your business or organization."
                    rows={3}
                    maxLength={500}
                    className={inputCls + ' resize-none'}
                  />
                  <p className="text-[10px] text-slate-400 mt-1 text-right">{description.length}/500</p>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">Email</label>
                    <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="contact@example.com" className={inputCls} />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">Phone</label>
                    <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="(555) 000-0000" className={inputCls} />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">Website</label>
                    <input type="text" value={website} onChange={e => setWebsite(e.target.value)} placeholder="yoursite.com" className={inputCls} />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">Hours</label>
                    <input type="text" value={hours} onChange={e => setHours(e.target.value)} placeholder="Mon-Fri 9am-5pm" className={inputCls} />
                  </div>
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
                    disabled={saving || !name.trim()}
                    className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-purple-600 text-white text-sm font-semibold hover:from-blue-700 hover:to-purple-700 disabled:opacity-50 transition-all"
                  >
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Store className="w-4 h-4" />}
                    {saving ? (isEdit ? 'Saving…' : 'Creating…') : (isEdit ? 'Save Changes' : 'Create Page')}
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
