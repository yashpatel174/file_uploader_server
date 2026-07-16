import { FailureType } from "../models/uploadJob.model";

export interface ClassifiedUploadError {
  code: string;
  message: string;
  provider: string;
  failureType: FailureType;
}

export const classifyUploadError = (error: unknown): ClassifiedUploadError => {
  const err = error as any;
  const message = err?.message?.toString() ?? "Unknown upload error";
  const code = err?.code?.toString() ?? err?.status?.toString() ?? "UNKNOWN";
  const lower = message.toLowerCase();

  /**
   * Validation
   */
  if (
    lower.includes("unsupported") ||
    lower.includes("invalid") ||
    lower.includes("mime")
  ) {
    return {
      code,
      message,
      provider: "application",
      failureType: "validation",
    };
  }

  /**
   * User quota
   */
  if (lower.includes("quota") || lower.includes("allocated")) {
    return {
      code,
      message,
      provider: "application",
      failureType: "quota",
    };
  }

  /**
   * Authentication
   */
  if (
    lower.includes("unauthorized") ||
    lower.includes("authentication") ||
    lower.includes("invalid credentials") ||
    lower.includes("access token") ||
    code === "401"
  ) {
    return {
      code,
      message,
      provider: "cloud",
      failureType: "authentication",
    };
  }

  /**
   * Network
   */
  if (
    lower.includes("econnrefused") ||
    lower.includes("etimedout") ||
    lower.includes("timeout") ||
    lower.includes("network") ||
    lower.includes("socket")
  ) {
    return {
      code,
      message,
      provider: "cloud",
      failureType: "network",
    };
  }

  /**
   * File
   */
  if (
    lower.includes("enoent") ||
    lower.includes("file not found") ||
    lower.includes("no such file")
  ) {
    return {
      code,
      message,
      provider: "filesystem",
      failureType: "file",
    };
  }

  /**
   * Cloud provider
   */
  if (
    lower.includes("google") ||
    lower.includes("drive") ||
    lower.includes("dropbox") ||
    lower.includes("ftp") ||
    lower.includes("sftp")
  ) {
    return {
      code,
      message,
      provider: "cloud",
      failureType: "provider",
    };
  }

  /**
   * Default
   */
  return {
    code,
    message,
    provider: "application",
    failureType: "unknown",
  };
};
