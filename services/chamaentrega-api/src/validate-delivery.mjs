const PAYMENT_METHODS = new Set(['already_paid', 'cash', 'pix', 'card_on_delivery'])

function text(value, max, required = false) {
  const normalized = typeof value === 'string' ? value.trim() : ''
  if (required && !normalized) throw new Error('required_text')
  if (normalized.length > max) throw new Error('text_too_long')
  return normalized || null
}

function finite(value, { min = -Infinity, max = Infinity, required = false } = {}) {
  if (value === null || value === undefined || value === '') {
    if (required) throw new Error('required_number')
    return null
  }
  const n = Number(value)
  if (!Number.isFinite(n) || n < min || n > max) throw new Error('invalid_number')
  return n
}

function integer(value, { min = -Infinity, max = Infinity, fallback = null } = {}) {
  if (value === null || value === undefined || value === '') return fallback
  const n = Number(value)
  if (!Number.isInteger(n) || n < min || n > max) throw new Error('invalid_integer')
  return n
}

export function validateDeliveryInput(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('invalid_payload')
  }

  const paymentMethod = text(input.paymentMethod, 40) ?? 'already_paid'
  if (!PAYMENT_METHODS.has(paymentMethod)) throw new Error('invalid_payment_method')

  return {
    storeId: text(input.storeId, 36, true),
    targetCourierId: text(input.targetCourierId, 36),
    externalOrderId: text(input.externalOrderId, 255),
    pickupAddress: text(input.pickupAddress, 600, true),
    pickupLatitude: finite(input.pickupLatitude, { min: -90, max: 90 }),
    pickupLongitude: finite(input.pickupLongitude, { min: -180, max: 180 }),
    deliveryAddress: text(input.deliveryAddress, 600, true),
    deliveryLatitude: finite(input.deliveryLatitude, { min: -90, max: 90 }),
    deliveryLongitude: finite(input.deliveryLongitude, { min: -180, max: 180 }),
    deliveryFee: finite(input.deliveryFee, { min: 0.01, max: 999999.99, required: true }),
    pickupDistanceKm: finite(input.pickupDistanceKm, { min: 0, max: 9999 }),
    deliveryDistanceKm: finite(input.deliveryDistanceKm, { min: 0, max: 9999 }),
    estimatedMinutes: integer(input.estimatedMinutes, { min: 0, max: 24 * 60 }),
    paymentMethod,
    orderTotal: finite(input.orderTotal, { min: 0, max: 9999999 }),
    customerName: text(input.customerName, 255),
    customerPhone: text(input.customerPhone, 60),
    customerNote: text(input.customerNote, 4000),
    itemCount: integer(input.itemCount, { min: 1, max: 999, fallback: 1 }),
    packageWeightKg: finite(input.packageWeightKg, { min: 0, max: 9999 }),
    secondsToAccept: integer(input.secondsToAccept, { min: 10, max: 3600, fallback: 300 }),
  }
}
