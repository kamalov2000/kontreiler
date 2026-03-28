'use client'

export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <html lang="ru">
      <body>
        <div className="min-h-screen flex flex-col items-center justify-center p-8 text-center">
          <div className="text-4xl mb-4">⚠️</div>
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Что-то пошло не так</h2>
          <p className="text-gray-500 text-sm mb-6">Произошла непредвиденная ошибка</p>
          <button
            onClick={reset}
            className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700"
          >
            Попробовать снова
          </button>
        </div>
      </body>
    </html>
  )
}
