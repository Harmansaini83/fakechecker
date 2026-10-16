import { useEffect, useRef } from 'react';
import QrScanner from 'qr-scanner';

type Props = { onCode: (code: string) => void; onError: (message: string) => void };

export function Scanner({ onCode, onError }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const onCodeRef = useRef(onCode);
  const onErrorRef = useRef(onError);
  onCodeRef.current = onCode;
  onErrorRef.current = onError;

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    let handled = false;

    const scanner = new QrScanner(
      video,
      (result) => {
        if (handled) return; // one decode = one API call
        handled = true;
        scanner.stop();
        onCodeRef.current(result.data);
      },
      { preferredCamera: 'environment', maxScansPerSecond: 5, highlightScanRegion: true, returnDetailedScanResult: true }
    );

    scanner.start().catch((e) => {
      const msg = String(e);
      onErrorRef.current(
        /denied|NotAllowed|Permission/i.test(msg)
          ? 'Camera permission was denied. Allow camera access in your browser, or type the code instead.'
          : 'Could not start the camera. Camera needs HTTPS (or localhost). You can type the code instead.'
      );
    });

    return () => scanner.destroy();
  }, []);

  return <video ref={videoRef} className="video" muted playsInline />;
}