import { X, Search, Users, Activity } from 'lucide-react';
import { useState, useMemo } from 'react';

interface Member {
  id: string;
  name: string;
  avatar: string;
  status: 'online' | 'offline';
  lastSeen?: string;
  joinedDate: string;
}

interface MemberListModalProps {
  isOpen: boolean;
  onClose: () => void;
  filter?: 'all' | 'online';
}

// Mock member data
const MOCK_MEMBERS: Member[] = [
  { id: '1', name: 'Alex Chen', avatar: 'AC', status: 'online', joinedDate: 'Dec 2025' },
  { id: '2', name: 'Jordan Smith', avatar: 'JS', status: 'online', joinedDate: 'Jan 2026' },
  { id: '3', name: 'Sam Rivera', avatar: 'SR', status: 'offline', lastSeen: '2h ago', joinedDate: 'Dec 2025' },
  { id: '4', name: 'Casey Morgan', avatar: 'CM', status: 'online', joinedDate: 'Jan 2026' },
  { id: '5', name: 'Riley Taylor', avatar: 'RT', status: 'online', joinedDate: 'Nov 2025' },
  { id: '6', name: 'Jamie Lee', avatar: 'JL', status: 'offline', lastSeen: '5h ago', joinedDate: 'Dec 2025' },
  { id: '7', name: 'Morgan Davis', avatar: 'MD', status: 'online', joinedDate: 'Jan 2026' },
  { id: '8', name: 'Taylor Brown', avatar: 'TB', status: 'offline', lastSeen: '1d ago', joinedDate: 'Nov 2025' },
  { id: '9', name: 'Avery Wilson', avatar: 'AW', status: 'online', joinedDate: 'Jan 2026' },
  { id: '10', name: 'Quinn Martinez', avatar: 'QM', status: 'online', joinedDate: 'Dec 2025' },
  { id: '11', name: 'Blake Anderson', avatar: 'BA', status: 'offline', lastSeen: '3h ago', joinedDate: 'Jan 2026' },
  { id: '12', name: 'Drew Thomas', avatar: 'DT', status: 'online', joinedDate: 'Dec 2025' },
  { id: '13', name: 'Sage Jackson', avatar: 'SJ', status: 'offline', lastSeen: '6h ago', joinedDate: 'Nov 2025' },
  { id: '14', name: 'Reese White', avatar: 'RW', status: 'online', joinedDate: 'Jan 2026' },
  { id: '15', name: 'Dakota Harris', avatar: 'DH', status: 'offline', lastSeen: '4h ago', joinedDate: 'Dec 2025' },
  { id: '16', name: 'Charlie Clark', avatar: 'CC', status: 'online', joinedDate: 'Jan 2026' },
  { id: '17', name: 'Jesse Lewis', avatar: 'JL', status: 'offline', lastSeen: '12h ago', joinedDate: 'Nov 2025' },
  { id: '18', name: 'River Walker', avatar: 'RW', status: 'online', joinedDate: 'Dec 2025' },
  { id: '19', name: 'Phoenix Hall', avatar: 'PH', status: 'offline', lastSeen: '8h ago', joinedDate: 'Jan 2026' },
  { id: '20', name: 'Sky Allen', avatar: 'SA', status: 'online', joinedDate: 'Dec 2025' },
  { id: '21', name: 'Rory Young', avatar: 'RY', status: 'offline', lastSeen: '1d ago', joinedDate: 'Nov 2025' },
  { id: '22', name: 'Finley King', avatar: 'FK', status: 'offline', lastSeen: '15h ago', joinedDate: 'Jan 2026' },
  { id: '23', name: 'Cameron Wright', avatar: 'CW', status: 'offline', lastSeen: '2d ago', joinedDate: 'Dec 2025' },
  { id: '24', name: 'Emerson Scott', avatar: 'ES', status: 'offline', lastSeen: '10h ago', joinedDate: 'Nov 2025' },
  { id: '25', name: 'Hayden Green', avatar: 'HG', status: 'offline', lastSeen: '1d ago', joinedDate: 'Jan 2026' },
  { id: '26', name: 'Peyton Adams', avatar: 'PA', status: 'offline', lastSeen: '3d ago', joinedDate: 'Dec 2025' },
  { id: '27', name: 'Rowan Baker', avatar: 'RB', status: 'offline', lastSeen: '18h ago', joinedDate: 'Nov 2025' },
  { id: '28', name: 'Kai Nelson', avatar: 'KN', status: 'offline', lastSeen: '2d ago', joinedDate: 'Jan 2026' },
  { id: '29', name: 'Ellis Carter', avatar: 'EC', status: 'offline', lastSeen: '1d ago', joinedDate: 'Dec 2025' },
  { id: '30', name: 'Skyler Mitchell', avatar: 'SM', status: 'offline', lastSeen: '4d ago', joinedDate: 'Nov 2025' },
  { id: '31', name: 'Lennox Perez', avatar: 'LP', status: 'offline', lastSeen: '2d ago', joinedDate: 'Jan 2026' },
  { id: '32', name: 'Sawyer Roberts', avatar: 'SR', status: 'offline', lastSeen: '3d ago', joinedDate: 'Dec 2025' },
  { id: '33', name: 'Eden Turner', avatar: 'ET', status: 'offline', lastSeen: '1d ago', joinedDate: 'Nov 2025' },
  { id: '34', name: 'Marlowe Phillips', avatar: 'MP', status: 'offline', lastSeen: '5d ago', joinedDate: 'Jan 2026' },
  { id: '35', name: 'Jude Campbell', avatar: 'JC', status: 'offline', lastSeen: '2d ago', joinedDate: 'Dec 2025' },
  { id: '36', name: 'Navy Parker', avatar: 'NP', status: 'offline', lastSeen: '4d ago', joinedDate: 'Nov 2025' },
  { id: '37', name: 'August Evans', avatar: 'AE', status: 'offline', lastSeen: '3d ago', joinedDate: 'Jan 2026' },
  { id: '38', name: 'Briar Edwards', avatar: 'BE', status: 'offline', lastSeen: '1d ago', joinedDate: 'Dec 2025' },
  { id: '39', name: 'Indigo Collins', avatar: 'IC', status: 'offline', lastSeen: '6d ago', joinedDate: 'Nov 2025' },
  { id: '40', name: 'Sage Stewart', avatar: 'SS', status: 'offline', lastSeen: '2d ago', joinedDate: 'Jan 2026' },
  { id: '41', name: 'Sterling Sanchez', avatar: 'SS', status: 'offline', lastSeen: '5d ago', joinedDate: 'Dec 2025' },
  { id: '42', name: 'Atlas Morris', avatar: 'AM', status: 'offline', lastSeen: '3d ago', joinedDate: 'Nov 2025' },
  { id: '43', name: 'Wren Rogers', avatar: 'WR', status: 'offline', lastSeen: '4d ago', joinedDate: 'Jan 2026' },
  { id: '44', name: 'Bodhi Reed', avatar: 'BR', status: 'offline', lastSeen: '2d ago', joinedDate: 'Dec 2025' },
  { id: '45', name: 'Zion Cook', avatar: 'ZC', status: 'offline', lastSeen: '7d ago', joinedDate: 'Nov 2025' },
  { id: '46', name: 'Hollis Morgan', avatar: 'HM', status: 'offline', lastSeen: '3d ago', joinedDate: 'Jan 2026' },
  { id: '47', name: 'Nova Bell', avatar: 'NB', status: 'offline', lastSeen: '5d ago', joinedDate: 'Dec 2025' },
];

