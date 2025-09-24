/* Collect 10 successful HU hand histories by retrying failed runs */
import { spawnSync } from 'node:child_process'

const results = []
let attempts = 0
while (results.length < 10 && attempts < 30) {
  attempts += 1
  const out = spawnSync('node', ['backend/scripts/hu_onehand_history.mjs'], { encoding: 'utf8' })
  if (out.status === 0) {
    try {
      const obj = JSON.parse(out.stdout)
      if (obj && obj.ok && obj.tableId && obj.handNumber) {
        results.push(obj)
        continue
      }
    } catch (_) {}
  }
}

if (results.length < 10) {
  console.error('COLLECT10_FAIL collected', results.length)
  console.log(JSON.stringify(results, null, 2))
  process.exit(1)
}

console.log(JSON.stringify(results, null, 2))


