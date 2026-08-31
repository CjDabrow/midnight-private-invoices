// Private Invoices CLI.
//
//   node src/cli.mjs create <amount-usdm> <payer-mn-address>   merchant: register invoice
//   node src/cli.mjs pay <invoice-file> <merchant-mn-address>  payer: send USDM (app layer)
//   node src/cli.mjs settle <invoice-file>                     prove + mark settled (ZK)
//   node src/cli.mjs status                                    public contract state
//
// The invoice file is the private channel between merchant and payer — share it
// off-chain. The chain only ever sees the 32-byte commitment and a settled flag.
import fs from 'node:fs'
import * as Rx from 'rxjs'
import { submitCallTxAsync } from '@midnight-ntwrk/midnight-js-contracts'
import {
  connect, compiledContract, ledger, PRIVATE_STATE_ID, DEPLOYMENT_FILE,
  payerId, newSalt, usdmUnits, commitmentOf, setInvoiceWitness, hex, fromHex,
  USDM_TOKEN_COLOR, USDM_DECIMALS,
} from './lib.mjs'

const [, , cmd, ...args] = process.argv
const deployment = () => JSON.parse(fs.readFileSync(DEPLOYMENT_FILE, 'utf8'))

const call = async (circuitId, callArgs) => {
  const { walletContext, providers } = await connect()
  try {
    const { txId } = await submitCallTxAsync(providers, {
      compiledContract,
      circuitId,
      contractAddress: deployment().contractAddress,
      privateStateId: PRIVATE_STATE_ID,
      args: callArgs,
    })
    console.log(`${circuitId} tx:`, txId)
    return txId
  } finally {
    await walletContext.wallet.stop()
  }
}

if (cmd === 'create') {
  const [amount, payerAddr] = args
  if (!amount || !payerAddr) throw new Error('usage: create <amount-usdm> <payer-mn-address>')
  const inv = { amount: String(amount), payer: payerAddr, salt: hex(newSalt()) }
  const commitment = commitmentOf(usdmUnits(inv.amount), payerId(inv.payer), fromHex(inv.salt))
  inv.commitment = hex(commitment)
  const file = `invoice-${inv.commitment.slice(0, 8)}.json`
  fs.writeFileSync(file, JSON.stringify(inv, null, 2))
  console.log(`Invoice written to ${file} — share it with the payer OFF-chain.`)
  console.log('On-chain commitment:', inv.commitment)
  await call('createInvoice', [commitment])
} else if (cmd === 'pay') {
  const [file, merchantAddr] = args
  if (!file || !merchantAddr) throw new Error('usage: pay <invoice-file> <merchant-mn-address>')
  const inv = JSON.parse(fs.readFileSync(file, 'utf8'))
  const { walletContext } = await connect()
  const { wallet, shieldedSecretKeys, dustSecretKey, unshieldedKeystore } = walletContext
  const { UnshieldedAddress, MidnightBech32m } = await import('@midnight-ntwrk/wallet-sdk-address-format')
  const receiver = UnshieldedAddress.codec.decode('preview', MidnightBech32m.parse(merchantAddr))
  const recipe = await wallet.transferTransaction(
    [{ type: 'unshielded', outputs: [{ type: USDM_TOKEN_COLOR, receiverAddress: receiver, amount: usdmUnits(inv.amount) }] }],
    { shieldedSecretKeys, dustSecretKey },
    { ttl: new Date(Date.now() + 30 * 60 * 1000) },
  )
  const signed = await wallet.signRecipe(recipe, (payload) => unshieldedKeystore.signData(payload))
  const finalized = await wallet.finalizeRecipe(signed)
  const txId = await wallet.submitTransaction(finalized)
  console.log(`Paid ${inv.amount} USDM to ${merchantAddr}`)
  console.log('Payment tx:', txId)
  await wallet.stop()
} else if (cmd === 'settle') {
  const [file] = args
  if (!file) throw new Error('usage: settle <invoice-file>')
  const inv = JSON.parse(fs.readFileSync(file, 'utf8'))
  setInvoiceWitness({ amount: usdmUnits(inv.amount), payer: payerId(inv.payer), salt: fromHex(inv.salt) })
  await call('settleInvoice', [fromHex(inv.commitment)])
  console.log('Invoice settled — the chain saw only the commitment, never the details.')
} else if (cmd === 'status') {
  const { walletContext, providers } = await connect()
  const state = await providers.publicDataProvider.queryContractState(deployment().contractAddress)
  const l = ledger(state.data)
  console.log('contract:', deployment().contractAddress)
  console.log('invoices created:', l.createdCount.toString())
  console.log('invoices settled:', l.settledCount.toString())
  for (const [commitment, settled] of l.invoices) console.log(` ${hex(commitment)} settled=${settled}`)
  await walletContext.wallet.stop()
} else {
  console.log('commands: create | pay | settle | status')
}
process.exit(0)
