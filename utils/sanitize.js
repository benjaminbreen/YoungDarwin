// utils/sanitize.js
// Input sanitization utilities to prevent XSS and injection attacks

/**
 * Sanitize HTML entities in user input to prevent XSS
 * @param {string} input - The input string to sanitize
 * @returns {string} - The sanitized string
 */
export const sanitizeHTML = (input) => {
  if (typeof input !== 'string') {
    return '';
  }

  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;');
};

/**
 * Sanitize user input for API submission
 * - Removes script tags and potentially dangerous HTML
 * - Trims whitespace
 * - Limits length
 * @param {string} input - The input string to sanitize
 * @param {number} maxLength - Maximum allowed length (default: 500)
 * @returns {string} - The sanitized string
 */
export const sanitizeUserInput = (input, maxLength = 500) => {
  if (typeof input !== 'string') {
    return '';
  }

  // Remove any script tags (case insensitive)
  let sanitized = input.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');

  // Remove other potentially dangerous tags
  sanitized = sanitized.replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '');
  sanitized = sanitized.replace(/<object\b[^<]*(?:(?!<\/object>)<[^<]*)*<\/object>/gi, '');
  sanitized = sanitized.replace(/<embed\b[^<]*>/gi, '');

  // Remove javascript: protocol
  sanitized = sanitized.replace(/javascript:/gi, '');

  // Remove on* event handlers
  sanitized = sanitized.replace(/\son\w+\s*=\s*["'][^"']*["']/gi, '');
  sanitized = sanitized.replace(/\son\w+\s*=\s*[^\s>]*/gi, '');

  // Trim whitespace
  sanitized = sanitized.trim();

  // Enforce length limit
  if (sanitized.length > maxLength) {
    console.warn(`Input truncated from ${sanitized.length} to ${maxLength} characters`);
    sanitized = sanitized.substring(0, maxLength);
  }

  return sanitized;
};

/**
 * Validate that input doesn't contain suspicious patterns
 * @param {string} input - The input to validate
 * @returns {boolean} - True if input is safe, false otherwise
 */
export const validateInput = (input) => {
  if (typeof input !== 'string') {
    return false;
  }

  // Check for common XSS patterns
  const dangerousPatterns = [
    /<script/i,
    /javascript:/i,
    /on\w+\s*=/i,
    /<iframe/i,
    /<object/i,
    /<embed/i,
    /eval\(/i,
    /expression\(/i
  ];

  for (const pattern of dangerousPatterns) {
    if (pattern.test(input)) {
      console.warn('Potentially dangerous input detected:', input.substring(0, 50));
      return false;
    }
  }

  return true;
};

/**
 * Sanitize collection notes specifically
 * @param {string} notes - The collection notes to sanitize
 * @returns {string} - The sanitized notes
 */
export const sanitizeCollectionNotes = (notes) => {
  return sanitizeUserInput(notes, 500);
};

/**
 * Sanitize player command/action input
 * @param {string} command - The command to sanitize
 * @returns {string} - The sanitized command
 */
export const sanitizeCommand = (command) => {
  return sanitizeUserInput(command, 1000);
};
