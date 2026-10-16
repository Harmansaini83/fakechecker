import { useEffect, useRef } from 'react';
import QrScanner from 'qr-scanner';

type Props = {
  onCode: (code: string) => void;
  onError: (kind: 'denied' | 'failed') => void;
};

export function Scanner({ onCode, onError }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    let handled = false;

    const scanner = new QrScanner(
      video,
      (result) => {
        if (handled) return;

        handled = true;
        scanner.stop();
        onCode(result.data);
      },
      {
        preferredCamera: 'environment',
        maxScansPerSecond: 5,
        highlightScanRegion: true,
        returnDetailedScanResult: true,
      }
    );

    scanner.start().catch((e: unknown) => {
      onError(
        /denied|NotAllowed|Permission/i.test(String(e))
          ? 'denied'
          : 'failed'
      );
    });

    return () => {
      scanner.destroy();
    };
  }, [onCode, onError]);

  return <video ref={videoRef} className="video" muted playsInline />;
}