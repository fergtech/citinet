/**
 * Portable account package — the "create" half.
 *
 * Unlike the plain "Export your data" zip (readable, meant for the member's own
 * eyes), a package is meant to be IMPORTED into an account on another hub. It
 * holds the same decrypted data plus the account's encryption keys, so — because
 * it contains everything — the whole thing is encrypted at rest (see
 * portableContainer.ts) under a secret only the member knows:
 *
 *   - their recovery phrase (the default: one secret to remember, and importing
 *     can carry the same phrase over to the new hub), or
 *   - a package password they choose.
 *
 * Plain-export parts are reused as-is (accountExport.ts) so the two stay in step.
 */

import { strToU8 } from 'fflate';
import { hubService } from '../services/hubService';
import { buildAccountExport, EXPORT_PARTS, type ExportProgress } from './accountExport';
import { sealContainer, normalizeSecret, type SecretKind } from './portableContainer';
import { checkPasswordStrength } from './passwordStrength';

export const PACKAGE_EXTENSION = '.citinet-account';
export const PACKAGE_FORMAT = 'citinet-account-package';
const MIN_PACKAGE_PASSWORD = 12;

export interface CreatePackageOptions {
  secret: string;
  kind: SecretKind;
  /** Include the account's encryption keys (so the new hub can keep the same identity). */
  includeKeys: boolean;
  onProgress?: (p: ExportProgress) => void;
  signal?: AbortSignal;
}

export interface PackageResult {
  blob: Blob;
  filename: string;
  counts: Record<string, number>;
  /** Things left out (too-large files, notes this device can't decrypt, …) — shown to the member. */
  warnings: string[];
  includesKeys: boolean;
  packageId: string;
}

/** Throws a plain-language Error if the secret can't be used to protect a package. */
export async function validatePackageSecret(hubSlug: string, secret: string, kind: SecretKind): Promise<void> {
  if (kind === 'password') {
    if (secret.length < MIN_PACKAGE_PASSWORD) {
      throw new Error(`Use at least ${MIN_PACKAGE_PASSWORD} characters for the package password — a short sentence works well.`);
    }
    const strength = checkPasswordStrength(secret);
    if (!strength.acceptable) throw new Error(strength.reason || 'That password is too easy to guess.');
    return;
  }
  const phrase = normalizeSecret(secret, 'recovery-phrase');
  if (!phrase) throw new Error('Enter your recovery phrase.');
  // Verified against the account's real key backup, so a typo is caught now rather
  // than after the member has deleted their old account and can't open the package.
  if (!(await hubService.verifyRecoveryPhrase(hubSlug, phrase))) {
    throw new Error('That is not your current recovery phrase. Check it and try again (Account → Security).');
  }
}

export async function createPortablePackage(hubSlug: string, opts: CreatePackageOptions): Promise<PackageResult> {
  const conn = hubService.getHubConnection(hubSlug);
  if (!conn?.user?.authToken) throw new Error('Not signed in to this hub');

  await validatePackageSecret(hubSlug, opts.secret, opts.kind);

  let keysFile: Record<string, Uint8Array> = {};
  if (opts.includeKeys) {
    const keys = await hubService.getKeyMaterial(hubSlug);
    if (!keys) {
      throw new Error(
        "This device doesn't have your encryption keys, so they can't go in the package. Restore them first (Account → Security → Restore from backup), or create the package without keys.",
      );
    }
    keysFile = { 'keys.json': strToU8(JSON.stringify({ format: 'citinet-keys', version: 1, keys })) };
  }

  const packageId = crypto.randomUUID();
  const built = await buildAccountExport(hubSlug, {
    parts: EXPORT_PARTS.map((p) => p.id),
    signal: opts.signal,
    onProgress: (p) => opts.onProgress?.({ phase: p.phase, fraction: p.fraction * 0.85 }),
    extraFiles: keysFile,
    manifestExtra: {
      format: PACKAGE_FORMAT,
      packageId,
      hasKeys: opts.includeKeys,
      secretKind: opts.kind,
      notes: [
        'This file holds your data and (if included) your encryption keys. It is encrypted — keep your recovery phrase / package password safe, and treat the file like a password.',
      ],
    },
  });

  // A package is something a member may rely on when they leave a hub. If any part
  // failed to export, don't hand over a file that silently lacks it.
  if (built.errors.length > 0) {
    throw new Error(`Part of your account could not be exported, so no package was made: ${built.errors.join('; ')}. Try again.`);
  }

  opts.onProgress?.({ phase: 'Encrypting…', fraction: 0.88 });
  const sealed = await sealContainer(
    built.blob,
    opts.secret,
    { hint: opts.kind, createdAt: new Date().toISOString(), hubName: conn.hub.name },
    (f) => opts.onProgress?.({ phase: 'Encrypting…', fraction: 0.88 + f * 0.12 }),
  );

  const safe = (s: string) => s.replace(/[^a-z0-9-_]+/gi, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'account';
  const stamp = new Date().toISOString().slice(0, 10);
  return {
    blob: sealed,
    filename: `${safe(hubSlug)}-${safe(conn.user.username)}-${stamp}${PACKAGE_EXTENSION}`,
    counts: built.counts,
    warnings: built.warnings,
    includesKeys: opts.includeKeys,
    packageId,
  };
}

/** Trigger a browser download for a created package. */
export function downloadPackage(result: PackageResult): void {
  const url = URL.createObjectURL(result.blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = result.filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
