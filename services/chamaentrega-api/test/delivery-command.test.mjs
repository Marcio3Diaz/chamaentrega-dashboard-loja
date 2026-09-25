import test from 'node:test'
import assert from 'node:assert/strict'
import {
  DeliveryCommandError,
  expectedNextDeliveryStatus,
} from '../src/delivery-command-service.mjs'

test('delivery progression follows the operational sequence', () => {
  assert.equal(expectedNextDeliveryStatus('accepted'), 'heading_to_pickup')
  assert.equal(expectedNextDeliveryStatus('heading_to_pickup'), 'at_pickup')
  assert.equal(expectedNextDeliveryStatus('at_pickup'), 'heading_to_dropoff')
  assert.equal(expectedNextDeliveryStatus('heading_to_dropoff'), 'at_dropoff')
  assert.equal(expectedNextDeliveryStatus('at_dropoff'), 'completed')
  assert.equal(expectedNextDeliveryStatus('completed'), null)
})

test('delivery command errors preserve HTTP status and details', () => {
  const error = new DeliveryCommandError('courier_capacity_reached', 409, {
    activeDeliveries: 3,
    limit: 3,
  })
  assert.equal(error.message, 'courier_capacity_reached')
  assert.equal(error.statusCode, 409)
  assert.deepEqual(error.details, { activeDeliveries: 3, limit: 3 })
})
