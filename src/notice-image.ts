export const noticePhotoTypes = ['image/jpeg', 'image/png', 'image/webp'];
export const maxOriginalPhotoBytes = 20 * 1024 * 1024;
const maxUploadPhotoBytes = 2 * 1024 * 1024;
const maxPhotoEdge = 2048;

function encode(canvas: HTMLCanvasElement, type: string) {
  return new Promise<Blob | null>(resolve => canvas.toBlob(resolve, type, .84));
}

export async function prepareNoticePhoto(file: File, signal: AbortSignal) {
  const url = URL.createObjectURL(file);
  const image = new Image();
  const canvas = document.createElement('canvas');
  try {
    image.src = url;
    await image.decode();
    signal.throwIfAborted();
    const { naturalWidth: width, naturalHeight: height } = image;
    const longest = Math.max(width, height);
    if (!width || !height) throw new Error('Invalid image dimensions');
    if (longest <= maxPhotoEdge && file.size <= maxUploadPhotoBytes) return file;

    const context = canvas.getContext('2d');
    if (!context) throw new Error('Image editing unavailable');
    const initialScale = Math.min(1, maxPhotoEdge / longest);
    for (const factor of [1, .8, .65, .5]) {
      signal.throwIfAborted();
      canvas.width = Math.max(1, Math.round(width * initialScale * factor));
      canvas.height = Math.max(1, Math.round(height * initialScale * factor));
      context.imageSmoothingQuality = 'high';
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      let compressed = await encode(canvas, 'image/webp');
      signal.throwIfAborted();
      if (compressed?.type !== 'image/webp') {
        context.globalCompositeOperation = 'destination-over';
        context.fillStyle = '#fff';
        context.fillRect(0, 0, canvas.width, canvas.height);
        compressed = await encode(canvas, 'image/jpeg');
      }
      signal.throwIfAborted();
      if (!compressed?.size || compressed.size > maxUploadPhotoBytes || !['image/webp', 'image/jpeg'].includes(compressed.type)) continue;
      const extension = compressed.type === 'image/webp' ? 'webp' : 'jpg';
      const name = file.name.replace(/\.[^.]+$/, '') || '공지사진';
      return new File([compressed], `${name}.${extension}`, { type: compressed.type });
    }
    throw new Error('Image could not fit the upload limit');
  } finally {
    image.removeAttribute('src');
    URL.revokeObjectURL(url);
    canvas.width = 0;
    canvas.height = 0;
  }
}
