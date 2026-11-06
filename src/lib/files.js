// Shared helpers for document uploads.

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024 // 10MB
export const ALLOWED_EXTENSIONS = ['pdf', 'jpg', 'jpeg', 'png', 'webp']

// Supabase Storage keys must be ASCII / URL-safe. Hebrew and other characters
// are replaced; the original file.name is kept in the DB row for display.
export function safeStorageName(fileName) {
  const dotIdx   = fileName.lastIndexOf('.')
  const baseName = dotIdx > 0 ? fileName.slice(0, dotIdx) : fileName
  const extName  = dotIdx > 0 ? fileName.slice(dotIdx + 1) : ''
  const safeBase = baseName.replace(/[^\w.-]+/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '') || 'file'
  const safeExt  = extName.replace(/[^\w]+/g, '').toLowerCase()
  return safeExt ? `${safeBase}.${safeExt}` : safeBase
}

export function fileExtension(fileName) {
  const dotIdx = fileName.lastIndexOf('.')
  return dotIdx > 0 ? fileName.slice(dotIdx + 1).toLowerCase() : ''
}

// Returns a Hebrew error message, or null if the file is OK to upload.
export function validateUploadFile(file) {
  if (!ALLOWED_EXTENSIONS.includes(fileExtension(file.name))) {
    return 'סוג קובץ לא נתמך (PDF, JPG, PNG בלבד)'
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return 'הקובץ גדול מ-10MB'
  }
  return null
}
