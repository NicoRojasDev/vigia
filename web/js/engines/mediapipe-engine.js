/**
 * Modern engine: MediaPipe Face Landmarker (478 3D landmarks + blendshapes + head pose).
 * Motor moderno: MediaPipe Face Landmarker (478 puntos 3D + blendshapes + pose de cabeza).
 *
 * Runs fully on-device (WebAssembly / WebGL). Inference happens in the browser:
 * frames are never sent anywhere.
 * Corre en el dispositivo; los cuadros nunca se envían a ningún lado.
 *
 * Note: MediaPipe Tasks also tries to send anonymous *usage metrics* to Google.
 * Vigía's Content-Security-Policy (index.html) blocks that request on purpose.
 * See docs/en/privacy-and-legal.md.
 */
import { ASSETS } from '../config.js';
import {
  averageEAR,
  blendshapeMean,
  eulerFromMatrix,
  landmarksBox,
  LANDMARKS,
  mouthAspectRatio,
} from '../metrics.js';

export class MediaPipeEngine {
  constructor() {
    this.id = 'mediapipe';
    this.label = 'MediaPipe Face Landmarker';
    this.landmarker = null;
    this.delegate = null;
    this.lastTs = -1;
    this.contours = null;
  }

  async init(onStatus = () => {}) {
    onStatus('loading_library');
    const vision = await import(ASSETS.mediapipe.bundle);
    const { FaceLandmarker, FilesetResolver } = vision;
    const fileset = await FilesetResolver.forVisionTasks(ASSETS.mediapipe.wasm);

    const options = (delegate) => ({
      baseOptions: { modelAssetPath: ASSETS.mediapipe.model, delegate },
      runningMode: 'VIDEO',
      numFaces: 1,
      outputFaceBlendshapes: true,
      outputFacialTransformationMatrixes: true,
      minFaceDetectionConfidence: 0.5,
      minFacePresenceConfidence: 0.5,
      minTrackingConfidence: 0.5,
    });

    onStatus('loading_model');
    try {
      this.landmarker = await FaceLandmarker.createFromOptions(fileset, options('GPU'));
      this.delegate = 'GPU';
    } catch (err) {
      console.warn('[Vigía] GPU delegate failed, falling back to CPU', err);
      this.landmarker = await FaceLandmarker.createFromOptions(fileset, options('CPU'));
      this.delegate = 'CPU';
    }

    this.contours = {
      eyes: [...FaceLandmarker.FACE_LANDMARKS_LEFT_EYE, ...FaceLandmarker.FACE_LANDMARKS_RIGHT_EYE],
      lips: FaceLandmarker.FACE_LANDMARKS_LIPS,
      oval: FaceLandmarker.FACE_LANDMARKS_FACE_OVAL,
    };
  }

  /** Process the current video frame. Returns a face signal (see fatigue.js). */
  process(video, t) {
    if (!this.landmarker || video.readyState < 2) return null;
    // VIDEO mode requires strictly increasing timestamps.
    let ts = Math.round(t);
    if (ts <= this.lastTs) ts = this.lastTs + 1;
    this.lastTs = ts;

    const res = this.landmarker.detectForVideo(video, ts);
    const w = video.videoWidth;
    const h = video.videoHeight;
    const lm = res.faceLandmarks?.[0];
    if (!lm) return { t, engine: this.id, faceDetected: false };

    const cats = res.faceBlendshapes?.[0]?.categories ?? [];
    const pose = eulerFromMatrix(res.facialTransformationMatrixes?.[0]);
    return {
      t,
      engine: this.id,
      faceDetected: true,
      ear: averageEAR(lm, w, h),
      mar: mouthAspectRatio(lm, w, h),
      pitch: pose.pitch,
      yaw: pose.yaw,
      eyesVisible: null,
      blinkScore: blendshapeMean(cats, ['eyeBlinkLeft', 'eyeBlinkRight']),
      jawOpen: blendshapeMean(cats, ['jawOpen']),
      faceBox: landmarksBox(lm),
      // Kept only for drawing this frame; never recorded. / Solo para dibujar; no se guarda.
      landmarks: lm,
    };
  }

  /** Draw eye and lip contours on the overlay canvas. */
  drawOverlay(ctx, sig, snap, W, H) {
    if (!sig?.landmarks || !this.contours) return;
    const lm = sig.landmarks;
    const line = (conns, color, width) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.beginPath();
      for (const { start, end } of conns) {
        ctx.moveTo(lm[start].x * W, lm[start].y * H);
        ctx.lineTo(lm[end].x * W, lm[end].y * H);
      }
      ctx.stroke();
    };
    line(this.contours.oval, 'rgba(255,255,255,0.25)', 1);
    line(this.contours.eyes, snap?.eyeClosed ? '#ff5d5d' : '#4ade80', 2);
    line(this.contours.lips, '#60a5fa', 2);
    // Mark the 6 EAR points of each eye.
    ctx.fillStyle = '#fde047';
    for (const i of [...LANDMARKS.rightEye, ...LANDMARKS.leftEye]) {
      ctx.beginPath();
      ctx.arc(lm[i].x * W, lm[i].y * H, 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  dispose() {
    try {
      this.landmarker?.close();
    } catch {
      /* ignore */
    }
    this.landmarker = null;
  }
}
