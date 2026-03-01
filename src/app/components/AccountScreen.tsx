import { useState } from 'react';
import { ArrowLeft, Save, Check, MapPin, Users } from 'lucide-react';
import { useHub } from '../context/HubContext';

interface AccountScreenProps {
  onBack: () => void;
}

export function AccountScreen({ onBack }: AccountScreenProps) {
  const { currentHub, currentUser, updateUserProfile } = useHub();

  const [displayName, setDisplayName] = useState(currentUser?.displayName || '');
  const [email, setEmail] = useState(currentUser?.email || '');
  const [location, setLocation] = useState(currentUser?.location || '');
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    updateUserProfile({ displayName: displayName.trim() || currentUser?.displayName, email: email.trim(), location: location.trim() });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const role = currentUser?.role || 'participant';
  const isAdmin = currentUser?.isAdmin === true;

  const roleBadgeClass = isAdmin
    ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300'
    : 'bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-slate-400';

  const roleLabel = isAdmin ? '★ Hub Admin' : role.charAt(0).toUpperCase() + role.slice(1);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-purple-50/30 dark:from-zinc-950 dark:via-zinc-900 dark:to-zinc-900">
      {/* Header */}
      <div className="bg-white/60 dark:bg-zinc-900/60 backdrop-blur-xl border-b border-slate-200/50 dark:border-zinc-800/50 sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center gap-4">
          <button
            onClick={onBack}
            className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors"
            aria-label="Go back"
          >
            <ArrowLeft className="w-5 h-5 text-slate-700 dark:text-slate-300" />
          </button>
          <h1 className="text-xl font-semibold text-slate-900 dark:text-white">My Account</h1>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-8 space-y-5">
        {/* Identity card */}
        <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-slate-200 dark:border-zinc-800 p-6">
          {/* Avatar + username row */}
          <div className="flex items-center gap-4 mb-6">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center text-white font-bold text-2xl shrink-0">
              {(currentUser?.displayName || currentUser?.username || 'N').charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-mono text-slate-500 dark:text-slate-400">
                  @{currentUser?.username || 'neighbor'}
                </span>
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${roleBadgeClass}`}>
                  {roleLabel}
                </span>
              </div>
              <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5 truncate">{currentHub?.name}</p>
            </div>
          </div>

          {/* Editable fields */}
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">
                Display Name
              </label>
              <input
                type="text"
                value={displayName}
                onChange={e => setDisplayName(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-800 text-slate-900 dark:text-white text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent focus:outline-none transition-shadow"
                placeholder="Your display name"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-800 text-slate-900 dark:text-white text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent focus:outline-none transition-shadow"
                placeholder="your@email.com"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">
                Location
              </label>
              <input
                type="text"
                value={location}
                onChange={e => setLocation(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-800 text-slate-900 dark:text-white text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent focus:outline-none transition-shadow"
                placeholder="Your neighborhood or city"
              />
            </div>
          </div>

          <button
            onClick={handleSave}
            className="mt-5 w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium transition-colors"
          >
            {saved ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
            {saved ? 'Saved!' : 'Save Changes'}
          </button>
        </div>

        {/* Interests */}
        {(currentUser?.tags?.length ?? 0) > 0 && (
          <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-slate-200 dark:border-zinc-800 p-6">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-3">Interests</h3>
            <div className="flex flex-wrap gap-2">
              {currentUser?.tags?.map(tag => (
                <span
                  key={tag}
                  className="text-xs px-2.5 py-1 rounded-full bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300"
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Hub info */}
        <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-slate-200 dark:border-zinc-800 p-6">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-3">Connected Hub</h3>
          <div className="space-y-2 text-sm">
            <div className="flex items-center gap-2 text-slate-600 dark:text-slate-400">
              <Users className="w-4 h-4 shrink-0" />
              <span>{currentHub?.name}</span>
            </div>
            {currentHub?.location && (
              <div className="flex items-center gap-2 text-slate-600 dark:text-slate-400">
                <MapPin className="w-4 h-4 shrink-0" />
                <span>{currentHub.location}</span>
              </div>
            )}
            {currentHub?.joinedAt && (
              <p className="text-xs text-slate-400 dark:text-slate-500 font-mono">
                Joined {new Date(currentHub.joinedAt).toLocaleDateString()}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
