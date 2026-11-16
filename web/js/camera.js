/**
 * Camera and screen helpers.
 * Ayudas para cámara y pantalla.
 *
 * The camera stream is attached to a <video> element and read frame by frame in
 * memory. It is never recorded, uploaded or saved.
 * El video de la cámara se lee cuadro a cuadro en memoria. Nunca se graba, sube ni guarda.
 */

export async function startCamera(video, { width = 640, height = 480 } = {}) {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error('camera_unsupported');
  }
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: {
      facingMode: 'user',
      width: { ideal: width },
      height: { ideal: height },
      frameRate: { ideal: 30, max: 30 },
    },
  });
  video.srcObject = stream;
  video.muted = true;
  video.playsInline = true;
  await video.play();
  // Wait until the first frame has real dimensions.
  if (!video.videoWidth) {
    await new Promise((resolve) => video.addEventListener('loadeddata', resolve, { once: true }));
  }
  return stream;
}

export function stopCamera(video, stream) {
  stream?.getTracks().forEach((track) => track.stop());
  if (video) video.srcObject = null;
}

/** Keep the screen on while monitoring (Screen Wake Lock API, where available). */
export class ScreenWakeLock {
  constructor() {
    this.sentinel = null;
    this.wanted = false;
    this.onVisibility = () => {
      if (this.wanted && document.visibilityState === 'visible') this.acquire();
    };
  }

  get supported() {
    return 'wakeLock' in navigator;
  }

  async acquire() {
    this.wanted = true;
    document.addEventListener('visibilitychange', this.onVisibility);
    if (!this.supported) return false;
    try {
      this.sentinel = await navigator.wakeLock.request('screen');
      return true;
    } catch {
      return false;
    }
  }

  async release() {
    this.wanted = false;
    document.removeEventListener('visibilitychange', this.onVisibility);
    try {
      await this.sentinel?.release();
    } catch {
      /* already released */
    }
    this.sentinel = null;
  }
}
