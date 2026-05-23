import { useState, useRef } from 'react';
import { Participant } from '../types';
import { getAvatarColor } from '../lib/data';
import { supabase } from '../lib/supabase';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Camera, LogOut, User, AtSign, Lock, Check } from 'lucide-react';

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
