// Nén ảnh phía client trước khi upload: resize về maxWidth và encode JPEG.
// Bỏ qua file không phải ảnh hoặc nhỏ hơn 500KB. Luôn resolve (lỗi thì trả file gốc).
export function compressImage(file, maxWidth = 1920, quality = 0.8) {
  return new Promise((resolve) => {
    if (!file.type.startsWith('image/') || file.size < 500 * 1024) { resolve(file); return; }
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxWidth / img.width);
      const canvas = document.createElement('canvas');
      canvas.width = img.width * scale;
      canvas.height = img.height * scale;
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((blob) => {
        resolve(blob ? new File([blob], file.name, { type: 'image/jpeg' }) : file);
      }, 'image/jpeg', quality);
    };
    img.onerror = () => resolve(file);
    img.src = URL.createObjectURL(file);
  });
}

export default compressImage;
