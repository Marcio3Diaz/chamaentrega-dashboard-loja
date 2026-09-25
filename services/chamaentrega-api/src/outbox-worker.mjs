import {
  buildNewDeliveryFcmMessage,
  decodeFirebaseServiceAccount,
  getFirebaseAccessToken,
  isTransientFcmResult,
  isUnregisteredFcmResult,
  sendFcmMessage,
} from './fcm.mjs'

async function claimEvents(pool, limit) {
  const connection = await pool.getConnection()
  try {
    await connection.beginTransaction()
    const [rows] = await connection.execute(
      `SELECT id, event_key, aggregate_id, event_type, payload, attempts
         FROM outbox_events
        WHERE status = 'pending' AND available_at <= UTC_TIMESTAMP(6)
        ORDER BY created_at
        LIMIT ${Number(limit)}
        FOR UPDATE SKIP LOCKED`,
    )
    if (!Array.isArray(rows) || rows.length === 0) {
      await connection.commit()
      return []
    }
    const ids = rows.map(row => row.id)
    const placeholders = ids.map(() => '?').join(',')
    await connection.execute(
      `UPDATE outbox_events
          SET status = 'processing', claimed_at = UTC_TIMESTAMP(6),
              attempts = attempts + 1, updated_at = UTC_TIMESTAMP(6)
        WHERE id IN (${placeholders})`,
      ids,
    )
    await connection.commit()
    return rows
  } catch (error) {
    try { await connection.rollback() } catch {}
    throw error
  } finally {
    connection.release()
  }
}

async function resolveStore(pool, storeId) {
  const [rows] = await pool.execute(
    'SELECT name, logo_url FROM stores WHERE id = ? LIMIT 1',
    [storeId],
  )
  const store = Array.isArray(rows) ? rows[0] : null
  return { name: store?.name || 'Loja parceira', logoUrl: store?.logo_url || '' }
}

async function resolveTokens(pool, payload, appPackage) {
  if (payload.targetCourierId) {
    const [rows] = await pool.execute(
      `SELECT id, token, courier_id, device_name
         FROM courier_push_tokens
        WHERE is_active = TRUE AND app_package = ? AND courier_id = ?`,
      [appPackage, payload.targetCourierId],
    )
    return Array.isArray(rows) ? rows : []
  }

  const [rows] = await pool.execute(
    `SELECT t.id, t.token, t.courier_id, t.device_name
       FROM courier_push_tokens t
       JOIN couriers c ON c.id = t.courier_id
      WHERE t.is_active = TRUE
        AND t.app_package = ?
        AND c.is_online = TRUE
        AND c.is_available = TRUE`,
    [appPackage],
  )
  return Array.isArray(rows) ? rows : []
}

async function reserveDispatch(pool, eventKey, tokenRow) {
  const [result] = await pool.execute(
    `INSERT IGNORE INTO courier_push_dispatches
       (event_key, token_id, courier_id, notification_type, sent_at)
     VALUES (?, ?, ?, 'new_delivery', UTC_TIMESTAMP(6))`,
    [eventKey, tokenRow.id, tokenRow.courier_id],
  )
  return Number(result?.affectedRows || 0) === 1
}

async function releaseDispatch(pool, eventKey, tokenId) {
  await pool.execute(
    `DELETE FROM courier_push_dispatches
      WHERE event_key = ? AND token_id = ? AND fcm_message_name IS NULL`,
    [eventKey, tokenId],
  )
}

async function markDispatchSent(pool, eventKey, tokenId, messageName) {
  await pool.execute(
    `UPDATE courier_push_dispatches
        SET fcm_message_name = ?
      WHERE event_key = ? AND token_id = ?`,
    [messageName, eventKey, tokenId],
  )
}

