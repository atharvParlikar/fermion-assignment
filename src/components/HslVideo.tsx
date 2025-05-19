import Hls from 'hls.js';
import { useEffect, useRef } from 'react';

export function HLSPlayer({ src }: { src: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current && Hls.isSupported()) {
      const hls = new Hls({
        liveSyncDuration: 1,
        liveMaxLatencyDuration: 2
      });
      hls.loadSource(src);
      hls.attachMedia(videoRef.current);
      return () => hls.destroy();
    } else if (videoRef.current?.canPlayType('application/vnd.apple.mpegurl')) {
      videoRef.current.src = src;
    }
  }, [src]);


  return <video ref={videoRef} controls autoPlay muted playsInline className="w-full h-auto rounded" />;
}

