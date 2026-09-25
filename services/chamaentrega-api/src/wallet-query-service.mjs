function uuid(value, code) {
  const normalized = typeof value === 'string' ? value.trim() : ''
  const pattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
  if (!pattern.test(normalized)) {
    const error = new Error(code)
    error.statusCode = 400
    throw error
  }
  return normalized
}

export async function getStoreWalletSnapshot(pool, rawStoreId) {
  const storeId = uuid(rawStoreId, 'invalid_store_id')
  const [rows] = await pool.execute(
    `SELECT
       id,
       store_id,
       balance,
       reserved_balance,
       created_at,
       updated_at
     FROM store_wallets
     WHERE store_id = ?
     LIMIT 1`,
    [storeId],
  )

  const wallet = Array.isArray(rows) ? rows[0] : null
  if (!wallet) {
    return {
      storeId,
      walletId:null,
      balance:0,
      reservedBalance:0,
      availableBalance:0,
      updatedAt:null,
    }
  }

  const balance = Number(wallet.balance || 0)
  const reservedBalance = Number(wallet.reserved_balance || 0)

  return {
    storeId,
    walletId:wallet.id,
    balance,
    reservedBalance,
    availableBalance:Number(Math.max(balance - reservedBalance, 0).toFixed(2)),
    updatedAt:wallet.updated_at ? new Date(wallet.updated_at).toISOString() : null,
  }
}
