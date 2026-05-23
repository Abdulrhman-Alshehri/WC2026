import { useState, useRef } from 'react';
import { Participant } from '../types';
import { getAvatarColor } from '../lib/data';
import { supabase } from '../lib/supabase';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Camera, LogOut, User, AtSign, Lock, Check, Send, Trash2 } from 'lucide-react';

interface Props {
  participant: Participant;
  onProfileUpdated: (updated: Participant) => void;
  onBack: () => void;
  onLogout: () => void;
}

export default function ProfileSettings({ participant, onProfileUpdated, onBack, onLogout }: Props) {
  const queryClient = useQueryClient();

  // ── Profile fields ──────────────────────────────────────────
  const [displayName, setDisplayName] = useState(participant.display_name || participant.name);
  const [telegram, setTelegram] = useState((participant.telegram_user || '').replace(/^@/, ''));
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileError, setProfileError] = useState('');
  const [profileSuccess, setProfileSuccess] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // -- Telegram Staking Notification state variables
  const [sendingTest, setSendingTest] = useState(false);
  const [unlinking, setUnlinking] = useState(false);
  const [testSuccess, setTestSuccess] = useState(false);
  const [testError, setTestError] = useState('');

  // ── PIN fields ───────────────────────────────────────────────
  const [currentPin, setCurrentPin] = useState(['', '', '', '']);
  const [newPin, setNewPin] = useState(['', '', '', '']);
  const [confirmPin, setConfirmPin] = useState(['', '', '', '']);
  const [pinSaving, setPinSaving] = useState(false);
  const [pinError, setPinError] = useState('');
  const [pinSuccess, setPinSuccess] = useState(false);

  const currentPinRefs = useRef<(HTMLInputElement | null)[]>([]);
  const newPinRefs = useRef<(HTMLInputElement | null)[]>([]);
  const confirmPinRefs = useRef<(HTMLInputElement | null)[]>([]);

  const avatarColor = getAvatarColor(participant.name);
  const photoUrl = avatarPreview || participant.photo_url;

  // ── Avatar file handling ─────────────────────────────────────
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setProfileError('Please select a JPG, PNG, or WebP image.');
      return;
    }
    if (file.size > 3 * 1024 * 1024) {
      setProfileError('Image must be smaller than 3 MB.');
      return;
    }
    setAvatarFile(file);
    setAvatarPreview(URL.createObjectURL(file));
    setProfileError('');
  };

  // ── Save profile (identity + contact) ───────────────────────
  const handleSaveProfile = async () => {
    const trimmedName = displayName.trim();
    if (!trimmedName || trimmedName.length < 2 || trimmedName.length > 32) {
      setProfileError('Display name must be 2–32 characters.');
      return;
    }
    const telegramClean = telegram.replace(/^@/, '').trim();
    if (telegramClean && !/^[a-zA-Z0-9_]{3,32}$/.test(telegramClean)) {
      setProfileError('Telegram username must be 3–32 characters (letters, numbers, underscores).');
      return;
    }

    setProfileSaving(true);
    setProfileError('');

    let newPhotoUrl = participant.photo_url;

    if (avatarFile) {
      const ext = avatarFile.name.split('.').pop() || 'jpg';
      const path = `avatars/${participant.id}/${Date.now()}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(path, avatarFile, { upsert: true });

      if (uploadError) {
        setProfileError('Failed to upload image. Please try again.');
        setProfileSaving(false);
        return;
      }
      newPhotoUrl = supabase.storage.from('avatars').getPublicUrl(path).data.publicUrl;
    }

    const { data, error } = await supabase
      .from('participants')
      .update({
        display_name: trimmedName,
        telegram_user: telegramClean || null,
        photo_url: newPhotoUrl,
      })
      .eq('id', participant.id)
      .select()
      .single();

    if (error || !data) {
      setProfileError('Failed to save profile. Please try again.');
      setProfileSaving(false);
      return;
    }

    localStorage.setItem('wc2026_user', JSON.stringify(data));
    queryClient.invalidateQueries({ queryKey: ['participants'] });
    queryClient.invalidateQueries({ queryKey: ['leaderboard'] });
    onProfileUpdated(data as Participant);
    setAvatarFile(null);
    setAvatarPreview(null);
    setProfileSuccess(true);
    setTimeout(() => setProfileSuccess(false), 3000);
    setProfileSaving(false);
  };

  // -- Telegram Staking Handlers
  const handleSendTestMessage = async () => {
    if (!participant.telegram_chat_id) return;
    setSendingTest(true);
    setTestError('');
    setTestSuccess(false);
    try {
      // Fetch dynamic actual balance to show in test message
      const { data: wallet } = await supabase
        .from('wallets')
        .select('balance')
        .eq('participant_id', participant.id)
        .single();
        
      const balance = wallet ? wallet.balance : 1000000;
      const formattedBalance = new Intl.NumberFormat('en-US').format(Number(balance));

      const res = await fetch("https://api.telegram.org/bot8781107836:AAHncz26sC_UGey4U5_XNXFv6Peq-cox6rk/sendMessage", {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: Number(participant.telegram_chat_id),
          text: "🔔 *FWC 2026 Prediction Pool Notification Test*\n\nYour Telegram pairing is active and working perfectly! 🎉\n\n💰 *Current Balance:* \x60" + formattedBalance + " Coins\x60\n\nYou will receive alerts here for goal scores and predictions resolution! ⚽🤖",
          parse_mode: 'Markdown',
        }),
      });
      
      if (res.ok) {
        setTestSuccess(true);
        setTimeout(() => setTestSuccess(false), 5000);
      } else {
        setTestError('Failed to trigger message. Telegram API error.');
      }
    } catch (err) {
      setTestError('Failed to connect to Telegram API.');
    } finally {
      setSendingTest(false);
    }
  };

  const handleUnlinkTelegram = async () => {
    if (!window.confirm('Are you sure you want to unlink Telegram notifications?')) return;
    setUnlinking(true);
    try {
      const { error } = await supabase
        .from('participants')
        .update({
          telegram_chat_id: null,
          telegram_user: null,
        })
        .eq('id', participant.id);

      if (error) throw error;

      // Update local storage and app state
      const updated = { ...participant, telegram_chat_id: null, telegram_user: null };
      localStorage.setItem('wc2026_user', JSON.stringify(updated));
      queryClient.invalidateQueries({ queryKey: ['participants'] });
      onProfileUpdated(updated);
    } catch (err) {
      alert('Failed to unlink Telegram. Please try again.');
    } finally {
      setUnlinking(false);
    }
  };

  // ── PIN digit helpers ────────────────────────────────────────
  const handlePinDigit = (
    index: number,
    value: string,
    pinState: string[],
    setPinState: React.Dispatch<React.SetStateAction<string[]>>,
    refs: React.MutableRefObject<(HTMLInputElement | null)[]>
  ) => {
    if (!/^\d*$/.test(value)) return;
    const digit = value.slice(-1);
    const next = [...pinState];
    next[index] = digit;
    setPinState(next);
    if (digit && index < 3) refs.current[index + 1]?.focus();
    setPinError('');
  };

  const handlePinKeyDown = (
    index: number,
    e: React.KeyboardEvent,
    pinState: string[],
    refs: React.MutableRefObject<(HTMLInputElement | null)[]>
  ) => {
    if (e.key === 'Backspace' && !pinState[index] && index > 0) {
      refs.current[index - 1]?.focus();
    }
  };

  // ── Change PIN ───────────────────────────────────────────────
  const handleChangePIN = async () => {
    const current = currentPin.join('');
    const next = newPin.join('');
    const confirm = confirmPin.join('');

    if (current !== participant.pin) { setPinError('Incorrect current PIN.'); return; }
    if (next.length !== 4) { setPinError('New PIN must be 4 digits.'); return; }
    if (next === current) { setPinError('New PIN must be different from current PIN.'); return; }
    if (next !== confirm) { setPinError('New PINs do not match.'); return; }

    setPinSaving(true);
    setPinError('');

    const { error } = await supabase
      .from('participants')
      .update({ pin: next })
      .eq('id', participant.id);

    if (error) {
      setPinError('Failed to update PIN. Please try again.');
      setPinSaving(false);
      return;
    }

    const updated = { ...participant, pin: next };
    localStorage.setItem('wc2026_user', JSON.stringify(updated));
    onProfileUpdated(updated);
    setCurrentPin(['', '', '', '']);
    setNewPin(['', '', '', '']);
    setConfirmPin(['', '', '', '']);
    setPinSuccess(true);
    setTimeout(() => setPinSuccess(false), 3000);
    setPinSaving(false);
  };

  // ── Render a PIN row ─────────────────────────────────────────
  const renderPinRow = (
    label: string,
    pinState: string[],
    setPinState: React.Dispatch<React.SetStateAction<string[]>>,
    refs: React.MutableRefObject<(HTMLInputElement | null)[]>
  ) => (
    <div className="profile-pin-row">
      <span className="profile-pin-row-label">{label}</span>
      <div className="pin-inputs">
        {[0, 1, 2, 3].map((i) => (
          <input
            key={i}
            ref={(el) => { refs.current[i] = el; }}
            type="password"
            inputMode="numeric"
            maxLength={1}
            value={pinState[i]}
            onChange={(e) => handlePinDigit(i, e.target.value, pinState, setPinState, refs)}
            onKeyDown={(e) => handlePinKeyDown(i, e, pinState, refs)}
            className="pin-digit"
            disabled={pinSaving}
            autoComplete="off"
          />
        ))}
      </div>
    </div>
  );

  return (
    <div className="profile-page">
      {/* Header */}
      <div className="profile-header">
        <button className="profile-back-btn" onClick={onBack}>
          <ArrowLeft size={16} /> Back
        </button>
        <h2 className="profile-title">Profile Settings</h2>
      </div>

      {/* ── Identity & Contact ── */}
      <section className="profile-section">
        <h3 className="profile-section-title"><User size={13} /> Identity &amp; Contact</h3>

        {/* Avatar upload */}
        <div className="profile-avatar-upload">
          <div className="profile-avatar-preview" style={{ background: photoUrl ? undefined : avatarColor }}>
            {photoUrl
              ? <img src={photoUrl} alt={participant.name} />
              : <span>{participant.name.charAt(0).toUpperCase()}</span>}
          </div>
          <div className="profile-avatar-actions">
            <button className="profile-upload-btn" onClick={() => fileInputRef.current?.click()}>
              <Camera size={14} /> Change Photo
            </button>
            <span className="profile-upload-hint">JPG, PNG or WebP · max 3 MB</span>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={handleFileChange}
            style={{ display: 'none' }}
          />
        </div>

        {/* Display name */}
        <div className="profile-field">
          <label className="profile-label">Display Name</label>
          <input
            type="text"
            className="profile-input"
            value={displayName}
            onChange={(e) => { setDisplayName(e.target.value); setProfileError(''); }}
            maxLength={32}
            placeholder="Your name"
          />
        </div>

        {/* Telegram */}
        <div className="profile-field">
          <label className="profile-label">
            <AtSign size={12} style={{ verticalAlign: 'middle', marginRight: 4 }} />
            Telegram <span className="profile-label-optional">(optional)</span>
          </label>
          <div className="profile-input-prefix-wrap">
            <span className="profile-telegram-prefix">@</span>
            <input
              type="text"
              className="profile-input profile-input-prefixed"
              value={telegram}
              onChange={(e) => { setTelegram(e.target.value.replace(/^@/, '')); setProfileError(''); }}
              maxLength={32}
              placeholder="username"
            />
          </div>
        </div>

        {profileError && <p className="profile-inline-error">{profileError}</p>}
        {profileSuccess && (
          <p className="profile-inline-success"><Check size={14} /> Profile saved successfully.</p>
        )}

        <button
          className="profile-save-btn"
          onClick={handleSaveProfile}
          disabled={profileSaving}
        >
          {profileSaving ? 'Saving…' : 'Save Profile'}
        </button>
      </section>

      {/* ── Telegram Notifications ── */}
      <section className="profile-section">
        <h3 className="profile-section-title"><AtSign size={13} /> Telegram Notifications</h3>
        
        {participant.telegram_chat_id ? (
          <div className="telegram-linked-container">
            <div className="telegram-badge-active">
              <span className="live-pulse" style={{ width: 8, height: 8, background: '#01c752', display: 'inline-block', borderRadius: '50%', marginRight: 6 }} />
              Telegram Linked Successfully
            </div>
            <p className="telegram-desc-text">
              Your account is successfully paired with the bot. You are set to receive real-time goal scores, lock warnings, and payout details!
            </p>
            {participant.telegram_user && (
              <div className="telegram-meta-row">
                <span className="meta-label">Username: </span>
                <span className="meta-value">@{participant.telegram_user}</span>
              </div>
            )}
            
            <div className="telegram-btn-row">
              <button 
                onClick={handleSendTestMessage}
                disabled={sendingTest}
                className="btn-telegram-test"
              >
                <Send size={13} style={{ marginRight: 6 }} />
                {sendingTest ? 'Sending...' : 'Send Test Alert'}
              </button>
              <button 
                onClick={handleUnlinkTelegram}
                disabled={unlinking}
                className="btn-telegram-unlink"
              >
                <Trash2 size={13} style={{ marginRight: 6 }} />
                {unlinking ? 'Unlinking...' : 'Unlink Bot'}
              </button>
            </div>
            
            {testSuccess && <p className="profile-inline-success" style={{ marginTop: 12 }}><Check size={14} /> Test message sent! Check your Telegram app.</p>}
            {testError && <p className="profile-inline-error" style={{ marginTop: 12 }}>{testError}</p>}
          </div>
        ) : (
          <div className="telegram-unlinked-container">
            <p className="telegram-desc-text">
              Receive instant alerts for live goals, deadline warnings (1 hour before match locking), and prediction stake resolutions directly in Telegram!
            </p>
            
            <div className="telegram-pairing-instructions">
              <div className="pairing-step">
                <span className="step-num">1</span>
                <span>Click the button below to open `@WC2026_El_casino_bot` in Telegram.</span>
              </div>
              <div className="pairing-step">
                <span className="step-num">2</span>
                <span>Press the <b>Start</b> button at the bottom of the chat to securely pair your wallet!</span>
              </div>
            </div>

            <a 
              href={"https://t.me/WC2026_El_casino_bot?start=" + participant.id}
              target="_blank" 
              rel="noopener noreferrer"
              className="btn-telegram-link"
            >
              🤖 Pair Telegram Bot
            </a>
          </div>
        )}
      </section>

      {/* ── Change PIN ── */}
      {participant.pin && (
        <section className="profile-section">
          <h3 className="profile-section-title"><Lock size={13} /> Change PIN</h3>

          {renderPinRow('Current PIN', currentPin, setCurrentPin, currentPinRefs)}
          {renderPinRow('New PIN', newPin, setNewPin, newPinRefs)}
          {renderPinRow('Confirm New', confirmPin, setConfirmPin, confirmPinRefs)}

          {pinError && <p className="profile-inline-error">{pinError}</p>}
          {pinSuccess && (
            <p className="profile-inline-success"><Check size={14} /> PIN changed successfully.</p>
          )}

          <button
            className="profile-save-btn"
            onClick={handleChangePIN}
            disabled={
              pinSaving ||
              currentPin.join('').length !== 4 ||
              newPin.join('').length !== 4 ||
              confirmPin.join('').length !== 4
            }
          >
            {pinSaving ? 'Updating…' : 'Change PIN'}
          </button>
        </section>
      )}

      {/* ── Logout ── */}
      <section className="profile-section profile-section-danger">
        <button className="profile-logout-btn" onClick={onLogout}>
          <LogOut size={16} /> Switch Player / Log Out
        </button>
      </section>
    </div>
  );
}
