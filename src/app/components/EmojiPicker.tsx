import { useState } from 'react';

// A curated, dependency-free emoji set — broad enough for everyday chat without
// pulling in a full Unicode emoji library + keyword index.
const EMOJI_GROUPS: { label: string; emoji: string[] }[] = [
  {
    label: 'Smileys',
    emoji: ['😀', '😄', '😁', '😆', '😅', '🤣', '😂', '🙂', '🙃', '😉', '😊', '😇', '🥰', '😍', '😘', '😋', '😛', '🤪', '🤨', '🧐', '😎', '🥳', '😴', '🤔', '🤗', '🙄', '😬', '😳', '🥺', '😢', '😭', '😡', '🤯', '🥶', '🤒', '🤕', '😷'],
  },
  {
    label: 'Gestures',
    emoji: ['👍', '👎', '👏', '🙌', '🙏', '🤝', '👋', '✌️', '🤞', '💪', '🫡', '🤙', '👌', '🫶', '✋', '🖐️', '👊', '🫰'],
  },
  {
    label: 'Hearts',
    emoji: ['❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '💕', '💞', '💗', '💖', '💝', '💔'],
  },
  {
    label: 'Nature & animals',
    emoji: ['🐶', '🐱', '🦊', '🐻', '🐼', '🐨', '🦁', '🐸', '🐢', '🦋', '🌸', '🌻', '🌳', '🌿', '☀️', '🌙', '⭐', '⚡', '🔥', '🌈', '☔', '❄️'],
  },
  {
    label: 'Food',
    emoji: ['🍕', '🍔', '🌮', '🍜', '🍣', '🍩', '🍪', '🎂', '🍎', '🍓', '🥑', '☕', '🍺', '🍷', '🧉'],
  },
  {
    label: 'Objects & symbols',
    emoji: ['🎉', '🎈', '🎁', '🏡', '🚗', '🚲', '🛠️', '📦', '📍', '📅', '💡', '🔔', '📢', '✅', '❌', '⚠️', '💯', '✨', '🙌', '🤝'],
  },
];

export function EmojiPicker({ onSelect }: { onSelect: (emoji: string) => void }) {
  const [activeGroup, setActiveGroup] = useState(0);

  return (
    <div className="w-72 max-h-72 flex flex-col rounded-2xl border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 shadow-xl overflow-hidden">
      <div className="flex items-center gap-1 px-2 pt-2 border-b border-slate-100 dark:border-zinc-800 pb-2 overflow-x-auto">
        {EMOJI_GROUPS.map((g, i) => (
          <button
            key={g.label}
            type="button"
            onClick={() => setActiveGroup(i)}
            className={`shrink-0 px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors ${
              activeGroup === i
                ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300'
                : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-zinc-800'
            }`}
          >
            {g.label}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-y-auto p-2 grid grid-cols-7 gap-0.5">
        {EMOJI_GROUPS[activeGroup].emoji.map(e => (
          <button
            key={e}
            type="button"
            onClick={() => onSelect(e)}
            className="w-9 h-9 flex items-center justify-center text-xl rounded-lg hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors"
          >
            {e}
          </button>
        ))}
      </div>
    </div>
  );
}
