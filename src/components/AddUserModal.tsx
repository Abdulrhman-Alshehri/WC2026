import { useEffect, useRef, useState } from 'react';
import { Participant } from '../types';
import { supabase } from '../lib/supabase';

interface Props {
  isOpen: boolean;
  participants: Participant[];
  onClose: () => void;
  onCreated: (participant: Participant) => void;
}

const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_IMAGE_BYTES = 3 * 1024 * 1024;

function validateAvatarFile(file: File): string | null {
  if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
    return 'Unsupported image format. Please upload JPG, PNG, or WebP.';
  }

  if (file.size > MAX_IMAGE_BYTES) {
    return 'Avatar is too large. Please upload an image smaller than 3 MB.';
  }

  return null;
}

function classifyUploadError(uploadError: any): string {
  const rawMessage = String(uploadError?.message || '').toLowerCase();
  const rawStatus = String(uploadError?.statusCode || uploadError?.status || '');
  const rawCode = String(uploadError?.code || '');
  const detail = String(uploadError?.message || uploadError?.error || 'Unknown storage error');
  const reference = [rawCode, rawStatus].filter(Boolean).join('/') || 'N/A';

  if (
    rawMessage.includes('bucket not found') ||
    rawMessage.includes('bucket')
  ) {
    return `Avatar upload failed because the Supabase storage bucket "avatars" was not found. Ask your admin to create the "avatars" bucket (public) and allow uploads. Details: ${detail} (Ref: ${reference})`;
  }

  if (
    rawMessage.includes('row level security') ||
    rawMessage.includes('permission') ||
    rawMessage.includes('not authorized') ||
    rawMessage.includes('forbidden')
  ) {
    return `Avatar upload failed because storage permissions blocked this upload (RLS/policy). Ask your admin to allow uploads to the "avatars" bucket for your app role. Details: ${detail} (Ref: ${reference})`;
  }

  if (
    rawMessage.includes('network') ||
    rawMessage.includes('fetch') ||
    rawMessage.includes('timeout') ||
    rawMessage.includes('failed to fetch')
  ) {
    return `Avatar upload failed due to a network/connectivity issue. Please check your connection and try again. Details: ${detail} (Ref: ${reference})`;
  }

  return `Avatar upload failed due to a storage error. Details: ${detail} (Ref: ${reference})`;
}

function classifyInsertError(insertError: any): string {
  const code = String(insertError?.code || '');
  const rawMessage = String(insertError?.message || '').toLowerCase();

  if (code === '23505' || rawMessage.includes('duplicate key')) {
    return 'This username already exists. Please choose a different name.';
  }

  if (
    rawMessage.includes('row level security') ||
    rawMessage.includes('permission') ||
    rawMessage.includes('not authorized') ||
    rawMessage.includes('forbidden')
  ) {
    return 'User creation is blocked by database permissions. Please check participants table policies.';
  }

  if (
    rawMessage.includes('network') ||
    rawMessage.includes('fetch') ||
    rawMessage.includes('timeout') ||
    rawMessage.includes('failed to fetch')
  ) {
    return 'User creation failed due to a network issue. Please check your connection and try again.';
  }

  return 'Failed to create user. Please try again.';
}

