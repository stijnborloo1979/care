/**
 * Een familielid fotografeert de wasmachine met een telefoon van twaalf
 * megapixel. Dat is zonde van de opslag en traag op de tablet van de
 * persoon, dus schalen we in de browser voor we uploaden.
 */
export async function compressImage(file: File, maxSize = 1600, quality = 0.82): Promise<Blob> {
  if (!file.type.startsWith('image/')) return file

  const bitmap = await createImageBitmap(file).catch(() => null)
  if (!bitmap) return file

  const schaal = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height))
  const breedte = Math.round(bitmap.width * schaal)
  const hoogte = Math.round(bitmap.height * schaal)

  const canvas = document.createElement('canvas')
  canvas.width = breedte
  canvas.height = hoogte
  const ctx = canvas.getContext('2d')
  if (!ctx) return file
  ctx.drawImage(bitmap, 0, 0, breedte, hoogte)
  bitmap.close()

  const type = canvas.toDataURL('image/webp', 0.5).startsWith('data:image/webp')
    ? 'image/webp'
    : 'image/jpeg'

  const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, type, quality))
  return blob ?? file
}

export function extensionForImage(mime: string): string {
  if (mime.includes('webp')) return 'webp'
  if (mime.includes('png')) return 'png'
  return 'jpg'
}
