import { hash, verify, type Algorithm } from "@node-rs/argon2";

/** Argon2id. The package enum is ambient, so the value is written out. */
const ARGON2ID: Algorithm = 2;

/**
 * Argon2id, the OWASP password-storage default.
 * Production: 19456 KiB of memory, 2 passes, 1 lane.
 * The costs are injected so tests can stay small without changing the algorithm.
 * There is no composition rule. Length is 12 to 128 Unicode code points.
 */
export interface Argon2Settings {
  memoryCost: number;
  timeCost: number;
  parallelism: number;
}

export const PRODUCTION_ARGON2: Argon2Settings = {
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
};

export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 128;

export function passwordLength(password: string): number {
  return Array.from(password).length;
}

export function isAcceptablePassword(password: string): boolean {
  const length = passwordLength(password);
  return length >= PASSWORD_MIN_LENGTH && length <= PASSWORD_MAX_LENGTH;
}

export class Argon2Hasher {
  private dummyHash: Promise<string> | null = null;

  constructor(private readonly settings: Argon2Settings) {}

  hash(password: string): Promise<string> {
    return hash(password, this.options());
  }

  verify(encoded: string, password: string): Promise<boolean> {
    return verify(encoded, password).catch(() => false);
  }

  /** Same Argon2id verify cost when the account does not exist. */
  async verifyDummy(password: string): Promise<void> {
    this.dummyHash ??= this.hash("bintu-dummy-password-value");
    await this.verify(await this.dummyHash, password);
  }

  private options() {
    return {
      algorithm: ARGON2ID,
      memoryCost: this.settings.memoryCost,
      timeCost: this.settings.timeCost,
      parallelism: this.settings.parallelism,
    };
  }
}