export default function AddUserModal({ isOpen, participants, onClose, onCreated }: Props) {
  const [name, setName] = useState('');
  const [telegramUser, setTelegramUser] = useState('');
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    return () => {
      if (avatarPreview) URL.revokeObjectURL(avatarPreview);
    };
  }, [avatarPreview]);

  const resetForm = () => {
    if (avatarPreview) URL.revokeObjectURL(avatarPreview);
    setName('');
    setTelegramUser('');
    setPin('');
    setConfirmPin('');
    setAvatarFile(null);
    setAvatarPreview(null);
    setError('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleClose = () => {
    if (saving) return;
    resetForm();
    onClose();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const fileError = validateAvatarFile(file);
    if (fileError) {
      setError(fileError);
      return;
    }

    if (avatarPreview) URL.revokeObjectURL(avatarPreview);
    setAvatarFile(file);
    setAvatarPreview(URL.createObjectURL(file));
    setError('');
  };

  const handlePinChange = (value: string, confirm = false) => {
    const digits = value.replace(/\D/g, '').slice(0, 4);
    if (confirm) {
      setConfirmPin(digits);
    } else {
      setPin(digits);
    }
    setError('');
  };

  const validateBeforeSubmit = (): { cleanName: string; cleanTelegram: string } | null => {
    const cleanName = name.trim();
    const cleanTelegram = telegramUser.replace(/^@/, '').trim();

    if (!cleanName) {
      setError('Name is required.');
      return null;
    }

    const duplicateName = participants.some(
      (p) => p.name.trim().toLowerCase() === cleanName.toLowerCase()
    );
    if (duplicateName) {
      setError('This username already exists. Please choose a different name.');
      return null;
    }

    if (!cleanTelegram) {
      setError('Telegram username is required.');
      return null;
    }

    if (!/^[a-zA-Z0-9_]{3,32}$/.test(cleanTelegram)) {
      setError('Telegram username must be 3-32 characters using only letters, numbers, or underscores.');
      return null;
    }

    if (!/^\d{4}$/.test(pin)) {
      setError('PIN must be exactly 4 digits.');
      return null;
    }

    if (!/^\d{4}$/.test(confirmPin)) {
      setError('Please confirm your 4-digit PIN.');
      return null;
    }

    if (pin !== confirmPin) {
      setError('PINs do not match. Please re-enter both fields.');
      return null;
    }

    if (!avatarFile) {
      setError('Avatar image is required.');
      return null;
    }

    const fileError = validateAvatarFile(avatarFile);
    if (fileError) {
      setError(fileError);
      return null;
    }

    return { cleanName, cleanTelegram };
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;

    setError('');
    const validated = validateBeforeSubmit();
    if (!validated || !avatarFile) return;

    setSaving(true);

    const ext = avatarFile.name.split('.').pop() || 'jpg';
    const safeName = validated.cleanName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'user';
    const filePath = `avatars/new-users/${safeName}-${Date.now()}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from('avatars')
      .upload(filePath, avatarFile, { upsert: true });

    if (uploadError) {
      console.error('[AddUserModal] Avatar upload failed:', uploadError);
      setError(classifyUploadError(uploadError));
      setSaving(false);
      return;
    }

    const { data: publicData } = supabase.storage.from('avatars').getPublicUrl(filePath);
    if (!publicData?.publicUrl) {
      setError('Avatar upload completed, but public URL generation failed. Please try again.');
      setSaving(false);
      return;
    }

    const { data, error: insertError } = await supabase
      .from('participants')
      .insert({
        name: validated.cleanName,
        display_name: validated.cleanName,
        telegram_user: validated.cleanTelegram,
        photo_url: publicData.publicUrl,
        pin,
        is_active: true,
      })
      .select('id, name, display_name, photo_url, telegram_user, telegram_chat_id, pin, is_active, created_at')
      .single();

    if (insertError || !data) {
      setError(classifyInsertError(insertError));
      setSaving(false);
      return;
    }

    onCreated(data as Participant);
    resetForm();
    onClose();
    setSaving(false);
  };

  if (!isOpen) return null;

  const cleanTelegram = telegramUser.replace(/^@/, '').trim();
  const canSubmit =
    !saving &&
    name.trim().length > 0 &&
    cleanTelegram.length > 0 &&
    /^\d{4}$/.test(pin) &&
    /^\d{4}$/.test(confirmPin) &&
    pin === confirmPin &&
    !!avatarFile;

  return (
    <div className="identity-add-modal-overlay" onClick={handleClose}>
      <div className="identity-add-modal" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="identity-add-close" onClick={handleClose} disabled={saving}>
          &times;
        </button>

        <h3 className="identity-add-title">Add New User</h3>
        <p className="identity-add-subtitle">Create a new player profile</p>

        <form className="identity-add-form" onSubmit={handleSubmit}>
          <label className="identity-add-label">
            Name
            <input
              type="text"
              className="identity-add-input"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setError('');
              }}
              maxLength={32}
              placeholder="Enter name"
              disabled={saving}
            />
          </label>

          <label className="identity-add-label">
            Telegram Username
            <div className="identity-add-prefix-wrap">
              <span className="identity-add-prefix">@</span>
              <input
                type="text"
                className="identity-add-input identity-add-input-prefixed"
                value={telegramUser}
                onChange={(e) => {
                  setTelegramUser(e.target.value.replace(/^@/, ''));
                  setError('');
                }}
                maxLength={32}
                placeholder="username"
                disabled={saving}
              />
            </div>
          </label>

          <div className="identity-add-pin-grid">
            <label className="identity-add-label">
              PIN (4 digits)
              <input
                type="password"
                inputMode="numeric"
                className="identity-add-input"
                value={pin}
                onChange={(e) => handlePinChange(e.target.value, false)}
                maxLength={4}
                placeholder="0000"
                disabled={saving}
                autoComplete="off"
              />
            </label>

            <label className="identity-add-label">
              Confirm PIN
              <input
                type="password"
                inputMode="numeric"
                className="identity-add-input"
                value={confirmPin}
                onChange={(e) => handlePinChange(e.target.value, true)}
                maxLength={4}
                placeholder="0000"
                disabled={saving}
                autoComplete="off"
              />
            </label>
          </div>

          <label className="identity-add-label">
            Avatar Upload
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="identity-add-file"
              onChange={handleFileChange}
              disabled={saving}
            />
          </label>

          {avatarPreview && (
            <div className="identity-add-preview-row">
              <img src={avatarPreview} alt="Avatar preview" className="identity-add-preview" />
              <span className="identity-add-preview-name">{avatarFile?.name}</span>
            </div>
          )}

          {error && <p className="identity-add-error">{error}</p>}

          <button type="submit" className="identity-add-submit" disabled={!canSubmit}>
            {saving ? 'Creating...' : 'Create User'}
          </button>
        </form>
      </div>
    </div>
  );
}
