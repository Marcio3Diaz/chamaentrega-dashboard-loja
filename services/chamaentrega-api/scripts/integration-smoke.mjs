import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { createDatabase } from '../src/db.mjs'
import { createAvailableDelivery } from '../src/delivery-service.mjs'
import {
  acceptDelivery,
  rejectDelivery,
  advanceDeliveryStatus,
  cancelDelivery,
  recordDeliveryLocation,
  dispatchRouteToCourier,
} from '../src/delivery-command-service.mjs'
import { reviewCourierNetworkRequest } from '../src/courier-network-service.mjs'
import { listCourierAvailableOffers } from '../src/delivery-query-service.mjs'
import { listStoreCouriers } from '../src/courier-query-service.mjs'
import { getStoreWalletSnapshot } from '../src/wallet-query-service.mjs'
import {
  authenticateApiSession,
  createApiSession,
  requireDeliverySessionAccess,
  requireStoreSessionAccess,
  revokeApiSession,
} from '../src/auth-service.mjs'

const mysqlUrl = process.env.MYSQL_URL
if (!mysqlUrl) throw new Error('MYSQL_URL is required')

const pool = createDatabase({
  mysqlUrl,
  mysqlConnectionLimit: 4,
})

const ownerId = randomUUID()
const courierId = randomUUID()
const storeId = randomUUID()
const walletId = randomUUID()
const delivery1 = randomUUID()
const delivery2 = randomUUID()
const delivery3 = randomUUID()
const delivery4 = randomUUID()

async function scalar(sql, params = []) {
  const [rows] = await pool.execute(sql, params)
  return rows?.[0]
}

async function seed() {
  await pool.execute(
    `INSERT INTO profiles (id, role, full_name, created_at, updated_at)
     VALUES (?, 'store_owner', 'Migration Owner', UTC_TIMESTAMP(6), UTC_TIMESTAMP(6)),
            (?, 'courier', 'Migration Courier', UTC_TIMESTAMP(6), UTC_TIMESTAMP(6))`,
    [ownerId, courierId],
  )

  await pool.execute(
    `INSERT INTO stores (
       id, owner_id, name, address, is_active, moderation_status, created_at, updated_at
     ) VALUES (?, ?, 'Migration Test Store', 'Rua Teste, 100', TRUE, 'active', UTC_TIMESTAMP(6), UTC_TIMESTAMP(6))`,
    [storeId, ownerId],
  )

  await pool.execute(
    `INSERT INTO couriers (
       id, vehicle_type, is_online, is_available, rating, total_deliveries,
       moderation_status, created_at, updated_at
     ) VALUES (?, 'motorcycle', TRUE, TRUE, 5.00, 0, 'active', UTC_TIMESTAMP(6), UTC_TIMESTAMP(6))`,
    [courierId],
  )

  await pool.execute(
    `INSERT INTO store_wallets (
       id, store_id, balance, reserved_balance, created_at, updated_at
     ) VALUES (?, ?, 100.00, 0.00, UTC_TIMESTAMP(6), UTC_TIMESTAMP(6))`,
    [walletId, storeId],
  )

  await pool.execute(
    `INSERT INTO courier_store_networks (
       id, store_id, courier_id, status, requested_at, created_at, updated_at
     ) VALUES (?, ?, ?, 'pending', UTC_TIMESTAMP(6), UTC_TIMESTAMP(6), UTC_TIMESTAMP(6))`,
    [randomUUID(), storeId, courierId],
  )
}

function payload(deliveryId, fee) {
  return {
    deliveryId,
    storeId,
    targetCourierId: null,
    externalOrderId: null,
    pickupAddress: 'Rua Teste, 100',
    pickupLatitude: -22.89,
    pickupLongitude: -43.48,
    deliveryAddress: 'Rua Cliente, 200',
    deliveryLatitude: -22.90,
    deliveryLongitude: -43.49,
    deliveryFee: fee,
    pickupDistanceKm: 0.5,
    deliveryDistanceKm: 1.2,
    estimatedMinutes: 10,
    paymentMethod: 'already_paid',
    orderTotal: 50,
    customerName: 'Cliente MySQL',
    customerPhone: '(21) 99999-0000',
    customerNote: 'Smoke test',
    itemCount: 1,
    packageWeightKg: 1,
    secondsToAccept: 300,
  }
}

