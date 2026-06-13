import { useState, useEffect, useRef, useMemo } from 'react';
import { Participant, ChatMessage, ChatReactionAggregate } from '../types';
import { supabase } from '../lib/supabase';
import { Send, MoreVertical, Loader2, MessageSquare, Edit2, Trash2, X, Check } from 'lucide-react';

interface Props {
  currentParticipantId: string;
  participants: Participant[];
}

const EMOJI_LIST = ['⚽', '🔥', '😂', '😮', '👑', '💸'];

export default function ChatHub({ currentParticipantId, participants }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(true);
  const [activeConnections, setActiveConnections] = useState(1);
  const [connectionStatus, setConnectionStatus] = useState<string>('connecting');
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState('');
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);

  const feedRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Map of participant profiles for quick O(1) lookup
  const participantMap = useMemo(() => {
    return new Map(participants.map((p) => [p.id, p]));
  }, [participants]);

  // Aggregate reactions helper
  const aggregateReactions = (rawReactions: any[]): ChatReactionAggregate[] => {
    const grouped: Record<string, string[]> = {};
    rawReactions.forEach((r) => {
      if (!grouped[r.emoji]) grouped[r.emoji] = [];
      if (!grouped[r.emoji].includes(r.participant_id)) {
        grouped[r.emoji].push(r.participant_id);
      }
    });

    return EMOJI_LIST.map((emoji) => {
      const pIds = grouped[emoji] || [];
      return {
        emoji,
        count: pIds.length,
        meReacted: pIds.includes(currentParticipantId),
        participantIds: pIds,
      };
    }).filter((r) => r.count > 0); // Only show reactions with count > 0 in aggregated view
  };

  // Initial Data Fetch
  useEffect(() => {
    async function fetchMessages() {
      try {
        const { data, error } = await supabase
          .from('chat_messages')
          .select('*, chat_reactions(*)')
          .order('created_at', { ascending: false })
          .limit(100);

        if (error) throw error;

        // Map joined data with local profiles and reactions aggregation
        const formatted = (data || []).reverse().map((msg: any) => {
          const profile = participantMap.get(msg.participant_id);
          return {
            ...msg,
            participants: profile
              ? {
                  name: profile.name,
                  display_name: profile.display_name,
                  photo_url: profile.photo_url,
                }
              : undefined,
            reactions: aggregateReactions(msg.chat_reactions || []),
          } as ChatMessage;
        });

        setMessages(formatted);
        setTimeout(() => scrollToBottom(true), 50);
      } catch (err) {
        console.error('Error fetching messages:', err);
      } finally {
        setLoading(false);
      }
    }

    fetchMessages();
  }, [participantMap, currentParticipantId]);

  // Real-time Subscriptions and Presence
  useEffect(() => {
    // 1. Establish the chat channel
    const channel = supabase.channel('elcasino-chat-channel', {
      config: {
        presence: {
          key: currentParticipantId,
        },
      },
    });

    // 2. Presence tracking (Live connection counter)
    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState();
        const uniqueUsers = Object.keys(state).length;
        setActiveConnections(uniqueUsers);
      })
      .on('presence', { event: 'join' }, ({ key }) => {
        console.log('User joined chat:', key);
      })
      .on('presence', { event: 'leave' }, ({ key }) => {
        console.log('User left chat:', key);
      });

    // 3. Listen to chat message events
    channel
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'chat_messages' },
        (payload) => {
          const { eventType, new: newRow, old: oldRow } = payload;

          if (eventType === 'INSERT') {
            const profile = participantMap.get(newRow.participant_id);
            const newMessage: ChatMessage = {
              id: newRow.id,
              participant_id: newRow.participant_id,
              message: newRow.message,
              is_edited: newRow.is_edited,
              created_at: newRow.created_at,
              updated_at: newRow.updated_at,
              participants: profile
                ? {
                    name: profile.name,
                    display_name: profile.display_name,
                    photo_url: profile.photo_url,
                  }
                : undefined,
              reactions: [],
            };

            setMessages((prev) => {
              // Avoid duplicate messages if optimistically added
              if (prev.some((m) => m.id === newMessage.id)) return prev;
              return [...prev, newMessage];
            });

            // Scroll if near bottom
            setTimeout(() => scrollToBottom(false), 50);
          } else if (eventType === 'UPDATE') {
            setMessages((prev) =>
              prev.map((msg) =>
                msg.id === newRow.id
                  ? {
                      ...msg,
                      message: newRow.message,
                      is_edited: newRow.is_edited,
                      updated_at: newRow.updated_at,
                    }
                  : msg
              )
            );
          } else if (eventType === 'DELETE') {
            setMessages((prev) => prev.filter((msg) => msg.id !== oldRow.id));
          }
        }
      )
      // 4. Listen to reactions changes
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'chat_reactions' },
        (payload) => {
          const { eventType, new: newReact, old: oldReact } = payload;

          if (eventType === 'INSERT') {
            setMessages((prev) =>
              prev.map((msg) => {
                if (msg.id !== newReact.message_id) return msg;

                // Build reaction list
                const rawReactions = getRawReactionsFromAggregate(msg.reactions);
                rawReactions.push(newReact);

                return {
                  ...msg,
                  reactions: aggregateReactions(rawReactions),
                };
              })
            );
          } else if (eventType === 'DELETE') {
            // Note: Since REPLICA IDENTITY FULL is enabled, oldReact has the message_id, participant_id, emoji
            setMessages((prev) =>
              prev.map((msg) => {
                const targetMessageId = oldReact.message_id || newReact?.message_id;
                if (msg.id !== targetMessageId) return msg;

                const rawReactions = getRawReactionsFromAggregate(msg.reactions);
                // Filter out the deleted reaction
                // Using id or participant_id + emoji check
                const filteredReactions = rawReactions.filter(
                  (r) =>
                    !(r.id === oldReact.id ||
                      (r.participant_id === oldReact.participant_id && r.emoji === oldReact.emoji))
                );

                return {
                  ...msg,
                  reactions: aggregateReactions(filteredReactions),
                };
              })
            );
          }
        }
      );

    // 5. Connect and monitor status
    channel.subscribe((status) => {
      setConnectionStatus(status);
      if (status === 'SUBSCRIBED') {
        console.log('Successfully subscribed to El Casino Real-time Lounge Chat');
        // Track presence for the current participant
        channel.track({ online_at: new Date().toISOString() });
      }
    });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [participantMap, currentParticipantId]);

  // Helper to expand aggregated reactions back into raw list for recalculation
  const getRawReactionsFromAggregate = (aggregates: ChatReactionAggregate[]): any[] => {
    const raw: any[] = [];
    aggregates.forEach((agg) => {
      agg.participantIds.forEach((pId) => {
        raw.push({
          participant_id: pId,
          emoji: agg.emoji,
        });
      });
    });
    return raw;
  };

  // Close menus on clicking outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setActiveMenuId(null);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Handle Send Message
  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const cleanText = inputText.trim();
    if (!cleanText) return;

    setInputText('');

    // Generate temporary ID for optimistic UI
    const tempId = `temp-${Date.now()}`;
    const myProfile = participantMap.get(currentParticipantId);

    const optimisticMessage: ChatMessage = {
      id: tempId,
      participant_id: currentParticipantId,
      message: cleanText,
      is_edited: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      participants: myProfile
        ? {
            name: myProfile.name,
            display_name: myProfile.display_name,
            photo_url: myProfile.photo_url,
          }
        : undefined,
      reactions: [],
    };

    // Push optimistically
    setMessages((prev) => [...prev, optimisticMessage]);
    setTimeout(() => scrollToBottom(true), 30);

    try {
      const { data, error } = await supabase
        .from('chat_messages')
        .insert({
          participant_id: currentParticipantId,
          message: cleanText,
        })
        .select()
        .single();

      if (error) throw error;

      // Replace optimistic message with the database record
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === tempId
            ? {
                ...msg,
                id: data.id,
                created_at: data.created_at,
                updated_at: data.updated_at,
              }
            : msg
        )
      );
    } catch (err) {
      console.error('Failed to dispatch message:', err);
      // Remove optimistic message on failure
      setMessages((prev) => prev.filter((msg) => msg.id !== tempId));
    }
  };

  // Handle Delete Message
  const handleDeleteMessage = async (messageId: string) => {
    setActiveMenuId(null);

    // Optimistic removal
    const previousMessages = [...messages];
    setMessages((prev) => prev.filter((msg) => msg.id !== messageId));

    try {
      const { error } = await supabase.from('chat_messages').delete().eq('id', messageId);
      if (error) throw error;
    } catch (err) {
      console.error('Failed to delete message:', err);
      // Rollback
      setMessages(previousMessages);
    }
  };

  // Handle Save Edit
  const handleSaveEdit = async (messageId: string) => {
    const cleanEdit = editingText.trim();
    if (!cleanEdit) return;

    setEditingMessageId(null);
    setActiveMenuId(null);

    // Optimistic update
    const previousMessages = [...messages];
    setMessages((prev) =>
      prev.map((msg) =>
        msg.id === messageId
          ? {
              ...msg,
              message: cleanEdit,
              is_edited: true,
              updated_at: new Date().toISOString(),
            }
          : msg
      )
    );

    try {
      const { error } = await supabase
        .from('chat_messages')
        .update({
          message: cleanEdit,
          is_edited: true,
        })
        .eq('id', messageId);

      if (error) throw error;
    } catch (err) {
      console.error('Failed to update message:', err);
      // Rollback
      setMessages(previousMessages);
    }
  };

  // Toggle Reaction
  const handleToggleReaction = async (messageId: string, emoji: string) => {
    const targetMsg = messages.find((m) => m.id === messageId);
    if (!targetMsg) return;

    const existingReaction = targetMsg.reactions.find((r) => r.emoji === emoji);
    const alreadyReacted = existingReaction?.meReacted || false;

    // Optimistic UI updates
    setMessages((prev) =>
      prev.map((msg) => {
        if (msg.id !== messageId) return msg;

        let updatedReactions = [...msg.reactions];
        const index = updatedReactions.findIndex((r) => r.emoji === emoji);

        if (alreadyReacted) {
          // Remove my reaction
          if (index > -1) {
            const r = updatedReactions[index];
            const filteredPIds = r.participantIds.filter((id) => id !== currentParticipantId);
            if (filteredPIds.length > 0) {
              updatedReactions[index] = {
                ...r,
                count: filteredPIds.length,
                meReacted: false,
                participantIds: filteredPIds,
              };
            } else {
              updatedReactions = updatedReactions.filter((r) => r.emoji !== emoji);
            }
          }
        } else {
          // Add my reaction
          if (index > -1) {
            const r = updatedReactions[index];
            updatedReactions[index] = {
              ...r,
              count: r.count + 1,
              meReacted: true,
              participantIds: [...r.participantIds, currentParticipantId],
            };
          } else {
            updatedReactions.push({
              emoji,
              count: 1,
              meReacted: true,
              participantIds: [currentParticipantId],
            });
          }
        }

        return {
          ...msg,
          reactions: updatedReactions,
        };
      })
    );

    try {
      if (alreadyReacted) {
        // Delete reaction
        const { error } = await supabase
          .from('chat_reactions')
          .delete()
          .eq('message_id', messageId)
          .eq('participant_id', currentParticipantId)
          .eq('emoji', emoji);

        if (error) throw error;
      } else {
        // Insert reaction
        const { error } = await supabase.from('chat_reactions').insert({
          message_id: messageId,
          participant_id: currentParticipantId,
          emoji,
        });

        if (error) throw error;
      }
    } catch (err) {
      console.error('Failed to toggle reaction:', err);
      // Revert is handled automatically when real-time event updates state or we could force a refresh.
      // For simplicity, real-time channel updates will sync correct values eventually.
    }
  };

  // Scroll physics
  const scrollToBottom = (force = false) => {
    const feed = feedRef.current;
    if (!feed) return;

    const isNearBottom = feed.scrollHeight - feed.scrollTop - feed.clientHeight < 150;
    if (force || isNearBottom) {
      feed.scrollTo({
        top: feed.scrollHeight,
        behavior: 'smooth',
      });
    }
  };

  const getInitials = (name: string) => {
    return name.slice(0, 2).toUpperCase();
  };

  return (
    <div className="elcasino-chat-wrapper">
      {/* Header Block */}
      <div className="elcasino-chat-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <MessageSquare size={20} style={{ color: 'var(--accent)' }} />
          <div>
            <h3 style={{ margin: 0, fontSize: '1.05rem', color: '#fff' }}>El Casino Lounge Chat</h3>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px' }}>
              <span
                style={{
                  width: '6px',
                  height: '6px',
                  borderRadius: '50%',
                  background: connectionStatus === 'SUBSCRIBED' ? '#10b981' : '#f59e0b',
                  display: 'inline-block',
                }}
              />
              <span style={{ fontSize: '0.72rem', color: 'rgba(255, 255, 255, 0.45)' }}>
                {connectionStatus === 'SUBSCRIBED' ? 'Connected' : 'Connecting...'}
              </span>
            </div>
          </div>
        </div>
        <div
          style={{
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.06)',
            borderRadius: '6px',
            padding: '4px 10px',
            fontSize: '0.78rem',
            color: '#cbd5e1',
          }}
        >
          {activeConnections} active {activeConnections === 1 ? 'user' : 'users'}
        </div>
      </div>

      {/* Message Feed Layout */}
      <div className="elcasino-chat-feed" ref={feedRef}>
        {loading ? (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
              gap: '12px',
              color: 'rgba(255,255,255,0.4)',
            }}
          >
            <Loader2 size={32} className="spinning" />
            <span style={{ fontSize: '0.9rem' }}>Shuffling messages...</span>
          </div>
        ) : messages.length === 0 ? (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
              gap: '12px',
              color: 'rgba(255,255,255,0.3)',
            }}
          >
            <MessageSquare size={40} style={{ opacity: 0.5 }} />
            <span style={{ fontSize: '0.95rem' }}>No messages yet. Start the casino chatter!</span>
          </div>
        ) : (
          messages.map((msg) => {
            const isSelf = msg.participant_id === currentParticipantId;
            const displayName = msg.participants?.display_name || msg.participants?.name || 'Unknown User';
            const initials = getInitials(msg.participants?.name || '??');
            const hasAvatar = !!msg.participants?.photo_url;

            return (
              <div key={msg.id} className={`elcasino-message-row ${isSelf ? 'self' : 'vendor'}`}>
                {/* Avatar Block */}
                {!isSelf && (
                  <div
                    style={{
                      width: '36px',
                      height: '36px',
                      borderRadius: '50%',
                      overflow: 'hidden',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '0.8rem',
                      fontWeight: 600,
                      color: '#fff',
                      background: 'rgba(255, 255, 255, 0.08)',
                      border: '1px solid rgba(255, 255, 255, 0.1)',
                      flexShrink: 0,
                    }}
                    title={displayName}
                  >
                    {hasAvatar ? (
                      <img
                        src={msg.participants?.photo_url!}
                        alt={displayName}
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      />
                    ) : (
                      initials
                    )}
                  </div>
                )}

                <div style={{ display: 'flex', flexDirection: 'column', maxWidth: '100%' }}>
                  {/* Sender Name */}
                  {!isSelf && (
                    <span
                      style={{
                        fontSize: '0.75rem',
                        color: 'rgba(255, 255, 255, 0.5)',
                        marginBottom: '4px',
                        marginLeft: '4px',
                      }}
                    >
                      {displayName}
                    </span>
                  )}

                  {/* Message Bubble Container */}
                  <div
                    className="elcasino-bubble-box"
                    onDoubleClick={() => {
                      if (isSelf) {
                        setEditingMessageId(msg.id);
                        setEditingText(msg.message);
                      }
                    }}
                  >
                    {editingMessageId === msg.id ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', minWidth: '200px' }}>
                        <input
                          type="text"
                          value={editingText}
                          onChange={(e) => setEditingText(e.target.value)}
                          className="elcasino-input-field"
                          style={{ padding: '8px 12px', fontSize: '0.9rem' }}
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleSaveEdit(msg.id);
                            if (e.key === 'Escape') setEditingMessageId(null);
                          }}
                        />
                        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                          <button
                            onClick={() => setEditingMessageId(null)}
                            style={{
                              background: 'transparent',
                              border: 'none',
                              color: 'rgba(255,255,255,0.4)',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '4px',
                              fontSize: '0.78rem',
                            }}
                          >
                            <X size={14} /> Cancel
                          </button>
                          <button
                            onClick={() => handleSaveEdit(msg.id)}
                            style={{
                              background: 'rgba(14, 165, 233, 0.2)',
                              border: '1px solid rgba(14, 165, 233, 0.4)',
                              borderRadius: '4px',
                              color: '#38bdf8',
                              padding: '2px 8px',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '4px',
                              fontSize: '0.78rem',
                            }}
                          >
                            <Check size={14} /> Save
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        {/* Text Content */}
                        <div style={{ whiteSpace: 'pre-wrap' }}>{msg.message}</div>

                        {/* Metadata Row */}
                        <div className="elcasino-meta-info">
                          <span>
                            {new Date(msg.created_at).toLocaleTimeString([], {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                          {msg.is_edited && <span style={{ fontStyle: 'italic' }}>(edited)</span>}
                        </div>
                      </>
                    )}

                    {/* Inline Menu Trigger */}
                    {isSelf && editingMessageId !== msg.id && (
                      <div
                        style={{
                          position: 'absolute',
                          right: '6px',
                          top: '50%',
                          transform: 'translateY(-50%)',
                          opacity: activeMenuId === msg.id ? 1 : 0,
                          transition: 'opacity 0.2s ease',
                        }}
                        className="message-options-trigger"
                      >
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setActiveMenuId(activeMenuId === msg.id ? null : msg.id);
                          }}
                          style={{
                            background: 'transparent',
                            border: 'none',
                            color: 'rgba(255, 255, 255, 0.4)',
                            cursor: 'pointer',
                            padding: '4px',
                          }}
                        >
                          <MoreVertical size={16} />
                        </button>
                      </div>
                    )}

                    {/* Context Menu Dropdown */}
                    {activeMenuId === msg.id && (
                      <div
                        ref={menuRef}
                        style={{
                          position: 'absolute',
                          top: '100%',
                          right: isSelf ? 0 : 'auto',
                          left: isSelf ? 'auto' : 0,
                          background: '#1e293b',
                          border: '1px solid rgba(255, 255, 255, 0.1)',
                          borderRadius: '8px',
                          boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
                          zIndex: 10,
                          padding: '4px 0',
                          minWidth: '100px',
                          marginTop: '4px',
                        }}
                      >
                        <button
                          onClick={() => {
                            setEditingMessageId(msg.id);
                            setEditingText(msg.message);
                            setActiveMenuId(null);
                          }}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            width: '100%',
                            padding: '8px 12px',
                            background: 'transparent',
                            border: 'none',
                            color: '#cbd5e1',
                            fontSize: '0.8rem',
                            cursor: 'pointer',
                            textAlign: 'left',
                          }}
                        >
                          <Edit2 size={12} /> Edit
                        </button>
                        <button
                          onClick={() => handleDeleteMessage(msg.id)}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            width: '100%',
                            padding: '8px 12px',
                            background: 'transparent',
                            border: 'none',
                            color: '#ef4444',
                            fontSize: '0.8rem',
                            cursor: 'pointer',
                            textAlign: 'left',
                          }}
                        >
                          <Trash2 size={12} /> Delete
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Micro-Reactions Row */}
                  <div className="elcasino-reaction-container">
                    {/* Render Aggregated Active Reactions */}
                    {msg.reactions.map((react) => (
                      <button
                        key={react.emoji}
                        className={`elcasino-reaction-pill ${react.meReacted ? 'active-gold' : ''}`}
                        onClick={() => handleToggleReaction(msg.id, react.emoji)}
                      >
                        <span>{react.emoji}</span>
                        <span>{react.count}</span>
                      </button>
                    ))}

                    {/* Quick Add Reaction Button Tray Trigger */}
                    {editingMessageId !== msg.id && (
                      <div
                        style={{ display: 'flex', gap: '4px' }}
                        className="reaction-tray-hover"
                      >
                        {EMOJI_LIST.map((emoji) => {
                          const alreadyReacted = msg.reactions.find((r) => r.emoji === emoji)?.meReacted || false;
                          if (alreadyReacted) return null; // already in active pills

                          return (
                            <button
                              key={emoji}
                              className="elcasino-reaction-pill reaction-tray-emoji"
                              style={{ opacity: 0, padding: '2px 5px', fontSize: '0.7rem' }}
                              onClick={() => handleToggleReaction(msg.id, emoji)}
                            >
                              {emoji}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Input Action Bar */}
      <form className="elcasino-chat-input-bar" onSubmit={handleSendMessage}>
        <input
          type="text"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          placeholder="Send a message to El Casino..."
          className="elcasino-input-field"
          disabled={loading || connectionStatus !== 'SUBSCRIBED'}
          maxLength={4000}
        />
        <button
          type="submit"
          disabled={!inputText.trim() || loading || connectionStatus !== 'SUBSCRIBED'}
          style={{
            background: 'var(--accent)',
            border: 'none',
            borderRadius: '10px',
            width: '44px',
            height: '44px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#fff',
            cursor: 'pointer',
            opacity: inputText.trim() ? 1 : 0.45,
            transition: 'all 0.2s ease',
          }}
          title="Send"
        >
          <Send size={18} />
        </button>
      </form>
    </div>
  );
}
