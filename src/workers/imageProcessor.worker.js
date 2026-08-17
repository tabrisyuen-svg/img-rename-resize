self.onmessage = async ({ data }) => {
  const { id, type, buffer, size, fitBg, targetW } = data;
  console.log('Worker received:', type, size);
  try {
    const bitmap = await createImageBitmap(new Blob([buffer]));
    let canvas;

    if (type === 'resize') {
      canvas = new OffscreenCanvas(size.w, size.h);
      const ctx = canvas.getContext('2d');
      if (size.fit === 'contain') {
        ctx.fillStyle = fitBg;
        ctx.fillRect(0, 0, size.w, size.h);
        const scale = Math.min(size.w / bitmap.width, size.h / bitmap.height);
        const dw = bitmap.width * scale, dh = bitmap.height * scale;
        ctx.drawImage(bitmap, (size.w - dw) / 2, (size.h - dh) / 2, dw, dh);
      } else {
        const scale = Math.max(size.w / bitmap.width, size.h / bitmap.height);
        const dw = bitmap.width * scale, dh = bitmap.height * scale;
        ctx.drawImage(bitmap, (size.w - dw) / 2, (size.h - dh) / 2, dw, dh);
      }

    } else if (type === 'merge') {
      const scale = targetW / bitmap.width;
      const h = Math.round(bitmap.height * scale);
      canvas = new OffscreenCanvas(targetW, h);
      canvas.getContext('2d').drawImage(bitmap, 0, 0, targetW, h);

    } else if (type === 'thumbnail') {
      const THUMB = 200;
      const scale = Math.max(THUMB / bitmap.width, THUMB / bitmap.height);
      const dw = bitmap.width * scale, dh = bitmap.height * scale;
      canvas = new OffscreenCanvas(THUMB, THUMB);
      canvas.getContext('2d').drawImage(bitmap, (THUMB - dw) / 2, (THUMB - dh) / 2, dw, dh);
    }

    bitmap.close();
    const quality = type === 'thumbnail' ? 0.8 : 0.92;
    const resultBlob = await canvas.convertToBlob({ type: 'image/jpeg', quality });
    const resultBuffer = await resultBlob.arrayBuffer();
    self.postMessage({ id, ok: true, buffer: resultBuffer }, [resultBuffer]);
  } catch (err) {
    self.postMessage({ id, ok: false, error: err.message });
  }
};
