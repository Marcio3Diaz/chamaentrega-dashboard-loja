import test from 'node:test'
import assert from 'node:assert/strict'
import { validateDeliveryInput } from '../src/validate-delivery.mjs'

const base = {
  storeId: 'ccf7d7f0-eac9-49fd-b054-37e40018d559',
  pickupAddress: 'Rua da loja, 100',
  deliveryAddress: 'Rua do cliente, 200',
  deliveryFee: 7.5,
}

test('normalizes a valid delivery', () => {
  const value = validateDeliveryInput(base)
  assert.equal(value.deliveryFee, 7.5)
  assert.equal(value.itemCount, 1)
  assert.equal(value.paymentMethod, 'already_paid')
  assert.equal(value.secondsToAccept, 300)
})

test('rejects invalid coordinates', () => {
  assert.throws(
    () => validateDeliveryInput({ ...base, deliveryLatitude: -120 }),
    /invalid_number/,
  )
})

test('rejects unsupported payment methods', () => {
  assert.throws(
    () => validateDeliveryInput({ ...base, paymentMethod: 'crypto' }),
    /invalid_payment_method/,
  )
})


test('keeps a supplied delivery UUID for shadow-write parity', () => {
  const deliveryId = '4f420612-7f8f-48a8-ac59-66858e813069'
  const value = validateDeliveryInput({ ...base, deliveryId })
  assert.equal(value.deliveryId, deliveryId)
})

test('rejects malformed store UUIDs', () => {
  assert.throws(
    () => validateDeliveryInput({ ...base, storeId: 'not-a-uuid' }),
    /invalid_store_id/,
  )
})
