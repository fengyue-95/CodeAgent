import fs from 'node:fs';

let wslChecked = false;
let wslValue = false;

export function detectWsl(): boolean {
  if (wslChecked) {
    return wslValue;
  }

  wslChecked = true;
  if (process.platform !== 'linux') {
    wslValue = false;
    return wslValue;
  }

  if (process.env.WSL_DISTRO_NAME || process.env.WSL_INTEROP) {
    wslValue = true;
    return wslValue;
  }

  try {
    const version = fs.readFileSync('/proc/version', 'utf8').toLowerCase();
    wslValue = version.includes('microsoft') || version.includes('wsl');
  } catch {
    wslValue = false;
  }

  return wslValue;
}

function isWindowsDriveMount(projectRoot: string): boolean {
  return /^\/mnt\/[a-z](\/|$)/i.test(projectRoot.replace(/\\/g, '/'));
}

export function watchDisabledReason(projectRoot: string): string | null {
  if (process.env.CODE_AGENT_NO_WATCH === '1') {
    return 'CODE_AGENT_NO_WATCH=1 is set';
  }

  if (process.env.CODE_AGENT_FORCE_WATCH === '1') {
    return null;
  }

  if (detectWsl() && isWindowsDriveMount(projectRoot)) {
    return 'project is on a WSL /mnt drive, where recursive fs.watch can be too slow';
  }

  return null;
}
