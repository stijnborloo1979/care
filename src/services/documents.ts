import { supabase } from '../lib/supabase'
import { signedUrl } from '../lib/storage'

export type DocCategory = 'identiteit' | 'verzekering' | 'medisch' | 'afspraken' | 'belangrijk'

export const CATEGORIEEN: { waarde: DocCategory; label: string }[] = [
  { waarde: 'identiteit', label: 'Identiteit' },
  { waarde: 'verzekering', label: 'Verzekering' },
  { waarde: 'medisch', label: 'Medisch' },
  { waarde: 'afspraken', label: 'Afspraken' },
  { waarde: 'belangrijk', label: 'Belangrijk' },
]

export interface DocumentRow {
  id: string
  household_id: string
  category: DocCategory
  name: string
  storage_path: string | null
  created_at: string
}

const BUCKET = 'documents'

export async function getDocuments(householdId: string): Promise<DocumentRow[]> {
  const { data, error } = await supabase
    .from('document')
    .select('id, household_id, category, name, storage_path, created_at')
    .eq('household_id', householdId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as DocumentRow[]
}

/**
 * Eerst de rij, dan het bestand: zo staat er nooit een bestand in de
 * bucket waar geen enkele rij naar wijst en dat niemand nog terugvindt.
 */
export async function addDocument(p: {
  householdId: string
  category: DocCategory
  name: string
  file: File | null
}) {
  const { data, error } = await supabase
    .from('document')
    .insert({ household_id: p.householdId, category: p.category, name: p.name })
    .select('id')
    .single()
  if (error) throw error
  const id = (data as { id: string }).id

  if (!p.file) return id

  const ext = p.file.name.split('.').pop() || 'bin'
  const path = `${p.householdId}/${p.category}/${crypto.randomUUID()}.${ext}`

  const { error: upError } = await supabase.storage
    .from(BUCKET)
    .upload(path, p.file, { contentType: p.file.type || 'application/octet-stream' })
  if (upError) {
    await supabase.from('document').delete().eq('id', id)
    throw upError
  }

  const { error: updError } = await supabase
    .from('document')
    .update({ storage_path: path })
    .eq('id', id)
  if (updError) {
    await supabase.storage.from(BUCKET).remove([path])
    await supabase.from('document').delete().eq('id', id)
    throw updError
  }

  return id
}

export async function deleteDocument(doc: DocumentRow) {
  if (doc.storage_path) {
    await supabase.storage.from(BUCKET).remove([doc.storage_path])
  }
  const { error } = await supabase.from('document').delete().eq('id', doc.id)
  if (error) throw error
}

export async function openDocument(path: string) {
  return signedUrl(BUCKET, path, 300)
}
