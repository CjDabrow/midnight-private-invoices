// Shared wiring: headless wallet, Midnight providers, and the compiled
// Private Invoices contract. Secrets come from .env and never leave this process.
import path from 'node:path'
import { createHash, randomBytes } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { CompiledContract } from '@midnight-ntwrk/compact-js'
import { getSeed, initWalletWithSeed, configureProviders, deriveMidnightAddress } from '../node_modules/@via-labs-tech/usdm-bridge/dist/midnight/wallet.js'
import { PROOF_SERVER_URL, USDM_TOKEN_COLOR, USDM_DECIMALS } from '../node_modules/@via-labs-tech/usdm-bridge/dist/config.js'
import { Contract, pureCircuits, ledger } from '../contract/managed/invoices/contract/index.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
export const ARTIFACTS_DIR = path.resolve(__dirname, '../contract/managed/invoices')
export const DEPLOYMENT_FILE = path.resolve(__dirname, '../deployment.json')
export const PRIVATE_STATE_ID = 'private-invoices'
export { pureCircuits, ledger, deriveMidnightAddress, USDM_TOKEN_COLOR, USDM_DECIMALS }

// The three contract witnesses read the invoice being proven from here. The
// values stay local: the circuit only proves knowledge of them.
const currentInvoice = { amount: 0n, payer: new Uint8Array(32), salt: new Uint8Array(32) }
export const setInvoiceWitness = ({ amount, payer, salt }) => Object.assign(currentInvoice, { amount, payer, salt })

export const witnesses = {
  invoiceAmount: ({ privateState }) => [privateState, currentInvoice.amount],
  invoicePayer: ({ privateState }) => [privateState, currentInvoice.payer],
  invoiceSalt: ({ privateState }) => [privateState, currentInvoice.salt],
}

export const compiledContract = CompiledContract.make('privateInvoices', Contract).pipe(
  CompiledContract.withWitnesses(witnesses),
  CompiledContract.withCompiledFileAssets(ARTIFACTS_DIR),
)

// Payer identity commitment input: a 32-byte digest of the payer's Midnight
// address. Deterministic for both parties, never posted in the clear.
export const payerId = (mnAddress) => new Uint8Array(createHash('sha256').update(mnAddress.trim()).digest())

export const newSalt = () => new Uint8Array(randomBytes(32))

export const usdmUnits = (amountStr) => {
  const [i, f = ''] = String(amountStr).split('.')
  return BigInt(i) * 10n ** BigInt(USDM_DECIMALS) + BigInt((f + '0'.repeat(USDM_DECIMALS)).slice(0, USDM_DECIMALS))
}

export const commitmentOf = (amountUnits, payerBytes, saltBytes) =>
  pureCircuits.commitmentOf(amountUnits, payerBytes, saltBytes)

export const hex = (u8) => Buffer.from(u8).toString('hex')
export const fromHex = (h) => new Uint8Array(Buffer.from(h.replace(/^0x/, ''), 'hex'))

export async function connect() {
  try {
    await fetch(PROOF_SERVER_URL, { signal: AbortSignal.timeout(5000) })
  } catch {
    throw new Error(`No Midnight proof server reachable at ${PROOF_SERVER_URL} — start it first.`)
  }
  const walletContext = await initWalletWithSeed(getSeed())
  const providers = await configureProviders(walletContext, ARTIFACTS_DIR)
  return { walletContext, providers }
}
