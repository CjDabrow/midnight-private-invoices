// Deploy the Private Invoices contract to Midnight (network selected by .env).
import fs from 'node:fs'
import { deployContract } from '@midnight-ntwrk/midnight-js-contracts'
import { connect, compiledContract, PRIVATE_STATE_ID, DEPLOYMENT_FILE } from './lib.mjs'

const { walletContext, providers } = await connect()
console.log('Deploying Private Invoices contract…')
const deployed = await deployContract(providers, {
  compiledContract,
  privateStateId: PRIVATE_STATE_ID,
  initialPrivateState: {},
})
const { contractAddress, txId } = deployed.deployTxData.public
console.log('Contract address:', contractAddress)
console.log('Deploy tx:', txId)
fs.writeFileSync(DEPLOYMENT_FILE, JSON.stringify({ contractAddress, deployTxId: txId, network: 'preview', deployedAt: new Date().toISOString() }, null, 2))
console.log('Saved to deployment.json')
await walletContext.wallet.stop()
process.exit(0)
