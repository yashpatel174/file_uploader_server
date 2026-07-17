import axios from "axios";
import { FailureType } from "../models/uploadJob.model";

export type CloudProvider =
  | "google"
  | "dropbox"
  | "ftp"
  | "sftp"
  | "application";

export interface CloudError {
  code: string;
  message: string;
  provider: CloudProvider;
  failureType: FailureType;
  retryable: boolean;
  httpStatus?: number | undefined;
}

export const classifyCloudError = (
  provider: CloudProvider,
  error: unknown,
): CloudError => {
  let status: number | undefined;
  let data: any;
  let message = "Unknown error";
  let code = "UNKNOWN";

  if (axios.isAxiosError(error)) {
    status = error.response?.status;
    data = error.response?.data;
    message = error.message;
    code = String(status ?? error.code ?? "UNKNOWN");
  } else if (
    typeof error === "object" &&
    error !== null &&
    "response" in error
  ) {
    const err = error as any;

    status = err.response?.status;
    data = err.response?.data;
    message = err.message ?? message;
    code = String(status ?? err.code ?? "UNKNOWN");
  } else if (error instanceof Error) {
    message = error.message;
  }

  const oauthError =
    typeof data?.error === "string"
      ? data.error.split(":")[0].trim().toLowerCase()
      : undefined;

  switch (oauthError) {
    case "invalid_client":
      return {
        code,
        provider,
        failureType: "authentication",
        retryable: false,
        httpStatus: status,
        message:
          provider === "google"
            ? "Invalid Google Client ID or Client Secret."
            : "Invalid Dropbox App Key or Secret Key.",
      };

    case "invalid_grant":
      return {
        code,
        provider,
        failureType: "authentication",
        retryable: false,
        httpStatus: status,
        message:
          provider === "google"
            ? "Authorization code is invalid, expired, already used, or does not match the redirect URI."
            : "Authorization code is invalid or expired.",
      };

    case "redirect_uri_mismatch":
      return {
        code,
        provider,
        failureType: "authentication",
        retryable: false,
        httpStatus: status,
        message:
          "OAuth Redirect URI does not match the configured Redirect URI.",
      };

    case "unauthorized_client":
      return {
        code,
        provider,
        failureType: "authentication",
        retryable: false,
        httpStatus: status,
        message: "OAuth client is not authorized.",
      };

    case "access_denied":
      return {
        code,
        provider,
        failureType: "authentication",
        retryable: false,
        httpStatus: status,
        message: "Authorization was denied.",
      };
  }

  if (status === 401 || status === 403) {
    return {
      code,
      provider,
      failureType: "authentication",
      retryable: false,
      httpStatus: status,
      message:
        provider === "google"
          ? "Invalid Google credentials."
          : "Invalid Dropbox credentials.",
    };
  }

  if (status === 429) {
    return {
      code,
      provider,
      failureType: "provider",
      retryable: true,
      httpStatus: status,
      message: "Provider rate limit exceeded.",
    };
  }

  if (status === 500 || status === 502 || status === 503 || status === 504) {
    return {
      code,
      provider,
      failureType: "provider",
      retryable: true,
      httpStatus: status,
      message: "Cloud provider is temporarily unavailable.",
    };
  }

  return {
    code,
    provider,
    failureType: "unknown",
    retryable: false,
    httpStatus: status,
    message:
      data?.error_description ?? data?.error ?? message ?? "Unknown error",
  };
};
