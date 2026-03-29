'use client'

import { useState, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Paperclip, Upload, Trash2, FileText, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { formatDateTime } from '@/lib/utils'

interface Document {
  id: string
  file_name: string
  file_path: string
  file_size: number | null
  created_at: string
  uploaded_by: string
  uploader?: { name: string | null }
}

interface OrderDocumentsProps {
  orderId: string
  currentUserId: string
  canUpload: boolean
}

function formatBytes(bytes: number | null) {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} Б`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} КБ`
  return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`
}

export function OrderDocuments({ orderId, currentUserId, canUpload }: OrderDocumentsProps) {
  const [docs, setDocs] = useState<Document[]>([])
  const [loaded, setLoaded] = useState(false)
  const [open, setOpen] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  async function loadDocs() {
    const supabase = createClient()
    const { data } = await supabase
      .from('order_documents')
      .select('*, uploader:users!uploaded_by(name)')
      .eq('order_id', orderId)
      .order('created_at', { ascending: false })
    setDocs((data || []) as Document[])
    setLoaded(true)
  }

  function toggle() {
    if (!open && !loaded) loadDocs()
    setOpen(v => !v)
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 10 * 1024 * 1024) {
      toast.error('Файл слишком большой (макс. 10 МБ)')
      return
    }

    setUploading(true)
    const supabase = createClient()
    const ext = file.name.split('.').pop()
    const path = `${orderId}/${Date.now()}.${ext}`

    const { error: uploadError } = await supabase.storage
      .from('order-docs')
      .upload(path, file)

    if (uploadError) {
      toast.error('Ошибка загрузки файла')
      setUploading(false)
      return
    }

    const { data, error: dbError } = await supabase
      .from('order_documents')
      .insert({
        order_id: orderId,
        uploaded_by: currentUserId,
        file_name: file.name,
        file_path: path,
        file_size: file.size,
      })
      .select('*, uploader:users!uploaded_by(name)')
      .single()

    if (dbError) {
      toast.error('Ошибка сохранения записи')
    } else {
      setDocs(prev => [data as Document, ...prev])
      toast.success('Файл загружен')
    }
    setUploading(false)
    if (fileRef.current) fileRef.current.value = ''
  }

  async function handleDelete(doc: Document) {
    setDeletingId(doc.id)
    const supabase = createClient()
    await supabase.storage.from('order-docs').remove([doc.file_path])
    await supabase.from('order_documents').delete().eq('id', doc.id)
    setDocs(prev => prev.filter(d => d.id !== doc.id))
    toast.success('Файл удалён')
    setDeletingId(null)
  }

  async function handleDownload(doc: Document) {
    const supabase = createClient()
    const { data } = await supabase.storage
      .from('order-docs')
      .createSignedUrl(doc.file_path, 60)
    if (data?.signedUrl) {
      window.open(data.signedUrl, '_blank')
    } else {
      toast.error('Не удалось открыть файл')
    }
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden mb-6">
      <button
        onClick={toggle}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-2 font-semibold text-gray-900">
          <Paperclip size={16} className="text-gray-500" />
          Документы
          {loaded && docs.length > 0 && (
            <span className="text-xs font-normal text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
              {docs.length}
            </span>
          )}
        </div>
        <span className="text-xs text-gray-400">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="px-5 pb-5">
          {/* Upload */}
          {canUpload && (
            <div className="mb-4">
              <input
                ref={fileRef}
                type="file"
                accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.xlsx,.xls"
                className="hidden"
                onChange={handleUpload}
              />
              <button
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                className="flex items-center gap-2 px-4 py-2 rounded-lg border border-dashed border-gray-300 text-sm text-gray-600 hover:border-blue-400 hover:text-blue-600 transition-colors w-full justify-center"
              >
                {uploading ? (
                  <><Loader2 size={15} className="animate-spin" /> Загружается…</>
                ) : (
                  <><Upload size={15} /> Загрузить файл (PDF, Word, Excel, фото — до 10 МБ)</>
                )}
              </button>
            </div>
          )}

          {/* List */}
          {!loaded ? (
            <div className="py-4 flex justify-center">
              <Loader2 size={20} className="animate-spin text-gray-400" />
            </div>
          ) : docs.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-3">Документов пока нет</p>
          ) : (
            <div className="space-y-2">
              {docs.map(doc => (
                <div key={doc.id} className="flex items-center gap-3 p-3 rounded-xl bg-gray-50 border border-gray-100">
                  <FileText size={18} className="text-blue-500 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <button
                      onClick={() => handleDownload(doc)}
                      className="text-sm font-medium text-gray-900 hover:text-blue-600 truncate block text-left w-full"
                    >
                      {doc.file_name}
                    </button>
                    <div className="text-xs text-gray-400 mt-0.5">
                      {doc.uploader?.name} · {formatBytes(doc.file_size)} · {formatDateTime(doc.created_at)}
                    </div>
                  </div>
                  {doc.uploaded_by === currentUserId && (
                    <button
                      onClick={() => handleDelete(doc)}
                      disabled={deletingId === doc.id}
                      className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors shrink-0"
                    >
                      {deletingId === doc.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
