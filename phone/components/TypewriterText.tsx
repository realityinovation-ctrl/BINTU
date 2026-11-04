import { useEffect, useRef, useState } from 'react';
import { Text, type TextStyle } from 'react-native';

type Props = {
  text: string;
  style?: TextStyle;
  cps?: number;
  animate?: boolean;
  onDone?: () => void;
};

/** Gemini-like progressive reveal — plain text, no bubble. */
export function TypewriterText({
  text,
  style,
  cps = 42,
  animate = true,
  onDone,
}: Props) {
  const [shown, setShown] = useState(animate ? '' : text);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  useEffect(() => {
    if (!animate) {
      setShown(text);
      onDoneRef.current?.();
      return;
    }
    setShown('');
    if (!text) {
      onDoneRef.current?.();
      return;
    }
    let i = 0;
    const step = Math.max(1, Math.floor(cps / 30));
    const delay = Math.max(12, Math.floor(1000 / cps));
    const timer = setInterval(() => {
      i = Math.min(text.length, i + step);
      setShown(text.slice(0, i));
      if (i >= text.length) {
        clearInterval(timer);
        onDoneRef.current?.();
      }
    }, delay);
    return () => clearInterval(timer);
  }, [animate, cps, text]);

  return <Text style={style}>{shown}</Text>;
}
