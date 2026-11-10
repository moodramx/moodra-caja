// Fotos de producto: se comprimen en el celular, se suben a un bucket privado
// y se guardan en IndexedDB para verse también sin señal.
import { useEffect, useState } from 'react'
import { db } from './offline/db'
import { uuidv7 } from './offline/uuid'
import { supabase } from './supabase'

const BUCKET = 'productos'

/** Reduce la imagen a máx. `maxPx` por lado y la convierte a WebP (~100–200 KB). */
export async function compressImage(file: Blob, maxPx = 1000, quality = 0.8): Promise<Blob> {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, maxPx / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/webp', quality),
  )
  // Safari viejo no exporta WebP: cae a JPEG.
  return (
    blob ??
    (await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (jpeg) => (jpeg ? resolve(jpeg) : reject(new Error('No se pudo procesar la foto'))),
        'image/jpeg',
        quality,
      ),
    ))
  )
}

/** Sube la foto de un producto y la deja asignada. Necesita internet. */
export async function uploadProductPhoto(productId: string, file: Blob): Promise<string> {
  const photo = await compressImage(file)
  const extension = photo.type === 'image/webp' ? 'webp' : 'jpg'
  const path = `${productId}/${uuidv7()}.${extension}`

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, photo, { contentType: photo.type })
  if (error)
    throw new Error(
      /fetch|network/i.test(error.message)
        ? 'Necesitas internet para subir la foto.'
        : error.message,
    )
  const { error: rpcError } = await supabase.rpc('set_product_photo', {
    p_product_id: productId,
    p_path: path,
  })
  if (rpcError) throw new Error(rpcError.message)

  await db.photos.put({ path, blob: photo })
  return path
}

const urls = new Map<string, string>()

/** URL local de una foto: de IndexedDB si ya se bajó; si no, la descarga una vez. */
export function usePhoto(path: string | null | undefined): string | null {
  const [url, setUrl] = useState<string | null>(path ? (urls.get(path) ?? null) : null)

  useEffect(() => {
    if (!path) return
    const known = urls.get(path)
    if (known) return
    let cancelled = false
    void (async () => {
      let blob = (await db.photos.get(path))?.blob
      if (!blob) {
        const { data } = await supabase.storage.from(BUCKET).download(path)
        if (!data) return // sin señal y sin copia local: se queda el emoji
        blob = data
        await db.photos.put({ path, blob })
      }
      const objectUrl = urls.get(path) ?? URL.createObjectURL(blob)
      urls.set(path, objectUrl)
      if (!cancelled) setUrl(objectUrl)
    })()
    return () => {
      cancelled = true
    }
  }, [path])

  return path ? (urls.get(path) ?? url) : null
}
