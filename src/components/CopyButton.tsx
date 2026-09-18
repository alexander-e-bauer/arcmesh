import { useEffect, useRef, useState } from 'react';

interface CopyButtonProps {
  text: string;
}

type Status = 'idle' | 'copied' | 'failed';

const LABELS: Record<Status, string> = {
  idle: 'Copy CSS',
  copied: 'Copied',
  failed: 'Copy failed',
};

export function CopyButton({ text }: CopyButtonProps) {
  const [status, setStatus] = useState<Status>('idle');
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  async function copy() {
    // The clipboard API is missing on insecure origins and rejects without
    // user activation. Either way the button says so instead of going quiet.
    try {
      await navigator.clipboard.writeText(text);
      setStatus('copied');
    } catch {
      setStatus('failed');
    }
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setStatus('idle'), 1500);
  }

  return (
    <button type="button" onClick={copy}>
      {LABELS[status]}
    </button>
  );
}
