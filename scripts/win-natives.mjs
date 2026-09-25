/**
 * Ensure Windows-only native bindings are present in node_modules before
 * cross-building the Windows targets from a non-Windows host.
 *
 * npm deliberately skips extracting packages whose `os`/`cpu` fields do not
 * match the host (e.g. `@node-rs/argon2-win32-x64-msvc` on Linux), even when
 * they are declared in optionalDependencies. electron-builder packs whatever
 * is on disk, so a Windows build produced on Linux would silently ship without
 * the Windows argon2 binding and crash at login (`Cannot load native addon`).
 *
 * This script fetches the registry tarball directly and unpacks it into
 * node_modules. It is a no-op when the binding is already installed (e.g. on a
 * Windows development machine where npm installs it normally) and it never
 * modifies package.json or the lockfile.
 *
 * Usage: node scripts/win-natives.mjs
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = fileURLToPath(new URL('..', import.meta.url))
const pkg = JSON.parse(readFileSync(path.join(repoRoot, 'package.json'), 'utf8'))
const nodeModules = path.join(repoRoot, 'node_modules')
const bindings = pkg.optionalDependencies ?? {}

let installed = 0
let skipped = 0

for (const [name, range] of Object.entries(bindings)) {
  if (existsSync(path.join(nodeModules, name, 'package.json'))) {
    skipped += 1
    continue
  }
  const version = range.replace(/^[\^~>=<\s]+/, '')
  const workdir = path.join(tmpdir(), `apexpos-win-native-${name.replace(/[/@]/g, '_')}`)
  rmSync(workdir, { recursive: true, force: true })
  mkdirSync(workdir, { recursive: true })

  try {
    const output = execFileSync('npm', ['pack', `${name}@${version}`], {
      cwd: workdir,
      encoding: 'utf8'
    })
    const tarball = output.trim().split('\n').pop()
    execFileSync('tar', ['xzf', path.join(workdir, tarball)], { cwd: workdir })

    const dest = path.join(nodeModules, name)
    rmSync(dest, { recursive: true, force: true })
    mkdirSync(dest, { recursive: true })
    // path.join would normalize away the trailing "/.", so append it manually:
    // copying `src/.` (rather than `src`) flattens the tarball's package/ folder.
    execFileSync('cp', ['-r', `${path.join(workdir, 'package')}/.`, dest])

    if (!existsSync(path.join(dest, 'package.json'))) {
      throw new Error('package.json missing after extraction')
    }
    installed += 1
    console.log(`win-natives: installed ${name}@${version}`)
  } finally {
    rmSync(workdir, { recursive: true, force: true })
  }
}

console.log(`win-natives: ${installed} installed, ${skipped} already present`)
