import { useEffect, useRef } from 'react';
import { Platform, StyleSheet, View } from 'react-native';

type Props = {
  stream: MediaStream | null;
  style?: object;
};

/** Fluid user-facing preview — no capture UI, just continuous video. */
export function LiveVideoPreview({ stream, style }: Props) {
  const hostRef = useRef<View>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    const node = hostRef.current as unknown as HTMLElement | null;
    if (!node) return;

    let video = videoRef.current;
    if (!video) {
      video = document.createElement('video');
      video.playsInline = true;
      video.muted = true;
      video.autoplay = true;
      video.setAttribute('playsinline', 'true');
      video.style.cssText =
        'width:100%;height:100%;object-fit:cover;background:#000;display:block;';
      node.appendChild(video);
      videoRef.current = video;
    }

    video.srcObject = stream;
    if (stream) {
      void video.play().catch(() => undefined);
    }

    return () => {
      if (video) video.srcObject = null;
    };
  }, [stream]);

  useEffect(() => {
    return () => {
      const video = videoRef.current;
      if (video) {
        video.srcObject = null;
        video.remove();
        videoRef.current = null;
      }
    };
  }, []);

  if (Platform.OS !== 'web') {
    return <View style={[styles.fill, style]} />;
  }

  return <View ref={hostRef as never} style={[styles.fill, style]} collapsable={false} />;
}

const styles = StyleSheet.create({
  fill: {
    ...StyleSheet.absoluteFill,
    backgroundColor: '#000',
    overflow: 'hidden',
  },
});
