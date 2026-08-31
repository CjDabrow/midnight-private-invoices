# Private Invoices on Midnight

**Built on [Midnight](https://midnight.network)** — a payments DApp where the
**amount and counterparty of an invoice stay private, while settlement is public**,
with **USDM as the payment asset**.

An invoice exists on-chain only as a 32-byte commitment
`H("private-invoice:v1:", amount, payer, salt)`. The merchant registers the
commitment; the payer pays in USDM; then either party proves *in zero knowledge*
that they know the invoice details behind the commitment, flipping it to
`settled`. The chain learns **that** an invoice settled — never the amount, never
who paid.

**Live demo**: https://cjdabrow.github.io/midnight-private-invoices/ — the UI in demo
mode, replaying the real on-chain run (self-host for live signing).

## Deployed contract (Midnight Preview)

```
3340415ce4cb387a51cec39897d9f0dc5152b843ca3a41eb16b5960ea549458c
```

## How it works

- **Contract** ([contract/src/invoices.compact](contract/src/invoices.compact)) — an
  original Compact contract with two transition circuits:
  - `createInvoice(commitment)` — registers an unsettled invoice commitment
  - `settleInvoice(commitment)` — requires witnesses `invoiceAmount`,
    `invoicePayer`, `invoiceSalt` whose hash matches the commitment; the ZK proof
    demonstrates knowledge without disclosure, then marks the invoice settled
  - `commitmentOf(...)` — a pure circuit shared by the CLI so off-chain and
    in-circuit commitments always agree
- **Web UI** ([src/server.mjs](src/server.mjs) + [web/index.html](web/index.html)) —
  `node src/server.mjs` then open http://localhost:4498: create, pay, and ZK-settle
  invoices from the browser (actions sign server-side; the page polls job progress)
- **CLI** ([src/cli.mjs](src/cli.mjs)) — `create`, `pay`, `settle`, `status`
- **Wiring** ([src/lib.mjs](src/lib.mjs)) — headless wallet, providers, witnesses

## Where USDM is handled

USDM is handled at the **application layer**, not inside the contract: the
`pay` command ([src/cli.mjs](src/cli.mjs), `cmd === 'pay'` branch) builds a native
**unshielded USDM transfer on Midnight** (token color
`003bacd9…44947d73` on Preview) from the payer's wallet to the merchant's address
using the wallet SDK (`wallet.transferTransaction`), with fees paid in DUST. The
contract intentionally never touches the funds — it manages the *private
settlement facts* about those USDM payments, so the payment amount and the
payer/merchant link never appear in contract state. The invoice file
(`invoice-<id>.json`) is the off-chain private channel binding the payment to
the commitment.

## Run it

Requires Node.js v22+, a funded wallet on Midnight Preview (USDM + DUST), and a
local proof server:

```bash
docker run -d -p 6300:6300 midnightntwrk/proof-server:8.0.3

npm install
cp .env.example .env               # add MIDNIGHT_MNEMONIC_PREVIEW
npm run compile                    # compact compile (toolchain 0.30.0)
npm run deploy                     # deploys, writes deployment.json

node src/cli.mjs create 5 mn_addr_preview1...payer     # merchant
node src/cli.mjs pay invoice-XXXX.json mn_addr_...     # payer sends USDM
node src/cli.mjs settle invoice-XXXX.json              # ZK settlement
node src/cli.mjs status                                # public state

node src/server.mjs                                    # or use the web UI
```

## On-chain proof (Preview)

| Step | Transaction |
|---|---|
| Deploy | `002762c67fdda000b3210d088b4928556087cc6e72f59a2d8b1d6c89ae78475003` |
| createInvoice | `00d564cffecaa61bd420e77325358026640b02994fdaf23ee91bd9295df6ba87af` |
| USDM payment (app layer) | `00119d79cda2deaa5975a0a919ec11e34b7ff2d58249742f0b517e92cd78ccb791` (2 USDM) |
| settleInvoice (ZK) | `005c6d98c6e15858abe82bd395e617a91daa68eb278a16b43976e2a525fc5f4031` |

## Attribution

Built on [Midnight Network](https://midnight.network) (Compact, ledger v8,
proof server) with [USDM](https://moneta.global) — brought to Midnight natively by
[VIA Labs](https://vialabs.tech) cross-chain messaging — for the Midnight × VIA
Labs partner sprint. Uses `@midnight-ntwrk/*` SDKs and
[`@via-labs-tech/usdm-bridge`](https://www.npmjs.com/package/@via-labs-tech/usdm-bridge)
for headless wallet wiring.
