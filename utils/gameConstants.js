// utils/gameConstants.js
// Game constants and configuration values

// Time and Day Management
export const GAME_START_TIME = 360; // 6:00 AM in minutes (6 * 60)
export const MINUTES_PER_HOUR = 60;
export const HOURS_PER_DAY = 24;
export const STARTING_DAY = 1;

// Fatigue System
export const MAX_FATIGUE = 100;
export const STARTING_FATIGUE = 1;
export const HIGH_FATIGUE_WARNING_THRESHOLD = 75; // Show warning at 75%
export const CRITICAL_FATIGUE_THRESHOLD = 95; // Pass out at 95%
export const DEFAULT_FATIGUE_INCREASE = 5;
export const MOVEMENT_FATIGUE_BASE = 5;
export const REST_FATIGUE_REDUCTION = 70; // Amount to reduce fatigue when resting (not full reset)

// Input Validation
export const MAX_INPUT_LENGTH = 1000;
export const MAX_COLLECTION_NOTES_LENGTH = 500;
export const MAX_COMMAND_LENGTH = 1000;

// Event History
export const MAX_EVENT_HISTORY = 30; // Keep last 30 events
export const MAX_GAME_HISTORY = 5; // Keep last 5 game history entries
export const MAX_SUMMARY_QUEUE_SIZE = 50; // Maximum queue size for event summarization
export const MIN_EVENT_CONTENT_LENGTH_FOR_SUMMARY = 30; // Minimum length to queue for LLM summary

// API Configuration
export const DEFAULT_API_TIMEOUT = 30000; // 30 seconds
export const DEFAULT_MAX_RETRIES = 3;
export const RETRY_DELAY_BASE = 2000; // 2 seconds, exponential backoff

// Collection System
export const COLLECTION_SUCCESS_BONUS = 10; // Points for successful collection
export const RANDOM_COLLECTION_FLIP_CHANCE = 0.10; // 10% random chance (to be removed in balance fixes)

// Scientific Score
export const STARTING_SCIENTIFIC_SCORE = 0;

// Time Advancement
export const DEFAULT_TIME_ADVANCE = 60; // Default minutes per action

// Fatigue Warning
export const FATIGUE_WARNING_DISPLAY_DURATION = 5000; // 5 seconds

// Location System
export const INITIAL_POSITION = { x: 1, y: 0 }; // Post Office Bay starting position

// UI Constants
export const DEBOUNCE_DELAY = 300; // Milliseconds for input debouncing

// Model Configuration
export const DEFAULT_MODEL_TEMPERATURE = 0.5;
export const DEFAULT_MAX_TOKENS = 1000;

// Retry Configuration
export const EXPONENTIAL_BACKOFF_DELAYS = [2000, 4000, 8000]; // 2s, 4s, 8s

export default {
  // Time
  GAME_START_TIME,
  MINUTES_PER_HOUR,
  HOURS_PER_DAY,
  STARTING_DAY,

  // Fatigue
  MAX_FATIGUE,
  STARTING_FATIGUE,
  HIGH_FATIGUE_WARNING_THRESHOLD,
  CRITICAL_FATIGUE_THRESHOLD,
  DEFAULT_FATIGUE_INCREASE,
  MOVEMENT_FATIGUE_BASE,

  // Input
  MAX_INPUT_LENGTH,
  MAX_COLLECTION_NOTES_LENGTH,
  MAX_COMMAND_LENGTH,

  // History
  MAX_EVENT_HISTORY,
  MAX_GAME_HISTORY,
  MAX_SUMMARY_QUEUE_SIZE,
  MIN_EVENT_CONTENT_LENGTH_FOR_SUMMARY,

  // API
  DEFAULT_API_TIMEOUT,
  DEFAULT_MAX_RETRIES,
  RETRY_DELAY_BASE,

  // Collection
  COLLECTION_SUCCESS_BONUS,
  RANDOM_COLLECTION_FLIP_CHANCE,

  // Score
  STARTING_SCIENTIFIC_SCORE,

  // Time
  DEFAULT_TIME_ADVANCE,

  // UI
  FATIGUE_WARNING_DISPLAY_DURATION,
  DEBOUNCE_DELAY,

  // Location
  INITIAL_POSITION,

  // Models
  DEFAULT_MODEL_TEMPERATURE,
  DEFAULT_MAX_TOKENS,

  // Retry
  EXPONENTIAL_BACKOFF_DELAYS
};
