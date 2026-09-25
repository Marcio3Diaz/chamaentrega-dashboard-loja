import { expireAvailableDeliveries } from './delivery-command-service.mjs'

export function startMaintenanceWorker({ pool, config }) {
  if (!config.deliveryMaintenanceEnabled) return { stop() {} }

  let stopped = false
  let running = false

  const tick = async () => {
    if (stopped || running) return
    running = true
    try {
      const result = await expireAvailableDeliveries(pool, config.deliveryMaintenanceBatchSize)
      if (result.expiredCount > 0) {
        console.info('[chamaentrega-api] expired deliveries released', result)
      }
    } catch (error) {
      console.error('[chamaentrega-api] maintenance worker error:', error)
    } finally {
      running = false
    }
  }

  const timer = setInterval(() => void tick(), config.deliveryMaintenancePollMs)
  timer.unref()
  void tick()

  return {
    stop() {
      stopped = true
      clearInterval(timer)
    },
  }
}
