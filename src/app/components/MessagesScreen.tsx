import { useState } from 'react';
import { Search, Send, ArrowLeft, Phone, Video, Info, Users, Home } from 'lucide-react';

interface Message {
  id: number;
  senderId: string;
  text: string;
  timestamp: string;
  read: boolean;
}

interface Conversation {
  id: string;
  name: string;
  avatar: string;
  lastMessage: string;
  timestamp: string;
  unread: number;
  online: boolean;
  type: 'direct' | 'group';
  participants?: number;
}

interface MessagesScreenProps {
  onBack: () => void;
}

export function MessagesScreen({ onBack }: MessagesScreenProps) {
  const [selectedConversation, setSelectedConversation] = useState<string>('1');
  const [messageText, setMessageText] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  // Mock conversations data
  const conversations: Conversation[] = [
    {
      id: '1',
      name: 'Sarah K.',
      avatar: 'S',
      lastMessage: 'Thanks for the update on the bike lane proposal!',
      timestamp: '2m ago',
      unread: 0,
      online: true,
      type: 'direct'
    },
    {
      id: '2',
      name: 'Park Cleanup Committee',
      avatar: 'P',
      lastMessage: 'Maria: We need more volunteers for Saturday',
      timestamp: '15m ago',
      unread: 3,
      online: false,
      type: 'group',
      participants: 8
    },
    {
      id: '3',
      name: 'Highland Park Civic Assoc.',
      avatar: 'H',
      lastMessage: 'Meeting agenda has been posted',
      timestamp: '1h ago',
      unread: 1,
      online: false,
      type: 'group',
      participants: 47
    },
    {
      id: '4',
      name: 'Carlos M.',
      avatar: 'C',
      lastMessage: 'Sure, I can help with that!',
      timestamp: '3h ago',
      unread: 0,
      online: true,
      type: 'direct'
    },
    {
      id: '5',
      name: 'Local Tool Library',
      avatar: 'L',
      lastMessage: 'Your reservation is confirmed',
      timestamp: '1d ago',
      unread: 0,
      online: false,
      type: 'group',
      participants: 15
    }
  ];

  // Mock messages for selected conversation
  const messages: Message[] = [
    {
      id: 1,
      senderId: 'them',
      text: 'Hi! Did you see the latest proposal for the Main Street bike lane?',
      timestamp: '10:32 AM',
      read: true
    },
    {
      id: 2,
      senderId: 'me',
      text: 'Yes! I think it\'s a great idea. Really needed for cyclist safety.',
      timestamp: '10:35 AM',
      read: true
    },
    {
      id: 3,
      senderId: 'them',
      text: 'Agreed. I\'m planning to attend the town hall meeting to show support.',
      timestamp: '10:36 AM',
      read: true
    },
    {
      id: 4,
      senderId: 'me',
      text: 'That\'s this Thursday at 7 PM, right? I\'ll be there too.',
      timestamp: '10:38 AM',
      read: true
    },
    {
      id: 5,
      senderId: 'them',
      text: 'Thanks for the update on the bike lane proposal!',
      timestamp: '10:40 AM',
      read: true
    }
  ];

  const activeConversation = conversations.find(c => c.id === selectedConversation);

  const handleSendMessage = () => {
    if (messageText.trim()) {
      // Handle sending message
      console.log('Sending:', messageText);
      setMessageText('');
    }
  };

  const filteredConversations = conversations.filter(conv =>
    conv.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-purple-50/30 dark:from-zinc-950 dark:via-zinc-900 dark:to-zinc-900 flex relative overflow-hidden">
      {/* Subtle mesh grid background pattern */}
      <div className="absolute inset-0 opacity-[0.03] dark:opacity-[0.08] pointer-events-none z-0">
        <svg className="w-full h-full" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <pattern id="messages-mesh" x="0" y="0" width="32" height="32" patternUnits="userSpaceOnUse">
              <path d="M 32 0 L 0 0 0 32" fill="none" stroke="currentColor" strokeWidth="0.5" className="text-purple-600 dark:text-purple-400"/>
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#messages-mesh)"/>
        </svg>
      </div>

      {/* Conversations Sidebar */}
      <aside className={`${selectedConversation ? 'hidden md:flex' : 'flex'} flex-col w-full md:w-80 lg:w-96 bg-white/40 dark:bg-zinc-900/40 backdrop-blur-xl border-r border-slate-200/50 dark:border-zinc-800/50 relative z-10`}>
        {/* Header */}
        <div className="p-4 border-b border-slate-200/50 dark:border-zinc-800/50">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <button
                onClick={onBack}
                className="w-10 h-10 rounded-lg bg-slate-100 dark:bg-zinc-800 hover:bg-slate-200 dark:hover:bg-zinc-700 flex items-center justify-center transition-colors"
                title="Back to Dashboard"
              >
                <ArrowLeft className="w-5 h-5 text-slate-700 dark:text-slate-300" />
              </button>
              <h1 className="text-2xl font-semibold text-slate-900 dark:text-white tracking-tight">Messages</h1>
            </div>
          </div>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search conversations..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-slate-100 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-xl text-sm text-slate-900 dark:text-white placeholder-slate-500 dark:placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500 dark:focus:ring-purple-400 focus:border-transparent transition-all"
            />
          </div>
        </div>

        {/* Conversations List */}
        <div className="flex-1 overflow-y-auto px-3 py-2">
          {filteredConversations.map(conversation => (
            <button
              key={conversation.id}
              onClick={() => setSelectedConversation(conversation.id)}
              className={`w-full p-3.5 flex items-start gap-3.5 transition-all rounded-2xl mb-1.5 ${
                selectedConversation === conversation.id
                  ? 'bg-purple-50 dark:bg-purple-900/20'
                  : 'hover:bg-slate-50 dark:hover:bg-zinc-800/30 active:bg-slate-100 dark:active:bg-zinc-800/50'
              }`}
            >
              {/* Avatar */}
              <div className="relative flex-shrink-0">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center text-white font-semibold">
                  {conversation.avatar}
                </div>
                {conversation.online && (
                  <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 rounded-full border-2 border-white dark:border-zinc-900" />
                )}
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0 text-left">
                <div className="flex items-baseline justify-between gap-2 mb-0.5">
                  <h3 className="font-semibold text-[15px] text-slate-900 dark:text-white truncate">
                    {conversation.name}
                  </h3>
                  <span className="text-[11px] text-slate-400 dark:text-slate-500 flex-shrink-0 font-medium">
                    {conversation.timestamp}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 mb-1">
                  {conversation.type === 'group' && (
                    <>
                      <Users className="w-3 h-3 text-slate-400 flex-shrink-0" />
                      <span className="text-[11px] text-slate-500 dark:text-slate-500">
                        {conversation.participants}
                      </span>
                      <span className="text-slate-400 dark:text-slate-600">·</span>
                    </>
                  )}
                  <p className="text-[13px] text-slate-600 dark:text-slate-400 truncate flex-1">
                    {conversation.lastMessage}
                  </p>
                  {conversation.unread > 0 && (
                    <div className="flex-shrink-0 min-w-[18px] h-[18px] px-1.5 rounded-full bg-purple-600 dark:bg-purple-500 flex items-center justify-center ml-1">
                      <span className="text-[10px] font-bold text-white">{conversation.unread}</span>
                    </div>
                  )}
                </div>
              </div>
            </button>
          ))}
        </div>
      </aside>

      {/* Chat Area */}
      {selectedConversation && activeConversation && (
        <div className={`flex-1 flex flex-col relative z-10 ${selectedConversation ? 'flex' : 'hidden md:flex'}`}>
          {/* Chat Header */}
          <div className="p-4 bg-white/40 dark:bg-zinc-900/40 backdrop-blur-xl border-b border-slate-200/50 dark:border-zinc-800/50 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setSelectedConversation('')}
                aria-label="Back to conversations"
                className="md:hidden w-10 h-10 rounded-lg bg-slate-100 dark:bg-zinc-800 hover:bg-slate-200 dark:hover:bg-zinc-700 flex items-center justify-center transition-colors"
              >
                <ArrowLeft className="w-5 h-5 text-slate-700 dark:text-slate-300" />
              </button>
              
              <div className="relative">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center text-white font-semibold">
                  {activeConversation.avatar}
                </div>
                {activeConversation.online && (
                  <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 rounded-full border-2 border-white dark:border-zinc-900" />
                )}
              </div>

              <div>
                <div className="flex items-center gap-2">
                  <h2 className="font-semibold text-slate-900 dark:text-white">
                    {activeConversation.name}
                  </h2>
                  {activeConversation.type === 'group' && (
                    <Users className="w-4 h-4 text-slate-400" />
                  )}
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-400">
                  {activeConversation.online ? 'Online now' : `${activeConversation.participants || 0} members`}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button aria-label="Voice call" className="w-10 h-10 rounded-lg hover:bg-slate-100 dark:hover:bg-zinc-800 flex items-center justify-center transition-colors">
                <Phone className="w-5 h-5 text-slate-600 dark:text-slate-400" />
              </button>
              <button aria-label="Video call" className="w-10 h-10 rounded-lg hover:bg-slate-100 dark:hover:bg-zinc-800 flex items-center justify-center transition-colors">
                <Video className="w-5 h-5 text-slate-600 dark:text-slate-400" />
              </button>
              <button aria-label="Conversation info" className="w-10 h-10 rounded-lg hover:bg-slate-100 dark:hover:bg-zinc-800 flex items-center justify-center transition-colors">
                <Info className="w-5 h-5 text-slate-600 dark:text-slate-400" />
              </button>
            </div>
          </div>

          {/* Messages Area */}
          <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4">
            {messages.map((message) => (
              <div
                key={message.id}
                className={`flex ${message.senderId === 'me' ? 'justify-end' : 'justify-start'}`}
              >
                <div className={`max-w-[75%] md:max-w-[60%] ${message.senderId === 'me' ? 'order-2' : 'order-1'}`}>
                  <div
                    className={`rounded-2xl px-4 py-2.5 ${
                      message.senderId === 'me'
                        ? 'bg-purple-600 dark:bg-purple-500 text-white rounded-br-sm'
                        : 'bg-white dark:bg-zinc-800 text-slate-900 dark:text-white border border-slate-200 dark:border-zinc-700 rounded-bl-sm'
                    }`}
                  >
                    <p className="text-sm leading-relaxed">{message.text}</p>
                  </div>
                  <p className={`text-xs text-slate-500 dark:text-slate-400 mt-1 ${message.senderId === 'me' ? 'text-right' : 'text-left'}`}>
                    {message.timestamp}
                  </p>
                </div>
              </div>
            ))}
          </div>

          {/* Input Area */}
          <div className="p-4 bg-white/40 dark:bg-zinc-900/40 backdrop-blur-xl border-t border-slate-200/50 dark:border-zinc-800/50">
            <div className="flex items-end gap-3">
              <div className="flex-1 relative">
                <textarea
                  value={messageText}
                  onChange={(e) => setMessageText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSendMessage();
                    }
                  }}
                  placeholder="Type your message..."
                  rows={1}
                  className="w-full px-4 py-3 bg-slate-100 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-xl text-sm text-slate-900 dark:text-white placeholder-slate-500 dark:placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500 dark:focus:ring-purple-400 focus:border-transparent transition-all resize-none"
                  style={{ maxHeight: '120px', minHeight: '48px' }}
                />
              </div>
              <button
                onClick={handleSendMessage}
                disabled={!messageText.trim()}
                aria-label="Send message"
                className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 disabled:from-slate-300 disabled:to-slate-400 dark:disabled:from-zinc-700 dark:disabled:to-zinc-600 flex items-center justify-center transition-all disabled:cursor-not-allowed shadow-lg disabled:shadow-none"
              >
                <Send className="w-5 h-5 text-white" />
              </button>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
              Press Enter to send, Shift+Enter for new line
            </p>
          </div>
        </div>
      )}

      {/* Empty State - No Conversation Selected (Desktop Only) */}
      {!selectedConversation && (
        <div className="hidden md:flex flex-1 items-center justify-center relative z-10">
          <div className="text-center max-w-md px-8">
            {/* Wireframe icon graphic */}
            <div className="w-24 h-24 mx-auto mb-6 relative">
              <svg viewBox="0 0 96 96" className="w-full h-full opacity-20">
                <defs>
                  <pattern id="empty-mesh" x="0" y="0" width="16" height="16" patternUnits="userSpaceOnUse">
                    <path d="M 16 0 L 0 0 0 16" fill="none" stroke="rgb(139, 92, 246)" strokeWidth="0.5"/>
                  </pattern>
                </defs>
                <rect width="96" height="96" fill="url(#empty-mesh)"/>
                <circle cx="48" cy="48" r="30" fill="none" stroke="rgb(139, 92, 246)" strokeWidth="2"/>
                <path d="M 30 48 Q 39 38, 48 48 T 66 48" fill="none" stroke="rgb(139, 92, 246)" strokeWidth="2"/>
                <circle cx="48" cy="38" r="2" fill="rgb(139, 92, 246)"/>
              </svg>
            </div>
            
            <h3 className="text-xl font-semibold text-slate-900 dark:text-white mb-2">
              Select a conversation
            </h3>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Choose a conversation from the sidebar to start messaging your neighbors and community groups
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