async function main() {
  try {
    await seed()

    const review = await reviewCourierNetworkRequest(
      pool,
      storeId,
      courierId,
      ownerId,
      'connected',
      'CI migration smoke test',
    )
    assert.equal(review.status, 'connected')

    const courierSnapshot = await listStoreCouriers(pool, storeId)
    assert.equal(courierSnapshot.connectedCount, 1)
    assert.equal(courierSnapshot.pendingCount, 0)
    assert.equal(courierSnapshot.connected[0]?.courierId, courierId)

    const ownerApiSession = await createApiSession(pool, {
      subjectId: ownerId,
      subjectRole: 'store_owner',
    }, 3600)
    const ownerSession = await authenticateApiSession(pool, ownerApiSession.token)
    assert.equal(ownerSession.subjectId, ownerId)
    assert.equal(ownerSession.subjectRole, 'store_owner')
    assert.ok(ownerSession.scopes.includes('realtime:connect'))
    assert.equal(await requireStoreSessionAccess(pool, ownerSession, storeId), storeId)

    const courierApiSession = await createApiSession(pool, {
      subjectId: courierId,
      subjectRole: 'courier',
    }, 3600)
    const courierSession = await authenticateApiSession(pool, courierApiSession.token)
    assert.equal(courierSession.subjectId, courierId)
    assert.equal(courierSession.subjectRole, 'courier')

    const created = await createAvailableDelivery(pool, payload(delivery1, 7.5), 'smoke-delivery-1')
    assert.equal(created.status, 'available')

    const walletSnapshot = await getStoreWalletSnapshot(pool, storeId)
    assert.equal(walletSnapshot.storeId, storeId)
    assert.ok(walletSnapshot.reservedBalance >= 7.5)
    assert.equal(
      Number((walletSnapshot.balance - walletSnapshot.reservedBalance).toFixed(2)),
      walletSnapshot.availableBalance,
    )

    const openOfferAccess = await requireDeliverySessionAccess(pool, courierSession, delivery1)
    assert.equal(openOfferAccess.id, delivery1)

    const availableOffers = await listCourierAvailableOffers(pool, courierId)
    assert.ok(availableOffers.offers.some(item => item.id === delivery1))
    assert.equal(
      availableOffers.offers.find(item => item.id === delivery1)?.customerPhone,
      null,
    )
    assert.equal(created.walletAvailableBefore, 100)
    assert.equal(created.walletAvailableAfter, 92.5)

    const replay = await createAvailableDelivery(pool, payload(delivery1, 7.5), 'smoke-delivery-1')
    assert.equal(replay.replayed, true)

    let wallet = await scalar(
      'SELECT balance, reserved_balance FROM store_wallets WHERE id = ?',
      [walletId],
    )
    assert.equal(Number(wallet.balance), 100)
    assert.equal(Number(wallet.reserved_balance), 7.5)

    const accepted = await acceptDelivery(pool, delivery1, courierId)
    assert.equal(accepted.status, 'accepted')
    assert.equal(accepted.activeDeliveries, 1)

    const location = await recordDeliveryLocation(
      pool,
      delivery1,
      courierId,
      -22.895,
      -43.485,
      15,
    )
    assert.equal(location.deliveryId, delivery1)

    for (const status of [
      'heading_to_pickup',
      'at_pickup',
      'heading_to_dropoff',
      'at_dropoff',
      'completed',
    ]) {
      const result = await advanceDeliveryStatus(pool, delivery1, courierId, status)
      assert.equal(result.status, status)
    }

    wallet = await scalar(
      'SELECT balance, reserved_balance FROM store_wallets WHERE id = ?',
      [walletId],
    )
    assert.equal(Number(wallet.balance), 92.5)
    assert.equal(Number(wallet.reserved_balance), 0)

    const captured = await scalar(
      'SELECT status FROM store_wallet_reservations WHERE delivery_id = ?',
      [delivery1],
    )
    assert.equal(captured.status, 'captured')

    const debit = await scalar(
      `SELECT COUNT(*) AS count
         FROM store_wallet_transactions
        WHERE reference_type = 'delivery' AND reference_id = ?
          AND transaction_type = 'delivery_payment' AND status = 'completed'`,
      [delivery1],
    )
    assert.equal(Number(debit.count), 1)

    await createAvailableDelivery(pool, payload(delivery2, 8.5), 'smoke-delivery-2')
    wallet = await scalar(
      'SELECT balance, reserved_balance FROM store_wallets WHERE id = ?',
      [walletId],
    )
    assert.equal(Number(wallet.reserved_balance), 8.5)

    const cancelled = await cancelDelivery(pool, delivery2, storeId, 'Smoke cancellation')
    assert.equal(cancelled.status, 'cancelled')

    wallet = await scalar(
      'SELECT balance, reserved_balance FROM store_wallets WHERE id = ?',
      [walletId],
    )
    assert.equal(Number(wallet.balance), 92.5)
    assert.equal(Number(wallet.reserved_balance), 0)

    for (const id of [delivery3, delivery4]) {
      await pool.execute(
        `INSERT INTO deliveries (
           id, store_id, status, pickup_address, delivery_address, delivery_fee,
           payment_method, item_count, seconds_to_accept, created_at, updated_at
         ) VALUES (?, ?, 'draft', 'Rua Teste, 100', 'Rua Rota, 300', 5.00,
           'already_paid', 1, 300, UTC_TIMESTAMP(6), UTC_TIMESTAMP(6))`,
        [id, storeId],
      )
    }

    const route = await dispatchRouteToCourier(
      pool,
      storeId,
      courierId,
      [delivery3, delivery4],
    )
    assert.equal(route.deliveryCount, 2)

    wallet = await scalar(
      'SELECT balance, reserved_balance FROM store_wallets WHERE id = ?',
      [walletId],
    )
    assert.equal(Number(wallet.reserved_balance), 10)

    const rejection = await rejectDelivery(pool, delivery3, courierId, 'Smoke reject')
    assert.equal(rejection.openedToNetwork, true)

    await cancelDelivery(pool, delivery3, storeId, 'Cleanup')
    await cancelDelivery(pool, delivery4, storeId, 'Cleanup')

    wallet = await scalar(
      'SELECT balance, reserved_balance FROM store_wallets WHERE id = ?',
      [walletId],
    )
    assert.equal(Number(wallet.balance), 92.5)
    assert.equal(Number(wallet.reserved_balance), 0)

    const history = await scalar(
      'SELECT COUNT(*) AS count FROM delivery_status_history WHERE delivery_id = ?',
      [delivery1],
    )
    assert.ok(Number(history.count) >= 6)

    const realtimeCount = await scalar(
      `SELECT COUNT(*) AS count
         FROM realtime_events
        WHERE audience_type IN ('store','courier')`,
    )
    assert.ok(Number(realtimeCount.count) >= 6)

    const revokedOwner = await revokeApiSession(pool, ownerApiSession.session.id, ownerId)
    assert.equal(revokedOwner.revoked, true)
    await assert.rejects(
      () => authenticateApiSession(pool, ownerApiSession.token),
      /session_revoked/,
    )

    console.log(JSON.stringify({
      ok: true,
      walletBalance: Number(wallet.balance),
      walletReserved: Number(wallet.reserved_balance),
      completedDelivery: delivery1,
      cancelledDelivery: delivery2,
      targetedRouteGroup: route.groupId,
      realtimeEvents: Number(realtimeCount.count),
      connectedCouriers: courierSnapshot.connectedCount,
      walletAvailable: walletSnapshot.availableBalance,
    }, null, 2))
  } finally {
    await pool.end()
  }
}

main().catch(error => {
  console.error('[integration-smoke] failed:', error)
  process.exit(1)
})