export function MemberListModal({ isOpen, onClose, filter = 'all' }: MemberListModalProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFilter, setSelectedFilter] = useState<'all' | 'online'>(filter);

  const filteredMembers = useMemo(() => {
    let result = MOCK_MEMBERS;

    // Apply status filter
    if (selectedFilter === 'online') {
      result = result.filter(m => m.status === 'online');
    }

    // Apply search
    if (searchQuery) {
      result = result.filter(m => 
        m.name.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    // Sort: online first, then by name
    return result.sort((a, b) => {
      if (a.status !== b.status) {
        return a.status === 'online' ? -1 : 1;
      }
      return a.name.localeCompare(b.name);
    });
  }, [searchQuery, selectedFilter]);

  if (!isOpen) return null;

  const onlineCount = MOCK_MEMBERS.filter(m => m.status === 'online').length;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-zinc-900 rounded-2xl max-w-2xl w-full max-h-[80vh] shadow-2xl border border-slate-200 dark:border-zinc-800 overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-6 border-b border-slate-200 dark:border-zinc-800">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-xl font-semibold text-slate-900 dark:text-white">Community Members</h3>
              <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                {onlineCount} online • {MOCK_MEMBERS.length} total
              </p>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-zinc-800 hover:bg-slate-200 dark:hover:bg-zinc-700 flex items-center justify-center transition-all"
            >
              <X className="w-4 h-4 text-slate-700 dark:text-slate-300" />
            </button>
          </div>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search members..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-lg text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500 dark:focus:ring-purple-600"
            />
          </div>

          {/* Filter Tabs */}
          <div className="flex gap-2 mt-4">
            <button
              onClick={() => setSelectedFilter('all')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                selectedFilter === 'all'
                  ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400'
                  : 'bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-zinc-700'
              }`}
            >
              <Users className="w-4 h-4" />
              All Members
            </button>
            <button
              onClick={() => setSelectedFilter('online')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                selectedFilter === 'online'
                  ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400'
                  : 'bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-zinc-700'
              }`}
            >
              <Activity className="w-4 h-4" />
              Online Now
            </button>
          </div>
        </div>

        {/* Member List */}
        <div className="flex-1 overflow-y-auto p-6">
          {filteredMembers.length === 0 ? (
            <div className="text-center py-12">
              <Users className="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
              <p className="text-sm text-slate-600 dark:text-slate-400">No members found</p>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredMembers.map((member) => (
                <div
                  key={member.id}
                  className="flex items-center gap-3 p-3 rounded-lg hover:bg-slate-50 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
                >
                  {/* Avatar */}
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-semibold flex-shrink-0 ${
                    member.status === 'online' 
                      ? 'bg-gradient-to-br from-purple-600 to-blue-600'
                      : 'bg-slate-400 dark:bg-slate-600'
                  }`}>
                    {member.avatar}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h4 className="text-sm font-medium text-slate-900 dark:text-white truncate">
                        {member.name}
                      </h4>
                      <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                        member.status === 'online' ? 'bg-green-400 animate-pulse' : 'bg-slate-400'
                      }`} />
                    </div>
                    <p className="text-xs text-slate-600 dark:text-slate-400">
                      {member.status === 'online' ? 'Online' : `Last seen ${member.lastSeen}`} • Joined {member.joinedDate}
                    </p>
                  </div>

                  {/* Action */}
                  <button className="px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white text-xs font-medium rounded-lg transition-colors">
                    Message
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
