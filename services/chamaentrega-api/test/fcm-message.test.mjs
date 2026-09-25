import test from 'node:test'
import assert from 'node:assert/strict'
import { buildNewDeliveryFcmMessage } from '../src/fcm.mjs'

test('builds the same new-delivery contract used by the courier app', () => {
  const result = buildNewDeliveryFcmMessage({
    token: 'x'.repeat(40),
    deviceName: 'android fullscreen-delivery-v1',
    delivery: {
      deliveryId: 'delivery-1',
      storeId: 'store-1',
      deliveryFee: 7.5,
      eventKey: 'delivery.available:delivery-1',
    },
    store: { name: 'Serafina Hamburgueria', logoUrl: 'https://example.test/logo.png' },
  })
  assert.equal(result.message.data.type, 'new_delivery')
  assert.equal(result.message.data.route, 'offers')
  assert.equal(result.message.android.priority, 'HIGH')
  assert.equal(result.message.android.notification.sound, 'chama_nova_entrega')
  assert.equal(result.message.notification, undefined)
})
