import { spawn } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const args = process.argv.slice(2)
const isDevCommand = args[0] === 'dev'
const finalArgs = isDevCommand && !args.includes('--no-watch')
  ? ['dev', '--no-watch', ...args.slice(1)]
  : args

const scriptDir = dirname(fileURLToPath(import.meta.url))
const desktopRoot = resolve(scriptDir, '..')
const tauriEntrypoint = resolve(desktopRoot, 'node_modules', '@tauri-apps', 'cli', 'tauri.js')
const child = spawn(process.execPath, [tauriEntrypoint, ...finalArgs], {
  cwd: desktopRoot,
  stdio: 'inherit',
})

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal)
    return
  }

  process.exit(code ?? 1)
})

child.on('error', (error) => {
  console.error(error.message)
  process.exit(1)
})
