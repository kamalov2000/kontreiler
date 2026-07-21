'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Upload, Trash2, FileText, FileSpreadsheet, Loader2, ChevronUp, ChevronDown, Paperclip } from 'lucide-react'
import { toast } from 'sonner'
import { formatDateTime } from '@/lib/utils'
import { cn } from '@/lib/utils'

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
  /** Меняется извне (напр. после сохранения ТН) — триггерит обновление списка/счётчика. */
  refreshSignal?: number
}

function formatBytes(bytes: number | null) {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} Б`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} КБ`
  return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`
}

// Тип файла по расширению — для метки и тонировки плитки
function fileMeta(name: string): { ext: string; isSheet: boolean } {
  const ext = (name.split('.').pop() || '').toUpperCase()
  const isSheet = ext === 'XLSX' || ext === 'XLS'
  return { ext, isSheet }
}

export function OrderDocuments({ orderId, currentUserId, canUpload, refreshSignal }: OrderDocumentsProps) {
  const [docs, setDocs] = useState<Document[]>([])
  const [loaded, setLoaded] = useState(false)
  const [open, setOpen] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  // Счётчик файлов — грузим сразу (не дожидаясь раскрытия), чтобы показать индикатор.
  const [count, setCount] = useState<number | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const loadDocs = useCallback(async () => {
    const supabase = createClient()
    const { data } = await supabase
      .from('order_documents')
      .select('*, uploader:users!uploaded_by(name)')
      .eq('order_id', orderId)
      .order('created_at', { ascending: false })
    const list = (data || []) as Document[]
    setDocs(list)
    setCount(list.length)
    setLoaded(true)
  }, [orderId])

  const loadCount = useCallback(async () => {
    const supabase = createClient()
    const { count: c } = await supabase
      .from('order_documents')
      .select('id', { count: 'exact', head: true })
      .eq('order_id', orderId)
    setCount(c ?? 0)
  }, [orderId])

  // Первичная загрузка счётчика + реакция на внешний сигнал обновления.
  useEffect(() => {
    if (open) loadDocs()
    else loadCount()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshSignal])

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
      setCount(c => (c ?? 0) + 1)
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
    setCount(c => Math.max(0, (c ?? 1) - 1))
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
    <div className="bg-surface rounded-card border border-hairline overflow-hidden mb-6">
      <button
        onClick={toggle}
        className="w-full flex items-center justify-between px-4 py-3.5 hover:bg-paper transition-colors"
      >
        <span className="flex items-center gap-2">
          <span className="text-[11.5px] font-semibold uppercase tracking-[0.06em] text-ink-3">Документы</span>
          {count != null && count > 0 && (
            <span className="inline-flex items-center gap-1 px-1.5 h-5 rounded-full bg-accent-soft text-accent font-mono tabular-nums text-[11px] font-semibold">
              <Paperclip size={11} strokeWidth={2} />{count}
            </span>
          )}
        </span>
        {open
          ? <ChevronUp size={16} className="text-ink-3" />
          : <ChevronDown size={16} className="text-ink-3" />}
      </button>

      {open && (
        <div className="px-4 pb-4 flex flex-col gap-2.5">
          {/* List */}
          {!loaded ? (
            <div className="py-4 flex justify-center">
              <Loader2 size={20} className="animate-spin text-ink-4" />
            </div>
          ) : docs.length === 0 ? (
            <p className="text-sm text-ink-4 text-center py-3">Документов пока нет</p>
          ) : (
            docs.map(doc => {
              const { ext, isSheet } = fileMeta(doc.file_name)
              return (
                <div key={doc.id} className="flex items-center gap-2.5 px-3 py-2.5 rounded-field border border-hairline bg-surface">
                  <span className={cn(
                    'w-8 h-8 rounded-field flex items-center justify-center shrink-0',
                    isSheet ? 'bg-success-soft' : 'bg-danger-soft'
                  )}>
                    {isSheet
                      ? <FileSpreadsheet size={16} className="text-success" />
                      : <FileText size={16} className="text-danger" />}
                  </span>
                  <div className="flex-1 min-w-0">
                    <button
                      onClick={() => handleDownload(doc)}
                      className="text-[13px] font-medium text-ink hover:text-accent truncate block text-left w-full"
                    >
                      {doc.file_name}
                    </button>
                    <div className="font-mono tabular-nums text-[11px] text-ink-4">
                      {ext} · {formatBytes(doc.file_size)} · {formatDateTime(doc.created_at)}
                    </div>
                  </div>
                  {doc.uploaded_by === currentUserId && (
                    <button
                      onClick={() => handleDelete(doc)}
                      disabled={deletingId === doc.id}
                      className="w-7 h-7 flex items-center justify-center rounded-field text-ink-4 hover:text-danger hover:bg-danger-soft transition-colors shrink-0"
                    >
                      {deletingId === doc.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={15} />}
                    </button>
                  )}
                </div>
              )
            })
          )}

          {/* Upload */}
          {canUpload && (
            <>
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
                className="flex flex-col items-center gap-1.5 p-[18px] rounded-field border border-dashed border-border-strong bg-paper text-center hover:border-accent hover:bg-accent-soft transition-colors w-full"
              >
                {uploading ? (
                  <>
                    <Loader2 size={20} className="animate-spin text-accent" />
                    <span className="text-[13px] text-ink-2">Загружается…</span>
                  </>
                ) : (
                  <>
                    <Upload size={20} className="text-accent" />
                    <span className="text-[13px] text-ink-2">
                      Перетащите файл или <span className="text-accent font-medium">выберите</span>
                    </span>
                    <span className="font-mono tabular-nums text-[11px] text-ink-4">PDF, JPG, XLSX · до 10 МБ</span>
                  </>
                )}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}
