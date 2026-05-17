import { useState, useRef, useEffect } from 'react';
import { Participant } from '../types';
import { getAvatarColor } from '../lib/data';
import { supabase } from '../lib/supabase';

interface Props {
  participants: Participant[];
  onSelect: (participant: Participant) => void;
}

type Step = 'select' | 'pin-entry' | 'pin-setup';

export default function IdentitySelector({ participants, onSelect }: Props) {
  const [step, setStep] = useState<Step>('select');
  const [selectedUser, setSelectedUser] = useState<Participant | null>(null);
  const [pin, setPin] = useState(['', '', '', '']);
  const [confirmPin, setConfirmPin] = useState(['', '', '', '']);
  const [isConfirmStep, setIsConfirmStep] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const confirmRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    if (step === 'pin-entry' || step === 'pin-setup') {
      inputRefs.current[0]?.focus();
    }
  }, [step]);

  useEffect(() => {
    if (isConfirmStep) {
      confirmRefs.current[0]?.focus();
    }
  }, [isConfirmStep]);

  const handleCardClick = (participant: Participant) => {
    setSelectedUser(participant);
    setPin(['', '', '', '']);
    setConfirmPin(['', '', '', '']);
    setError('');
    setIsConfirmStep(false);

    if (participant.pin) {
      setStep('pin-entry');
    } else {
      setStep('pin-setup');
    }
  };

  const handlePinChange = (index: number, value: string, isConfirm: boolean) => {
    if (!/^\d*$/.test(value)) return;
    const digit = value.slice(-1);

    if (isConfirm) {
      const newPin = [...confirmPin];
      newPin[index] = digit;
      setConfirmPin(newPin);
      if (digit && index < 3) confirmRefs.current[index + 1]?.focus();
    } else {
      const newPin = [...pin];
      newPin[index] = digit;
      setPin(newPin);
      if (digit && index < 3) inputRefs.current[index + 1]?.focus();
    }
    setError('');
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent, isConfirm: boolean) => {
    if (e.key === 'Backspace') {
      if (isConfirm) {
        if (!confirmPin[index] && index > 0) confirmRefs.current[index - 1]?.focus();
      } else {
        if (!pin[index] && index > 0) inputRefs.current[index - 1]?.focus();
      }
    }
  };

  const handleVerifyPin = async () => {
    if (!selectedUser) return;
    const entered = pin.join('');
    if (entered.length !== 4) { setError('Enter all 4 digits'); return; }

    setLoading(true);
    if (entered === selectedUser.pin) {
      onSelect(selectedUser);
    } else {
      setError('Incorrect PIN. Try again.');
      setPin(['', '', '', '']);
      inputRefs.current[0]?.focus();
    }
    setLoading(false);
  };

  const handleSetupPin = async () => {
    if (!selectedUser) return;
    const entered = pin.join('');
    if (entered.length !== 4) { setError('Enter all 4 digits'); return; }

    if (!isConfirmStep) {
      setIsConfirmStep(true);
      setError('');
      return;
    }

    const confirmed = confirmPin.join('');
    if (confirmed.length !== 4) { setError('Enter all 4 digits'); return; }

    if (entered !== confirmed) {
      setError('PINs do not match. Try again.');
      setConfirmPin(['', '', '', '']);
      confirmRefs.current[0]?.focus();
      return;
    }

    setLoading(true);
    const { error: dbError } = await supabase
      .from('participants')
      .update({ pin: entered })
      .eq('id', selectedUser.id);

    if (dbError) {
      setError('Failed to save PIN. Try again.');
      setLoading(false);
      return;
    }

    const updatedUser = { ...selectedUser, pin: entered };
    onSelect(updatedUser);
    setLoading(false);
  };

  const handleBack = () => {
    setStep('select');
    setSelectedUser(null);
    setPin(['', '', '', '']);
    setConfirmPin(['', '', '', '']);
    setError('');
    setIsConfirmStep(false);
  };

  // Auto-submit when all 4 digits are entered
  useEffect(() => {
    const entered = pin.join('');
    if (entered.length === 4 && step === 'pin-entry') {
      handleVerifyPin();
    }
  }, [pin]);

  if (step === 'select') {
    return (
      <div className="identity-selector">
        <div className="identity-content">
          <div className="identity-header">
            <img src="/logo.jpg" alt="WC2026" className="identity-logo" />
            <h1 className="identity-title">WC 2026</h1>
            <p className="identity-subtitle">PREDICTION POOL</p>
            <p className="identity-desc">Select your identity to start predicting</p>
          </div>
          <div className="identity-grid">
            {participants.map((p) => {
              const color = getAvatarColor(p.name);
              return (
                <button key={p.id} className="identity-card" onClick={() => handleCardClick(p)}>
                  <div className="identity-avatar" style={{ background: color }}>
                    {p.photo_url ? <img src={p.photo_url} alt={p.name} /> : <span>{p.name.charAt(0).toUpperCase()}</span>}
                  </div>
                  <span className="identity-name">{p.display_name || p.name}</span>
                  <span className="identity-cta">Play as {p.display_name || p.name}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  // PIN entry or setup screen
  const isSetup = step === 'pin-setup';
  const title = isSetup
    ? (isConfirmStep ? 'Confirm your PIN' : 'Create your PIN')
    : 'Enter your PIN';
  const subtitle = isSetup
    ? (isConfirmStep ? 'Re-enter your 4-digit PIN to confirm' : 'Choose a 4-digit PIN to secure your account')
    : `Welcome back, ${selectedUser?.display_name || selectedUser?.name}`;

  return (
    <div className="identity-selector">
      <div className="identity-content">
        <button className="pin-back-btn" onClick={handleBack}>&larr; Back</button>

        <div className="pin-user-info">
          <div className="pin-avatar" style={{ background: getAvatarColor(selectedUser?.name || '') }}>
            {selectedUser?.photo_url
              ? <img src={selectedUser.photo_url} alt={selectedUser.name} />
              : <span>{selectedUser?.name.charAt(0).toUpperCase()}</span>}
          </div>
          <h2 className="pin-username">{selectedUser?.display_name || selectedUser?.name}</h2>
        </div>

        <h3 className="pin-title">{title}</h3>
        <p className="pin-subtitle">{subtitle}</p>

        <div className="pin-inputs">
          {[0, 1, 2, 3].map((i) => (
            <input
              key={`pin-${i}`}
              ref={(el) => { inputRefs.current[i] = el; }}
              type="password"
              inputMode="numeric"
              maxLength={1}
              value={pin[i]}
              onChange={(e) => handlePinChange(i, e.target.value, false)}
              onKeyDown={(e) => handleKeyDown(i, e, false)}
              className="pin-digit"
              disabled={loading || (isSetup && isConfirmStep)}
            />
          ))}
        </div>

        {isSetup && isConfirmStep && (
          <div className="pin-inputs" style={{ marginTop: '16px' }}>
            {[0, 1, 2, 3].map((i) => (
              <input
                key={`confirm-${i}`}
                ref={(el) => { confirmRefs.current[i] = el; }}
                type="password"
                inputMode="numeric"
                maxLength={1}
                value={confirmPin[i]}
                onChange={(e) => handlePinChange(i, e.target.value, true)}
                onKeyDown={(e) => handleKeyDown(i, e, true)}
                className="pin-digit"
                disabled={loading}
              />
            ))}
          </div>
        )}

        {error && <p className="pin-error">{error}</p>}

        {isSetup && (
          <button
            className="pin-submit-btn"
            onClick={handleSetupPin}
            disabled={loading || pin.join('').length !== 4 || (isConfirmStep && confirmPin.join('').length !== 4)}
          >
            {loading ? 'Saving...' : isConfirmStep ? 'Confirm & Enter' : 'Next'}
          </button>
        )}
      </div>
    </div>
  );
}
