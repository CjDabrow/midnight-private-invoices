// Web UI for Private Invoices. Serves the page and runs the CLI actions in
// child processes (each ZK action takes minutes; jobs run async, the page polls).
//   node src/server.mjs   →  http://localhost:4498
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const PORT = process.env.PORT || 4498
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')

const jobs = new Map() // id -> {cmd, status, output}
let nextJob = 1

function runJob(args) {
  const id = String(nextJob++)
  const job = { cmd: args.join(' '), status: 'running', output: '' }
  jobs.set(id, job)
  const child = spawn(process.execPath, ['src/cli.mjs', ...args], { cwd: ROOT })
  const collect = (d) => { job.output = (job.output + d).slice(-4000) }
  child.stdout.on('data', collect)
  child.stderr.on('data', collect)
  child.on('close', (code) => { job.status = code === 0 ? 'done' : 'failed' })
  return id
}

const json = (res, code, body) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)) }
const readBody = (req) => new Promise((resolve) => { let d = ''; req.on('data', (c) => (d += c)); req.on('end', () => resolve(d ? JSON.parse(d) : {})) })

http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://x`)
    if (req.method === 'GET' && url.pathname === '/') {
      res.writeHead(200, { 'Content-Type': 'text/html' })
      return res.end(fs.readFileSync(path.join(ROOT, 'web/index.html')))
    }
    if (req.method === 'GET' && url.pathname === '/api/deployment') {
      return json(res, 200, JSON.parse(fs.readFileSync(path.join(ROOT, 'deployment.json'), 'utf8')))
    }
    if (req.method === 'GET' && url.pathname === '/api/invoices') {
      const files = fs.readdirSync(ROOT).filter((f) => /^invoice-[0-9a-f]+\.json$/.test(f))
      return json(res, 200, files.map((f) => ({ file: f, ...JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8')) })))
    }
    if (req.method === 'GET' && url.pathname.startsWith('/api/job/')) {
      const job = jobs.get(url.pathname.split('/').pop())
      return job ? json(res, 200, job) : json(res, 404, { error: 'no such job' })
    }
    if (req.method === 'POST' && url.pathname === '/api/action') {
      const { action, amount, payer, file, merchant } = await readBody(req)
      let args
      if (action === 'create') args = ['create', String(amount), String(payer)]
      else if (action === 'pay') args = ['pay', String(file), String(merchant)]
      else if (action === 'settle') args = ['settle', String(file)]
      else if (action === 'status') args = ['status']
      else return json(res, 400, { error: 'unknown action' })
      return json(res, 200, { jobId: runJob(args) })
    }
    json(res, 404, { error: 'not found' })
  } catch (e) {
    json(res, 500, { error: e.message })
  }
}).listen(PORT, () => console.log(`Private Invoices UI on http://localhost:${PORT}`))
