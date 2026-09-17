
/**
 * Retrieves the current CSRF token information from the Tentacles backend.
 *
 * Use this function before making any state-changing request that requires
 * CSRF protection, such as POST, PUT, PATCH, or DELETE.
 *
 * The returned object contains the token and the HTTP header name expected
 * by Spring Security. Callers should use the returned headerName rather than
 * hard-coding a CSRF header name.
 *
 * Example:
 *
 * const csrf = await getCsrfToken();
 *
 * const response = await fetch("/api/example", {
 *   method: "POST",
 *   headers: {
 *     "Content-Type": "application/json",
 *     [csrf.headerName]: csrf.token
 *   },
 *   body: JSON.stringify(data)
 * });
 *
 * This function validates the HTTP response and CSRF data before returning.
 * It throws a descriptive Error if the token cannot be retrieved or the
 * server returns an unexpected response. The CSRF token itself is never
 * written to the console.
 *
 * @returns {Promise<{token: string, headerName: string}>} CSRF information
 * required for a protected request.
 * @throws {Error} If the CSRF information cannot be retrieved or is invalid.
 */
async function getCsrfToken() {
  let response;

  try {
    response = await fetch("/csrf", {
      method: "GET",
      credentials: "same-origin",
      cache: "no-store"
    });
  } catch (error) {
    throw new Error(`Unable to fetch CSRF token: ${error.message}`, { cause: error });
  }

  if (!response.ok) {
    throw new Error(`Unable to fetch CSRF token: server returned HTTP ${response.status} ${response.statusText}`);
  }

  let csrf;

  try {
    csrf = await response.json();
  } catch (error) {
    throw new Error("Unable to fetch CSRF token: server returned an invalid JSON response.", { cause: error });
  }

  if (!csrf || typeof csrf !== "object") {
    throw new Error("Unable to fetch CSRF token: response did not contain a valid CSRF object.");
  }

  if (typeof csrf.token !== "string" || csrf.token.length === 0) {
    throw new Error("Unable to fetch CSRF token: response did not contain a token.");
  }

  if (typeof csrf.headerName !== "string" || csrf.headerName.length === 0) {
    throw new Error("Unable to fetch CSRF token: response did not contain a header name.");
  }

  return csrf;
}