import { useEffect, useState } from 'react';

interface DigitProps {
  value: string;
}

function Digit({ value }: DigitProps) {
  const [from, setFrom] = useState(value);
  const [to, setTo] = useState(value);
  const [animating, setAnimating] = useState(false);

  useEffect(() => {
    if (value === to) return;
    setFrom(to);
    setTo(value);
    setAnimating(true);
  }, [value, to]);

  return (
    <span style={{ overflow: 'hidden', height: '1em', display: 'inline-block', lineHeight: 1, verticalAlign: 'top' }}>
      <span
        style={{
          display: 'flex',
          flexDirection: 'column',
          transform: animating ? 'translateY(-50%)' : 'translateY(0)',
          transition: animating ? 'transform 0.4s ease' : 'none',
        }}
        onTransitionEnd={() => {
          setFrom(to);
          setAnimating(false);
        }}
      >
        <span style={{ height: '1em' }}>{from}</span>
        <span style={{ height: '1em' }}>{to}</span>
      </span>
    </span>
  );
}

interface AnimatedTimeProps {
  time: string;
}

export function AnimatedTime({ time }: AnimatedTimeProps) {
  return (
    <span style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--mantine-color-dimmed)', display: 'inline-flex', alignItems: 'center' }}>
      {time.split('').map((char, i) =>
        char === ':' ? (
          <span key={i} style={{ verticalAlign: 'top', lineHeight: 1 }}>{char}</span>
        ) : (
          <Digit key={i} value={char} />
        ),
      )}
    </span>
  );
}
