import { useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Mic, MicOff, Video, VideoOff, Radio } from 'lucide-react';

import { useBroadcast } from '../../context/BroadcastContext';

export function BroadcastSetupModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { broadcast, startBroadcast, toggleMic, toggleCam } = useBroadcast();
  const [title, setTitle] = useState('');

  if (!open) return null;

  function handleGoLive() {
    startBroadcast({ title: title.trim() || 'Live broadcast' });
    onClose();
  }

  return createPortal(
    <div className="fixed inset-0 z-[210] flex flex-col bg-gradient-to-b from-[#DC2B2B] to-[#07060F]">
      <div className="flex items-center justify-between px-5 pt-6">
        <button onClick={onClose} aria-label="Close" className="w-8 h-8 rounded-full bg-white/15 flex items-center justify-center text-white">
          <X className="w-4 h-4" />
        </button>
        <span className="text-white font-semibold text-sm">Broadcast</span>
        <div className="w-8" />
      </div>

      <div className="flex-1 flex flex-col gap-6 px-6 pt-8 overflow-y-auto">
        <textarea
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="What are you going live about?"
          maxLength={140}
          rows={3}
          className="w-full bg-white/10 rounded-2xl px-4 py-3 text-white placeholder-white/45 text-lg resize-none outline-none"
        />

        <div className="flex items-center justify-center gap-4">
          <ToggleButton icon={broadcast.micOn ? Mic : MicOff} active={!broadcast.micOn} label={broadcast.micOn ? 'Mic on' : 'Muted'} onClick={toggleMic} />
          <ToggleButton icon={broadcast.camOn ? Video : VideoOff} active={!broadcast.camOn} label={broadcast.camOn ? 'Camera on' : 'Camera off'} onClick={toggleCam} />
        </div>
      </div>

      <div className="flex items-center justify-center pb-14">
        <button onClick={handleGoLive} className="flex items-center gap-2 bg-white rounded-full px-8 py-3.5">
          <Radio className="w-5 h-5 text-[#DC2B2B]" />
          <span className="text-[#07060F] font-semibold">Go live</span>
        </button>
      </div>
    </div>,
    document.body,
  );
}

function ToggleButton({ icon: Icon, active, label, onClick }: { icon: React.ElementType; active: boolean; label: string; onClick: () => void }) {
  return (
    <div className="flex flex-col items-center gap-1.5">
      <button onClick={onClick} className={`w-14 h-14 rounded-full flex items-center justify-center ${active ? 'bg-white' : 'bg-white/15'}`}>
        <Icon className="w-5 h-5" color={active ? '#07060F' : '#fff'} />
      </button>
      <span className="text-white/80 text-xs">{label}</span>
    </div>
  );
}
