import { useRef, useState } from 'react';
import { Image as ImageIcon, Upload, Trash2 } from 'lucide-react';
import { COLOR } from './InitiativeCard';
import type { Initiative } from '../services/initiativesService';

export interface InitiativeBannerUploadProps {
  initiative: Initiative;
  bannerUrl?: string | null;
  canEdit: boolean;
  onUpload: (file: File) => void;
  onRemove: () => void;
}

export function InitiativeBannerUpload({ initiative, bannerUrl, canEdit, onUpload, onRemove }: InitiativeBannerUploadProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [hover, setHover] = useState(false);
  const c = COLOR[initiative.color];
  const hasBanner = !!bannerUrl || (initiative.banner_mode === 'gradient' && initiative.banner_gradient_from);

  if (!hasBanner && !canEdit) return null;

  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      className="relative h-36 md:h-48 rounded-2xl overflow-hidden border cn-border"
      style={
        bannerUrl
          ? { background: `center/cover no-repeat url(${bannerUrl})` }
          : initiative.banner_mode === 'gradient' && initiative.banner_gradient_from && initiative.banner_gradient_to
          ? { background: `linear-gradient(135deg, ${initiative.banner_gradient_from}, ${initiative.banner_gradient_to})` }
          : undefined
      }
    >
      {!hasBanner && (
        <div className={`absolute inset-0 bg-gradient-to-br ${c.gradient} flex items-center justify-center opacity-90`}>
          <ImageIcon className="w-7 h-7 text-white/60" />
        </div>
      )}
      {bannerUrl && <div className="absolute inset-0 bg-gradient-to-t from-black/45 to-transparent" />}
      {canEdit && (
        <div className={`absolute top-3 right-3 transition-opacity ${hover || !hasBanner ? 'opacity-100' : 'opacity-0'}`}>
          <button
            onClick={() => fileRef.current?.click()}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-black/60 hover:bg-black/75 text-white text-xs font-semibold backdrop-blur-sm transition-colors"
          >
            <Upload className="w-3.5 h-3.5" />{hasBanner ? 'Change cover' : 'Add cover image'}
          </button>
        </div>
      )}
      {canEdit && hasBanner && hover && (
        <button
          onClick={onRemove}
          title="Remove cover"
          aria-label="Remove cover"
          className="absolute top-3 right-[148px] w-8 h-8 rounded-lg bg-black/60 hover:bg-black/75 flex items-center justify-center backdrop-blur-sm transition-colors"
        >
          <Trash2 className="w-3.5 h-3.5 text-white" />
        </button>
      )}
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) onUpload(f); e.target.value = ''; }}
      />
    </div>
  );
}
