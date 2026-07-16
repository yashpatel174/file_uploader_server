import axios from "axios";

type Provider = "google" | "dropbox";

export const classifyProviderAuthError = (
  provider: Provider,
  error: unknown,
): string => {
  let status: number | undefined;
  let data: any;
  let message: string | undefined;

  // Axios (Dropbox)
  if (axios.isAxiosError(error)) {
    status = error.response?.status;
    data = error.response?.data;
    message = error.message;
  }
  // Gaxios (Google)
  else if (typeof error === "object" && error !== null && "response" in error) {
    const err = error as any;
    status = err.response?.status;
    data = err.response?.data;
    message = err.message;
  }
  // Native Error
  else if (error instanceof Error) {
    message = error.message;
  }

  switch (provider) {
    case "google": {
      switch (data?.error) {
        case "invalid_client":
          return "Invalid Google Client ID or Client Secret.";

        case "invalid_grant":
          return "Authorization code is invalid, expired, already used, or does not match the redirect URI.";

        case "redirect_uri_mismatch":
          return "Google OAuth Redirect URI does not match the configured Redirect URI.";

        case "unauthorized_client":
          return "Google OAuth client is not authorized.";

        case "access_denied":
          return "Google authorization was denied.";

        default:
          if (status === 401) {
            return "Invalid Google Client ID or Client Secret.";
          }

          if (status === 400) {
            return (
              data?.error_description ||
              data?.error ||
              "Google authentication failed."
            );
          }

          return (
            data?.error_description ||
            data?.error ||
            message ||
            "Google authentication failed."
          );
      }
    }

    case "dropbox": {
      switch (data?.error) {
        case "invalid_client":
          return "Invalid Dropbox App Key or Secret Key.";

        case "invalid_grant":
          return "Authorization code is invalid or has expired.";

        case "unsupported_grant_type":
          return "Unsupported OAuth grant type.";

        case "access_denied":
          return "Dropbox authorization was denied.";

        default:
          if (status === 401) {
            return "Invalid Dropbox App Key or Secret Key.";
          }

          if (status === 400) {
            return (
              data?.error_description ||
              data?.error ||
              "Dropbox authentication failed."
            );
          }

          return (
            data?.error_description ||
            data?.error ||
            message ||
            "Dropbox authentication failed."
          );
      }
    }

    default:
      return message || "Authentication failed.";
  }
};
