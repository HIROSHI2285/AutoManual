import { Muxer, ArrayBufferTarget } from 'mp4-muxer';

export async function createProxyVideo(
    file: File,
    onProgress?: (progress: number) => void
): Promise<File> {
    // 1. Basic WebCodecs Support Check
    if (typeof VideoEncoder === 'undefined' || typeof VideoFrame === 'undefined') {
        console.warn('WebCodecs API not supported. Falling back to original video upload.');
        return file;
    }

    return new Promise((resolve) => {
        let errorOccurred = false;

        const cleanupAndResolve = (result: File) => {
            if (errorOccurred) return; // Already resolved
            errorOccurred = true;
            resolve(result);
        };

        const video = document.createElement('video');
        video.src = URL.createObjectURL(file);
        video.muted = true;
        video.playsInline = true;

        video.onloadedmetadata = async () => {
            if (errorOccurred) return;
            const duration = video.duration;
            if (!duration || !isFinite(duration) || duration === 0) {
                return cleanupAndResolve(file);
            }

            // Target max 720p resolution for AI proxy
            let { videoWidth: w, videoHeight: h } = video;
            const MAX_DIM = 1280;
            if (w > MAX_DIM || h > MAX_DIM) {
                if (w > h) {
                    h = Math.round((h * MAX_DIM) / w);
                    w = MAX_DIM;
                } else {
                    w = Math.round((w * MAX_DIM) / h);
                    h = MAX_DIM;
                }
            }

            // VideoEncoder requires even dimensions typically
            w = w % 2 === 0 ? w : w + 1;
            h = h % 2 === 0 ? h : h + 1;

            // Target 10 FPS (extremely fast to process, perfectly fine for UI analysis)
            const fps = 10;
            const totalFrames = Math.floor(duration * fps);

            const canvas = document.createElement('canvas');
            canvas.width = w;
            canvas.height = h;
            const ctx = canvas.getContext('2d', { willReadFrequently: true });
            if (!ctx) return cleanupAndResolve(file);

            let muxer: Muxer<ArrayBufferTarget>;
            let videoEncoder: VideoEncoder;

            try {
                muxer = new Muxer({
                    target: new ArrayBufferTarget(),
                    video: { codec: 'avc', width: w, height: h },
                    fastStart: 'in-memory',
                    firstTimestampBehavior: 'offset' // Strict 0-start timestamps
                });

                videoEncoder = new VideoEncoder({
                    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
                    error: (e) => {
                        console.error('VideoEncoder error:', e);
                        cleanupAndResolve(file);
                    }
                });

                videoEncoder.configure({
                    codec: 'avc1.42E01F', // H.264 Baseline Profile Level 3.1 (supports up to 1280x720)
                    width: w,
                    height: h,
                    bitrate: 1_000_000,   // ~1 Mbps target bitrate (very high compression)
                    framerate: fps,
                });
            } catch (e) {
                console.warn('WebCodecs configuration failed, falling back:', e);
                return cleanupAndResolve(file);
            }

            let currentFrame = 0;

            const processNextFrame = () => {
                if (errorOccurred) return;

                if (currentFrame > totalFrames) {
                    finishEncoding();
                    return;
                }

                const targetTime = currentFrame / fps;

                const onSeeked = () => {
                    video.removeEventListener('seeked', onSeeked);
                    clearTimeout(timeoutId);

                    if (errorOccurred) return;

                    try {
                        ctx.drawImage(video, 0, 0, w, h);
                        const timestampUs = Math.round((currentFrame * 1_000_000) / fps);

                        const frame = new VideoFrame(canvas, { timestamp: timestampUs });

                        // Force a keyframe every 2 seconds
                        const keyFrame = currentFrame % (fps * 2) === 0;
                        videoEncoder.encode(frame, { keyFrame });
                        frame.close();

                        if (onProgress) onProgress(currentFrame / totalFrames);

                        currentFrame++;
                        // Process next frame on a new call stack to keep UI responsive
                        setTimeout(processNextFrame, 0);
                    } catch (e) {
                        console.error('Frame processing error:', e);
                        cleanupAndResolve(file);
                    }
                };

                // Fallback timeout in case seek fails
                const timeoutId = setTimeout(() => {
                    video.removeEventListener('seeked', onSeeked);
                    if (!errorOccurred) {
                        currentFrame++; // skip bad frame
                        processNextFrame();
                    }
                }, 1000);

                video.addEventListener('seeked', onSeeked);
                video.currentTime = targetTime;
            };

            const finishEncoding = async () => {
                try {
                    await videoEncoder.flush();
                    videoEncoder.close();
                    muxer.finalize();
                    const buffer = muxer.target.buffer;
                    // Provide original extension if possible or default to mp4
                    const originalNameNoExt = file.name.substring(0, file.name.lastIndexOf('.')) || 'proxy';
                    const proxyFile = new File([buffer], `proxy_${originalNameNoExt}.mp4`, { type: 'video/mp4' });
                    URL.revokeObjectURL(video.src);
                    cleanupAndResolve(proxyFile);
                } catch (e) {
                    console.error('Finalization error:', e);
                    cleanupAndResolve(file);
                }
            };

            processNextFrame();
        };

        video.onerror = () => cleanupAndResolve(file);
    });
}