async function markProcessed(pool, eventId) {
  await pool.execute(
    `UPDATE outbox_events
        SET status = 'processed', processed_at = UTC_TIMESTAMP(6),
            last_error = NULL, updated_at = UTC_TIMESTAMP(6)
      WHERE id = ?`,
    [eventId],
  )
}

async function retryLater(pool, eventId, attempts, error) {
  const delaySeconds = Math.min(300, Math.max(5, 2 ** Math.min(Number(attempts || 1), 8)))
  await pool.execute(
    `UPDATE outbox_events
        SET status = 'pending', claimed_at = NULL,
            available_at = DATE_ADD(UTC_TIMESTAMP(6), INTERVAL ? SECOND),
            last_error = ?, updated_at = UTC_TIMESTAMP(6)
      WHERE id = ?`,
    [delaySeconds, String(error).slice(0, 4000), eventId],
  )
}

async function processDeliveryAvailable(pool, account, config, event) {
  const payload = typeof event.payload === 'string' ? JSON.parse(event.payload) : event.payload
  const store = await resolveStore(pool, payload.storeId)
  const tokens = await resolveTokens(pool, payload, config.courierAppPackage)

  if (tokens.length === 0) {
    await markProcessed(pool, event.id)
    return
  }

  const accessToken = await getFirebaseAccessToken(account)
  let transientFailure = null

  for (const tokenRow of tokens) {
    if (!tokenRow.token || String(tokenRow.token).length < 20) continue
    const reserved = await reserveDispatch(pool, event.event_key, tokenRow)
    if (!reserved) continue

    const message = buildNewDeliveryFcmMessage({
      token: tokenRow.token,
      deviceName: tokenRow.device_name || '',
      delivery: {
        deliveryId: payload.deliveryId,
        storeId: payload.storeId,
        deliveryFee: payload.deliveryFee,
        eventKey: event.event_key,
      },
      store,
    })

    let result = await sendFcmMessage(account, accessToken, message)
    if (isTransientFcmResult(result)) {
      await new Promise(resolve => setTimeout(resolve, 700))
      result = await sendFcmMessage(account, accessToken, message)
    }

    if (result.ok) {
      await markDispatchSent(pool, event.event_key, tokenRow.id, result.name)
      continue
    }

    await releaseDispatch(pool, event.event_key, tokenRow.id)
    if (isUnregisteredFcmResult(result)) {
      await pool.execute(
        'UPDATE courier_push_tokens SET is_active = FALSE, updated_at = UTC_TIMESTAMP(6) WHERE id = ?',
        [tokenRow.id],
      )
      continue
    }
    if (isTransientFcmResult(result)) transientFailure = result.error || `FCM ${result.status}`
  }

  if (transientFailure) {
    await retryLater(pool, event.id, Number(event.attempts || 0) + 1, transientFailure)
  } else {
    await markProcessed(pool, event.id)
  }
}

async function processEvent(pool, account, config, event) {
  if (event.event_type === 'delivery.available') {
    return processDeliveryAvailable(pool, account, config, event)
  }
  await markProcessed(pool, event.id)
}

export function startOutboxWorker({ pool, config }) {
  if (!config.fcmWorkerEnabled) return { stop() {} }
  const account = decodeFirebaseServiceAccount(config.firebaseServiceAccountBase64)
  let stopped = false
  let running = false

  const tick = async () => {
    if (stopped || running) return
    running = true
    try {
      const events = await claimEvents(pool, config.outboxBatchSize)
      for (const event of events) {
        try {
          await processEvent(pool, account, config, event)
        } catch (error) {
          await retryLater(pool, event.id, Number(event.attempts || 0) + 1, error?.message || error)
        }
      }
    } catch (error) {
      console.error('[chamaentrega-api] outbox worker error:', error)
    } finally {
      running = false
    }
  }

  const timer = setInterval(() => void tick(), config.outboxPollMs)
  timer.unref()
  void tick()

  return {
    stop() {
      stopped = true
      clearInterval(timer)
    },
  }
}
