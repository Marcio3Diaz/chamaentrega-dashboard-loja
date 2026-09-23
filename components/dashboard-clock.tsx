'use client'

import { useEffect, useMemo, useState } from 'react'
import { Icon } from '@/components/icon'

function snapshot() {
  const now = new Date()
  const date = new Intl.DateTimeFormat('pt-BR', {
    weekday:'long',
    day:'2-digit',
    month:'long',
    timeZone:'America/Sao_Paulo',
  }).format(now)

  const time = new Intl.DateTimeFormat('pt-BR', {
    hour:'2-digit',
    minute:'2-digit',
    hour12:false,
    timeZone:'America/Sao_Paulo',
  }).format(now)

  return { date, time }
}

export function DashboardClock({ location = 'Rio de Janeiro - RJ' }: { location?: string }) {
  const initial = useMemo(snapshot,[])
  const [value,setValue] = useState(initial)

  useEffect(() => {
    const timer = window.setInterval(() => setValue(snapshot()),15000)
    return () => window.clearInterval(timer)
  },[])

  return (
    <div className="reference-clock-card">
      <small>{value.date}</small>
      <strong>{value.time}</strong>
      <span><Icon name="sun" size={17}/>{location}</span>
    </div>
  )
}
