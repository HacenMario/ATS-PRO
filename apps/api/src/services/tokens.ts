import jwt, { SignOptions } from 'jsonwebtoken';
import { randomBytes } from 'node:crypto';
import { env } from '../config/env';
import { JWT_AUD } from '../config/constants';
import { Role } from '@ats/shared';
import { RefreshToken, hashToken } from '../db/models/RefreshToken';
import { ApiError } from '../middleware/errors';

export interface AccessPayload {
  sub: string;
  role: Role;
  aud: string;
  iat?: number;
  exp?: number;
}

export async function signAccessToken(userId: string, role: Role, aud: string = JWT_AUD.WEB): Promise<string> {
  let ver: number | undefined;
  if (aud === JWT_AUD.WEB) {
    const { User } = await import('../db/models/User');
    const u = await User.findById(userId).select('tokenVersion');
    ver = u?.tokenVersion ?? 0;
  }
  return jwt.sign({ sub: userId, role, ver }, env.JWT_ACCESS_SECRET, {
    audience: aud,
    expiresIn: env.ACCESS_TOKEN_TTL as SignOptions['expiresIn'],
  });
}

export function verifySocketToken(token: string): { userId: string } | null {
  try {
    const payload = jwt.verify(token, env.JWT_ACCESS_SECRET, { audience: JWT_AUD.SOCKET }) as AccessPayload;
    return { userId: payload.sub };
  } catch {
    return null;
  }
}

export function newOpaqueToken(): string {
  return randomBytes(48).toString('base64url');
}

export interface IssuedRefresh {
  token: string;
  doc: { tokenHash: string; expiresAt: Date };
}

export async function issueRefreshToken(userId: string, ip: string, userAgent: string, familyHash?: string): Promise<IssuedRefresh> {
  const token = newOpaqueToken();
  const expiresAt = new Date(Date.now() + env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);
  const doc = await RefreshToken.create({
    userId,
    tokenHash: hashToken(token),
    expiresAt,
    ip,
    userAgent: userAgent.slice(0, 300),
    revokedAt: null,
  });
  if (familyHash) {
    await RefreshToken.updateOne({ tokenHash: familyHash }, { $set: { revokedAt: new Date(), replacedByHash: doc.tokenHash } });
  }
  return { token, doc: { tokenHash: doc.tokenHash, expiresAt } };
}

/**
 * Rotate a refresh token. Detects reuse of an already-rotated token
 * (possible theft) and revokes the entire user family.
 */
export async function rotateRefreshToken(presentedToken: string, ip: string, userAgent: string): Promise<{ userId: string; refresh: IssuedRefresh }> {
  const tokenHash = hashToken(presentedToken);
  const existing = await RefreshToken.findOne({ tokenHash });
  if (!existing || existing.expiresAt.getTime() < Date.now()) {
    throw new ApiError(401, 'errors.unauthenticated');
  }
  if (existing.revokedAt) {
    // Reuse detected — revoke everything for this user.
    await RefreshToken.updateMany(
      { userId: existing.userId, revokedAt: null },
      { $set: { revokedAt: new Date() } },
    );
    throw new ApiError(401, 'errors.unauthenticated');
  }
  const refresh = await issueRefreshToken(existing.userId.toString(), ip, userAgent, tokenHash);
  return { userId: existing.userId.toString(), refresh };
}

export async function revokeRefreshToken(presentedToken: string | undefined): Promise<void> {
  if (!presentedToken) return;
  await RefreshToken.updateOne({ tokenHash: hashToken(presentedToken), revokedAt: null }, { $set: { revokedAt: new Date() } });
}

/** Revokes all refresh tokens AND invalidates existing access tokens via tokenVersion. */
export async function revokeAllUserTokens(userId: string): Promise<void> {
  await RefreshToken.updateMany({ userId, revokedAt: null }, { $set: { revokedAt: new Date() } });
  const { User } = await import('../db/models/User');
  await User.updateOne({ _id: userId }, { $inc: { tokenVersion: 1 } });
}

