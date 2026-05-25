import { useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  AtSign,
  Camera,
  Check,
  Lock,
  LogOut,
  Send,
  Trash2,
  User,
  AlertTriangle,
} from 'lucide-react';
import { Participant } from '../types';
import { getAvatarColor } from '../lib/data';
import { supabase } from '../lib/supabase';

interface Props {
  participant: Participant;
  onProfileUpdated: (updated: Participant) => void;
  onBack: () => void;
  onLogout: () => void;
}

interface ProfileUiError {
  title: string;
  message: string;
  actionHint: string;
  technicalCode?: string;
}

const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_IMAGE_BYTES = 3 * 1024 * 1024;

function buildTechnicalCode(error: any, fallback: string): string {
  const code = error?.statusCode || error?.status || error?.code || error?.error || fallback;
  return String(code);
}

function classifyFileValidationError(file: File): ProfileUiError | null {
  if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
    return {
      title: 'Unsupported image format',
      message: `Selected file type "${file.type || 'unknown'}" is not supported.`,
      actionHint: 'Use JPG, PNG, or WebP only, then try again.',
      technicalCode: 'FILE_TYPE_NOT_ALLOWED',
    };
  }

  if (file.size > MAX_IMAGE_BYTES) {
    return {
      title: 'Image is too large',
      message: `Selected file is ${Math.ceil(file.size / (1024 * 1024))} MB.`,
      actionHint: 'Choose an image smaller than 3 MB and try again.',
      technicalCode: 'FILE_TOO_LARGE',
    };
  }

  return null;
}

function classifyStorageUploadError(uploadError: any): ProfileUiError {
  const rawMessage = String(uploadError?.message || '').toLowerCase();
  const technicalCode = buildTechnicalCode(uploadError, 'UPLOAD_FAILED');
  const statusCode = uploadError?.statusCode || uploadError?.status;

  if (
    rawMessage.includes('row level security') ||
    rawMessage.includes('permission') ||
    rawMessage.includes('not authorized') ||
    rawMessage.includes('forbidden') ||
    statusCode === 401 ||
    statusCode === 403
  ) {
    return {
      title: 'Upload permission blocked',
      message: 'Your account cannot upload images right now.',
      actionHint: 'Contact an administrator to check storage permissions (RLS/policies).',
      technicalCode,
    };
  }

  if (
    rawMessage.includes('bucket') &&
    (rawMessage.includes('not found') || rawMessage.includes('does not exist'))
  ) {
    return {
      title: 'Image service not configured',
      message: 'The avatar storage bucket is missing or misconfigured.',
      actionHint: 'Ask support/admin to configure the Supabase "avatars" storage bucket.',
      technicalCode,
    };
  }

  if (
    rawMessage.includes('network') ||
    rawMessage.includes('fetch') ||
    rawMessage.includes('timeout') ||
    rawMessage.includes('failed to fetch')
  ) {
    return {
      title: 'Connection issue during upload',
      message: 'We could not reach the image service while uploading your photo.',
      actionHint: 'Check your internet connection and retry.',
      technicalCode,
    };
  }

  if (
    rawMessage.includes('payload too large') ||
    statusCode === 413
  ) {
    return {
      title: 'Image is too large',
      message: 'The upload service rejected this file size.',
      actionHint: 'Use an image smaller than 3 MB and retry.',
      technicalCode,
    };
  }

  return {
    title: 'Image upload failed',
    message: 'We could not upload your photo due to an unexpected storage error.',
    actionHint: 'Try again. If the problem persists, contact support with the reference code.',
    technicalCode,
  };
}

function classifyProfileSaveError(saveError: any, hadImageUpload: boolean): ProfileUiError {
  const technicalCode = buildTechnicalCode(saveError, 'PROFILE_SAVE_FAILED');
  const rawMessage = String(saveError?.message || '').toLowerCase();

  if (rawMessage.includes('network') || rawMessage.includes('fetch') || rawMessage.includes('timeout')) {
    return {
      title: 'Connection issue while saving',
      message: hadImageUpload
        ? 'Your image may be uploaded, but profile details could not be saved due to a network issue.'
        : 'We could not save your profile due to a network issue.',
      actionHint: 'Check your connection and retry saving.',
      technicalCode,
    };
  }

  return {
    title: hadImageUpload ? 'Image uploaded, profile not saved' : 'Profile save failed',
    message: hadImageUpload
      ? 'Your photo upload finished, but profile details update did not complete.'
      : 'We could not update your profile details.',
    actionHint: 'Retry saving. If this keeps happening, contact support with the reference code.',
    technicalCode,
  };
}

