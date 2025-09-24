#!/usr/bin/env node
// Simple cross-platform port guard: frees a TCP port before starting server
// Usage: node scripts/port_guard.mjs [port]

import { spawn } from 'node:child_process'

const port = Number(process.argv[2] || process.env.PORT || 8080)
if (!Number.isFinite(port) || port <= 0) {
  console.error('PORT_GUARD_INVALID_PORT')
  process.exit(2)
}

// In minimal production containers (e.g., Railway Nixpacks), tools like bash/lsof
// may not be available. Skip the guard in production to avoid crashes.
if (process.env.RAILWAY || process.env.NODE_ENV === 'production') {
  console.log(`PORT_GUARD_SKIP production (port ${port})`)
  process.exit(0)
}

function run(cmd, args, opts = {}) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { shell: false, stdio: ['ignore', 'pipe', 'pipe'], ...opts })
    let out = ''
    let err = ''
    child.stdout.on('data', (d) => { out += d.toString() })
    child.stderr.on('data', (d) => { err += d.toString() })
    child.on('close', (code) => resolve({ code, out, err }))
  })
}

async function killPids(pids) {
  if (!pids.length) return 0
  if (process.platform === 'win32') {
    const kills = await Promise.all(pids.map((pid) => run('taskkill', ['/PID', String(pid), '/F'])))
    return kills.filter((k) => k.code === 0).length
  }
  // posix
  const res = await run('/bin/sh', ['-lc', `kill -9 ${pids.map((p) => String(p)).join(' ')}`])
  return res.code === 0 ? pids.length : 0
}

async function main() {
  try {
    if (process.platform === 'win32') {
      // netstat output: find lines with :PORT and LISTENING, extract PID (last column)
      const { out } = await run('cmd.exe', ['/c', `netstat -ano | findstr :${port}`])
      const pids = Array.from(new Set(
        out
          .split(/\r?\n/)
          .filter((l) => l.includes(`:${port}`))
          .filter((l) => /LISTENING|ESTABLISHED/i.test(l))
          .map((l) => l.trim().split(/\s+/).pop())
          .filter(Boolean)
      )).map((s) => Number(s)).filter((n) => Number.isFinite(n) && n !== process.pid)
      if (pids.length === 0) { console.log(`PORT_GUARD_OK port ${port} free`) ; return }
      const killed = await killPids(pids)
      console.log(`PORT_GUARD_KILLED ${killed} on port ${port}`)
      return
    }
    // posix: lsof -ti :PORT
    const { out } = await run('/bin/sh', ['-lc', `lsof -ti :${port} 2>/dev/null || true`])
    const pids = out.split(/\s+/).map((s) => Number(s)).filter((n) => Number.isFinite(n) && n !== process.pid)
    if (pids.length === 0) { console.log(`PORT_GUARD_OK port ${port} free`) ; return }
    const killed = await killPids(pids)
    console.log(`PORT_GUARD_KILLED ${killed} on port ${port}`)
  } catch (e) {
    console.error('PORT_GUARD_ERROR', e?.message || e)
    // do not fail hard; allow start to proceed
  }
}

main()


