import { useState, useEffect } from 'react';
import { getTimeUntil } from '../lib/data';

interface Props {
  targetDate: string;
  label?: string;
}

export default function Countdown({ targetDate, label }: Props) {
  const [time, setTime] = useState(getTimeUntil(targetDate));

  useEffect(() => {
    const interval = setInterval(() => {
      setTime(getTimeUntil(targetDate));
    }, 1000);
    return () => clearInterval(interval);
  }, [targetDate]);

  const isExpired = time.days === 0 && time.hours === 0 && time.minutes === 0 && time.seconds === 0;
  const isUrgent = time.days === 0 && time.hours < 1;
  const isWarning = time.days === 0 && time.hours < 24;

  const urgencyClass = isExpired ? 'expired' : isUrgent ? 'urgent' : isWarning ? 'warning' : '';

  if (isExpired) {
    return (
      <div className={`countdown-container ${urgencyClass}`}>
        {label && <p className="countdown-label">{label}</p>}
        <div className="countdown-locked">LOCKED</div>
      </div>
    );
  }

  return (
    <div className={`countdown-container ${urgencyClass}`}>
      {label && <p className="countdown-label">{label}</p>}
      <div className="countdown-digits">
        <div className="countdown-segment">
          <span className="countdown-number">{String(time.days).padStart(2, '0')}</span>
          <span className="countdown-unit">DAYS</span>
        </div>
        <span className="countdown-separator">:</span>
        <div className="countdown-segment">
          <span className="countdown-number">{String(time.hours).padStart(2, '0')}</span>
          <span className="countdown-unit">HRS</span>
        </div>
        <span className="countdown-separator">:</span>
        <div className="countdown-segment">
          <span className="countdown-number">{String(time.minutes).padStart(2, '0')}</span>
          <span className="countdown-unit">MIN</span>
        </div>
        <span className="countdown-separator">:</span>
        <div className="countdown-segment">
          <span className="countdown-number">{String(time.seconds).padStart(2, '0')}</span>
          <span className="countdown-unit">SEC</span>
        </div>
      </div>
    </div>
  );
}
