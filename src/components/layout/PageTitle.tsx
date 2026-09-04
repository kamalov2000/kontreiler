'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { setPageTitle, titleForPath } from '@/lib/page-titles'

/**
 * Подписывает вкладку браузера именем раздела. Живёт в AppLayout, поэтому
 * работает на всех рабочих страницах разом.
 *
 * Страница может уточнить заголовок сама (карточка заявки ставит её номер) —
 * её эффект отрабатывает после загрузки данных, то есть позже этого, и
 * перебивает общий заголовок раздела.
 */
export function PageTitle() {
  const pathname = usePathname()
  useEffect(() => {
    setPageTitle(titleForPath(pathname))
  }, [pathname])
  return null
}
