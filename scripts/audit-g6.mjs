import { readFileSync, readdirSync, mkdirSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { gzipSync } from 'node:zlib'

// Report sizes without claiming network or rendering timings from build output.
const assets = readdirSync('dist/assets')
  .filter((name) => /\.(js|css)$/.test(name))
  .map((name) => {
    const bytes = readFileSync(`dist/assets/${name}`)
    return { name, bytes: bytes.length, gzipBytes: gzipSync(bytes).length }
  })
  .sort((a, b) => b.bytes - a.bytes)
const tracked = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' })
  .split('\0')
  .filter(Boolean)
const forbiddenFiles = tracked.filter(
  (path) => /(^|\/)\.env(?:\..+)?$/.test(path) && !path.endsWith('.example'),
)
const patterns = [
  /sb_secret_[A-Za-z0-9_-]{12,}/,
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
]
const suspectFiles = tracked
  .filter((path) => /\.(?:ts|vue|js|json|md|sql|toml)$/.test(path))
  .filter((path) =>
    patterns.some((pattern) => pattern.test(readFileSync(path, 'utf8'))),
  )
const bundleSuspects = assets
  .filter(({ name }) =>
    patterns.some((pattern) =>
      pattern.test(readFileSync(`dist/assets/${name}`, 'utf8')),
    ),
  )
  .map(({ name }) => name)
const report = {
  measuredAt: new Date().toISOString(),
  scope:
    'Production build sizes and limited static credential-pattern check; not a complete secret audit',
  assets,
  forbiddenFiles,
  suspectFiles,
  bundleSuspects,
}
mkdirSync('output/playwright', { recursive: true })
writeFileSync(
  'output/playwright/g6-static-audit.json',
  JSON.stringify(report, null, 2),
)
console.log(JSON.stringify(report, null, 2))
if (forbiddenFiles.length || suspectFiles.length || bundleSuspects.length)
  process.exitCode = 1
