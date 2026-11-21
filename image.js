// Reduz a foto antes do envio (economiza o 1 GB gratuito do Storage)
export async function compressImage(file, maxSide = 1280, quality = 0.72) {
  const url = URL.createObjectURL(file);
  const img = new Image();
  await new Promise((ok, fail) => {
    img.onload = ok;
    img.onerror = () => fail(new Error('Arquivo de imagem inválido'));
    img.src = url;
  });
  URL.revokeObjectURL(url);
  const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(img.naturalWidth * scale);
  canvas.height = Math.round(img.naturalHeight * scale);
  canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
  return new Promise((ok, fail) =>
    canvas.toBlob((b) => (b ? ok(b) : fail(new Error('Não foi possível processar a foto'))), 'image/jpeg', quality));
}
