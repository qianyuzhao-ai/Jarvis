export async function recordVideo() {
  const canvas = document.createElement('canvas');
  canvas.width = 16;
  canvas.height = 16;
  const ctx = canvas.getContext('2d')!;
  ctx.fillRect(0, 0, 16, 16);
  const stream = canvas.captureStream(5);
  const recorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp8' });
  const chunks: Blob[] = [];
  const done = new Promise<Blob>((resolve) => {
    recorder.ondataavailable = (e) => chunks.push(e.data);
    recorder.onstop = () => resolve(new Blob(chunks, { type: 'video/webm' }));
  });
  recorder.start();
  let frame = 0;
  const animation = setInterval(() => {
    ctx.fillStyle = frame++ % 2 ? '#206080' : '#802060';
    ctx.fillRect(0, 0, 16, 16);
  }, 50);
  await new Promise((r) => setTimeout(r, 900));
  clearInterval(animation);
  recorder.stop();
  const blob = await done;
  stream.getTracks().forEach((t) => t.stop());
  return Array.from(new Uint8Array(await blob.arrayBuffer()));
}
