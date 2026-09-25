import { randomUUID } from 'node:crypto'

export async function enqueueRealtimeEvent(
  connection,
  audienceType,
  audienceId,
  eventType,
  payload,
  ttlSeconds = 3600,
) {
  const safeTtl = Math.max(60, Math.min(86400, Number(ttlSeconds) || 3600))
  await connection.execute(
    `INSERT INTO realtime_events
       (event_key, audience_type, audience_id, event_type, payload, created_at, expires_at)
     VALUES (?, ?, ?, ?, ?, UTC_TIMESTAMP(6),
       DATE_ADD(UTC_TIMESTAMP(6), INTERVAL ? SECOND))`,
    [
      randomUUID(),
      audienceType,
      audienceId ?? null,
      eventType,
      JSON.stringify(payload ?? {}),
      safeTtl,
    ],
  )
}
