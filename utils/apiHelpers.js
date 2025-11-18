// utils/apiHelpers.js
// Utility functions for API calls with timeout and retry logic

/**
 * Fetch with timeout support
 * @param {string} url - The URL to fetch
 * @param {object} options - Fetch options
 * @param {number} timeout - Timeout in milliseconds (default: 30000)
 * @returns {Promise<Response>}
 */
export const fetchWithTimeout = async (url, options = {}, timeout = 30000) => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      throw new Error('Request timeout - the server took too long to respond');
    }
    throw error;
  }
};

/**
 * Sleep utility for retry delays
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise<void>}
 */
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Fetch with automatic retry and exponential backoff
 * @param {string} url - The URL to fetch
 * @param {object} options - Fetch options
 * @param {number} maxRetries - Maximum number of retry attempts (default: 3)
 * @param {number} timeout - Timeout per attempt in milliseconds (default: 30000)
 * @returns {Promise<Response>}
 */
export const fetchWithRetry = async (url, options = {}, maxRetries = 3, timeout = 30000) => {
  let lastError;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetchWithTimeout(url, options, timeout);

      // If response is ok, return it
      if (response.ok) {
        return response;
      }

      // For 5xx errors, retry. For 4xx errors, don't retry (client error)
      if (response.status >= 500) {
        lastError = new Error(`Server error: ${response.status} ${response.statusText}`);
        console.warn(`Attempt ${attempt + 1}/${maxRetries + 1} failed with status ${response.status}`);

        // Don't retry if this was the last attempt
        if (attempt === maxRetries) {
          throw lastError;
        }

        // Wait before retrying (exponential backoff: 2s, 4s, 8s)
        const delayMs = Math.pow(2, attempt) * 2000;
        console.log(`Retrying in ${delayMs}ms...`);
        await sleep(delayMs);
        continue;
      }

      // For 4xx errors, return the response (don't retry)
      return response;

    } catch (error) {
      lastError = error;
      console.warn(`Attempt ${attempt + 1}/${maxRetries + 1} failed:`, error.message);

      // Don't retry if this was the last attempt
      if (attempt === maxRetries) {
        throw error;
      }

      // Wait before retrying (exponential backoff: 2s, 4s, 8s)
      const delayMs = Math.pow(2, attempt) * 2000;
      console.log(`Retrying in ${delayMs}ms...`);
      await sleep(delayMs);
    }
  }

  throw lastError;
};

/**
 * Check if user is online
 * @returns {boolean}
 */
export const isOnline = () => {
  return typeof navigator !== 'undefined' && navigator.onLine;
};

/**
 * Create a user-friendly error message from an API error
 * @param {Error} error - The error object
 * @returns {string}
 */
export const getErrorMessage = (error) => {
  if (!isOnline()) {
    return "You appear to be offline. Please check your internet connection and try again.";
  }

  if (error.message.includes('timeout')) {
    return "The request took too long. The server might be busy - please try again in a moment.";
  }

  if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
    return "Network error. Please check your connection and try again.";
  }

  if (error.message.includes('Server error: 500')) {
    return "The server encountered an error. Please try again in a moment.";
  }

  if (error.message.includes('Server error: 503')) {
    return "The service is temporarily unavailable. Please try again shortly.";
  }

  return "An unexpected error occurred. Please try again.";
};