export default function ProfileSettings({ participant, onProfileUpdated, onBack, onLogout }: Props) {
  const queryClient = useQueryClient();

  const [displayName, setDisplayName] = useState(participant.display_name || participant.name);
  const [telegram, setTelegram] = useState((participant.telegram_user || '').replace(/^@/, ''));
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileError, setProfileError] = useState<ProfileUiError | null>(null);
  const [profileSuccess, setProfileSuccess] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [sendingTest, setSendingTest] = useState(false);
  const [unlinking, setUnlinking] = useState(false);
  const [testSuccess, setTestSuccess] = useState(false);
  const [testError, setTestError] = useState('');

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

  const clearProfileFeedback = () => {
    setProfileError(null);
    setProfileSuccess(false);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const validationError = classifyFileValidationError(file);
    if (validationError) {
      setAvatarFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      setProfileError(validationError);
      return;
    }

    clearProfileFeedback();
    setAvatarFile(file);
    setAvatarPreview(URL.createObjectURL(file));
  };

  const handleSaveProfile = async () => {
    const trimmedName = displayName.trim();
    if (!trimmedName || trimmedName.length < 2 || trimmedName.length > 32) {
      setProfileError({
        title: 'Invalid display name',
        message: 'Display name must be between 2 and 32 characters.',
        actionHint: 'Update the name and try again.',
        technicalCode: 'DISPLAY_NAME_INVALID',
      });
      return;
    }

    const telegramClean = telegram.replace(/^@/, '').trim();
    if (telegramClean && !/^[a-zA-Z0-9_]{3,32}$/.test(telegramClean)) {
      setProfileError({
        title: 'Invalid Telegram username',
        message: 'Telegram username must be 3-32 characters using letters, numbers, or underscores.',
        actionHint: 'Remove spaces/special symbols and try again.',
        technicalCode: 'TELEGRAM_INVALID',
      });
      return;
    }

    setProfileSaving(true);
    clearProfileFeedback();

    let newPhotoUrl = participant.photo_url;
    let uploadedImage = false;

    if (avatarFile) {
      const ext = avatarFile.name.split('.').pop() || 'jpg';
      const path = `avatars/${participant.id}/${Date.now()}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(path, avatarFile, { upsert: true });

      if (uploadError) {
        console.error('[ProfileSettings] Storage upload failed:', uploadError);
        setProfileError(classifyStorageUploadError(uploadError));
        setProfileSaving(false);
        return;
      }

      uploadedImage = true;
      const { data: publicData } = supabase.storage.from('avatars').getPublicUrl(path);
      if (!publicData?.publicUrl) {
        setProfileError({
          title: 'Image link generation failed',
          message: 'Your image upload completed, but we could not generate a profile image URL.',
          actionHint: 'Retry saving. If it fails again, contact support.',
          technicalCode: 'PUBLIC_URL_MISSING',
        });
        setProfileSaving(false);
        return;
      }

      newPhotoUrl = publicData.publicUrl;
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
      console.error('[ProfileSettings] Participant update failed:', error);
      setProfileError(classifyProfileSaveError(error, uploadedImage));
      setProfileSaving(false);
      return;
    }

    localStorage.setItem('wc2026_user', JSON.stringify(data));
    queryClient.invalidateQueries({ queryKey: ['participants'] });
    queryClient.invalidateQueries({ queryKey: ['leaderboard'] });
    onProfileUpdated(data as Participant);
    setAvatarFile(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
    setAvatarPreview(null);
    setProfileSuccess(true);
    setTimeout(() => setProfileSuccess(false), 3000);
    setProfileSaving(false);
  };

  const handleSendTestMessage = async () => {
    if (!participant.telegram_chat_id) return;
    setSendingTest(true);
    setTestError('');
    setTestSuccess(false);
    try {
      const { data: wallet } = await supabase
        .from('wallets')
        .select('balance')
        .eq('participant_id', participant.id)
        .single();

      const balance = wallet ? wallet.balance : 1000000;
      const formattedBalance = new Intl.NumberFormat('en-US').format(Number(balance));

      const { data, error } = await supabase.functions.invoke('telegram-webhook', {
        body: {
          event: 'test',
          chat_id: participant.telegram_chat_id,
          data: {
            balance: formattedBalance
          }
        }
      });

      if (!error && data?.success) {
        setTestSuccess(true);
        setTimeout(() => setTestSuccess(false), 5000);
      } else {
        setTestError(error?.message || 'Failed to trigger message. Edge Function returned an error.');
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
      <div className="profile-header">
        <button className="profile-back-btn" onClick={onBack}>
          <ArrowLeft size={16} /> Back
        </button>
        <h2 className="profile-title">Profile Settings</h2>
      </div>

      <section className="profile-section">
        <h3 className="profile-section-title"><User size={13} /> Identity &amp; Contact</h3>

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

        <div className="profile-field">
          <label className="profile-label">Display Name</label>
          <input
            type="text"
            className="profile-input"
            value={displayName}
            onChange={(e) => {
              setDisplayName(e.target.value);
              clearProfileFeedback();
            }}
            maxLength={32}
            placeholder="Your name"
          />
        </div>

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
              onChange={(e) => {
                setTelegram(e.target.value.replace(/^@/, ''));
                clearProfileFeedback();
              }}
              maxLength={32}
              placeholder="username"
            />
          </div>
        </div>

        {profileError && (
          <div className="profile-error-card" role="alert" aria-live="polite">
            <div className="profile-error-header">
              <AlertTriangle size={16} />
              <span>{profileError.title}</span>
            </div>
            <p className="profile-error-message">{profileError.message}</p>
            <p className="profile-error-hint">{profileError.actionHint}</p>
            {profileError.technicalCode && (
              <p className="profile-error-code">Reference: {profileError.technicalCode}</p>
            )}
          </div>
        )}

        {profileSuccess && (
          <p className="profile-inline-success"><Check size={14} /> Profile saved successfully.</p>
        )}

        <button
          className="profile-save-btn"
          onClick={handleSaveProfile}
          disabled={profileSaving}
        >
          {profileSaving ? 'Saving...' : 'Save Profile'}
        </button>
      </section>

      <section className="profile-section">
        <h3 className="profile-section-title"><AtSign size={13} /> Telegram Notifications</h3>

        {participant.telegram_chat_id ? (
          <div className="telegram-linked-container">
            <div className="telegram-badge-active">
              <span className="live-pulse" style={{ width: 8, height: 8, background: '#01c752', display: 'inline-block', borderRadius: '50%', marginRight: 6 }} />
              Telegram Linked Successfully
            </div>
            <p className="telegram-desc-text">
              Your account is successfully paired with the bot. You are set to receive real-time goal scores, lock warnings, and payout details.
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
              Receive instant alerts for live goals, deadline warnings (1 hour before match locking), and prediction stake resolutions directly in Telegram.
            </p>

            <div className="telegram-pairing-instructions">
              <div className="pairing-step">
                <span className="step-num">1</span>
                <span>Click the button below to open <code>@WC2026_El_casino_bot</code> in Telegram.</span>
              </div>
              <div className="pairing-step">
                <span className="step-num">2</span>
                <span>Press the <b>Start</b> button at the bottom of the chat to securely pair your wallet.</span>
              </div>
            </div>

            <a
              href={`https://t.me/WC2026_El_casino_bot?start=${participant.id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-telegram-link"
            >
              Pair Telegram Bot
            </a>
          </div>
        )}
      </section>

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
            {pinSaving ? 'Updating...' : 'Change PIN'}
          </button>
        </section>
      )}

      <section className="profile-section profile-section-danger">
        <button className="profile-logout-btn" onClick={onLogout}>
          <LogOut size={16} /> Switch Player / Log Out
        </button>
      </section>
    </div>
  );
}
