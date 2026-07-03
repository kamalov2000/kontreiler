'use client'

import { useEffect, useState } from 'react'

// Живые часы по Москве для шапки доски на лендинге.
// Рендерится пустым до монтирования, чтобы не было расхождения гидратации.
export function LiveClock() {
  const [time, setTime] = useState('')

  useEffect(() => {
    const tick = () =>
      setTime(
        new Date().toLocaleTimeString('ru-RU', {
          timeZone: 'Europe/Moscow',
          hour: '2-digit',
          minute: '2-digit',
        })
      )
    tick()
    const id = setInterval(tick, 20000)
    return () => clearInterval(id)
  }, [])

  return (
    <span className="font-mono text-[11px] text-ink-3 tabular-nums">
      {time ? `${time} МСК` : ' '}
    </span>
  )
}
