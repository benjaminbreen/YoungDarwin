import OpenAI from 'openai';
import {
  beginLLMRequest,
  estimateTokens,
  fallbackForBlockedRequest,
  finishLLMRequest,
} from './llmSafety';

// Single default across every route. Luna matches gpt-5.4-nano on input price
// ($0.20/1M) and undercuts it on output ($1.20 vs $1.25) while being a full
// generation stronger, so there is no reason to keep a cheaper/weaker tier.
export const OPENAI_DEFAULT_MODEL = process.env.OPENAI_DEFAULT_MODEL || 'gpt-5.6-luna';

// Every route here is short-form prose (120-220 tokens of narration), not a
// reasoning task. `none` buys three things: zero reasoning tokens billed as
// output, lower latency, and — the reason it matters most — it is the only
// effort level that still accepts `temperature`, which each route sets
// deliberately (0.18 escapes, 0.24 standard, 0.38 animal narrator).
export const DEFAULT_REASONING_EFFORT = 'none';

export const LLM_MODELS = [
  {
    id: 'openai-luna',
    provider: 'openai',
    apiModel: OPENAI_DEFAULT_MODEL,
    maxTokens: 700,
    temperature: 0.35,
    reasoningEffort: DEFAULT_REASONING_EFFORT,
  },
  {
    id: 'gemini-flash-lite',
    provider: 'google',
    apiModel: process.env.GOOGLE_SMALL_MODEL || 'gemini-3.1-flash-lite',
    maxTokens: 700,
    temperature: 0.35,
  },
  {
    id: 'openai-fast',
    provider: 'openai',
    apiModel: process.env.OPENAI_FAST_MODEL || OPENAI_DEFAULT_MODEL,
    maxTokens: 900,
    temperature: 0.4,
    reasoningEffort: DEFAULT_REASONING_EFFORT,
  },
  {
    id: 'openai-small',
    provider: 'openai',
    apiModel: process.env.OPENAI_SMALL_MODEL || OPENAI_DEFAULT_MODEL,
    maxTokens: 500,
    temperature: 0.25,
    reasoningEffort: DEFAULT_REASONING_EFFORT,
  },
  {
    id: 'gemini-fast',
    provider: 'google',
    apiModel: process.env.GOOGLE_FAST_MODEL || 'gemini-2.0-flash',
    maxTokens: 900,
    temperature: 0.4,
  },
  {
    id: 'gemini-small',
    provider: 'google',
    apiModel: process.env.GOOGLE_SMALL_MODEL || 'gemini-3.1-flash-lite',
    maxTokens: 500,
    temperature: 0.25,
  },
];

export const DEFAULT_LLM_MODEL = process.env.YOUNG_DARWIN_DEFAULT_MODEL || 'openai-luna';

let openaiClient = null;

export function getGeminiApiKey() {
  return process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '';
}

function getOpenAIClient() {
  if (!process.env.OPENAI_API_KEY) return null;
  if (!openaiClient) {
    openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return openaiClient;
}

function shouldUseResponsesAPI(modelName = '') {
  return /^gpt-5(?:\.|-|$)/.test(String(modelName));
}

function extractOpenAIResponseText(response) {
  if (typeof response?.output_text === 'string') return response.output_text.trim();
  const parts = [];
  for (const item of response?.output || []) {
    for (const content of item?.content || []) {
      if (typeof content?.text === 'string') parts.push(content.text);
      else if (typeof content?.output_text === 'string') parts.push(content.output_text);
    }
  }
  return parts.join('').trim();
}

function isUnsupportedParamError(error, param) {
  const message = String(error?.message || '');
  return error?.status === 400 && message.includes(param);
}

// OpenAI documents `none | minimal | low | medium | high | xhigh | max` but
// notes that models support only a subset, and Luna's subset is undocumented.
// Rather than guess, degrade once on rejection and remember the verdict per
// model so we never pay a failed roundtrip twice.
const REASONING_FALLBACK = { none: 'minimal', minimal: 'low', low: null };
const modelCapabilities = new Map();

function capabilitiesFor(model) {
  if (!modelCapabilities.has(model)) {
    modelCapabilities.set(model, { effort: undefined, temperature: true });
  }
  return modelCapabilities.get(model);
}

function truncatedByReasoning(response) {
  return response?.status === 'incomplete'
    && response?.incomplete_details?.reason === 'max_output_tokens';
}

export async function createOpenAIText({
  client,
  model,
  systemPrompt,
  userPrompt,
  maxTokens,
  temperature,
  reasoningEffort,
}) {
  if (shouldUseResponsesAPI(model) && client.responses?.create) {
    const caps = capabilitiesFor(model);
    let effort = caps.effort !== undefined ? caps.effort : (reasoningEffort || null);

    const build = (tokens) => {
      const payload = {
        model,
        instructions: systemPrompt || 'You are a concise historical simulation assistant.',
        input: userPrompt || '',
        max_output_tokens: tokens,
        text: { format: { type: 'text' } },
      };
      // Sampling params are only accepted alongside effort `none`; sending them
      // with any other effort is a 400.
      if (caps.temperature && (!effort || effort === 'none')) payload.temperature = temperature;
      if (effort) payload.reasoning = { effort };
      return payload;
    };

    const send = async (tokens) => {
      for (;;) {
        try {
          return await client.responses.create(build(tokens));
        } catch (error) {
          if (effort && isUnsupportedParamError(error, 'effort')) {
            effort = REASONING_FALLBACK[effort] ?? null;
            caps.effort = effort;
            console.warn(`[llmProvider] ${model} rejected reasoning effort; falling back to ${effort || 'unset'}.`);
            continue;
          }
          if (caps.temperature && isUnsupportedParamError(error, 'temperature')) {
            caps.temperature = false;
            console.warn(`[llmProvider] ${model} rejected temperature; dropping sampling params.`);
            continue;
          }
          throw error;
        }
      }
    };

    let response = await send(maxTokens);

    // With effort `none` this should never fire. If it does, reasoning ate the
    // budget before emitting prose — retry once with real headroom rather than
    // handing the caller an empty string it will happily render as narration.
    if (truncatedByReasoning(response) && !extractOpenAIResponseText(response)) {
      const used = response?.usage?.output_tokens_details?.reasoning_tokens ?? 0;
      console.warn(`[llmProvider] ${model} spent ${used} reasoning tokens and emitted no text; retrying with headroom.`);
      response = await send(Math.max(maxTokens * 4, maxTokens + 4000));
    }

    const text = extractOpenAIResponseText(response);
    if (!text && truncatedByReasoning(response)) {
      throw new Error(`${model} returned no text: output budget exhausted by reasoning tokens.`);
    }
    return { text, usage: response?.usage || null };
  }

  const completion = await client.chat.completions.create({
    model,
    messages: [
      { role: 'system', content: systemPrompt || 'You are a concise historical simulation assistant.' },
      { role: 'user', content: userPrompt || '' },
    ],
    max_tokens: maxTokens,
    temperature,
  });
  return {
    text: completion.choices?.[0]?.message?.content || '',
    usage: completion?.usage || null,
  };
}

export function resolveModelConfig(modelId = DEFAULT_LLM_MODEL) {
  return LLM_MODELS.find(model => model.id === modelId || model.apiModel === modelId) ||
    LLM_MODELS.find(model => model.id === DEFAULT_LLM_MODEL) ||
    LLM_MODELS[0];
}

export function getAvailableFallback(modelConfig) {
  const preferred = modelConfig || resolveModelConfig();
  const ordered = [
    preferred,
    ...LLM_MODELS.filter(model => model.id !== preferred.id),
  ];

  return ordered.find(model => {
    if (model.provider === 'openai') return Boolean(process.env.OPENAI_API_KEY);
    if (model.provider === 'google') return Boolean(getGeminiApiKey());
    return false;
  });
}

export async function generateLLMText({
  systemPrompt,
  userPrompt,
  model,
  maxTokens,
  temperature,
  route = 'llmProvider',
  sessionId = 'anonymous',
  clientId = null,
  idempotencyKey,
  background = false,
} = {}) {
  const requested = resolveModelConfig(model);
  const config = getAvailableFallback(requested);
  if (!config) {
    throw new Error('No configured LLM provider is available. Set OPENAI_API_KEY, GEMINI_API_KEY, or GOOGLE_API_KEY.');
  }

  const effectiveMaxTokens = maxTokens || config.maxTokens || 600;
  const effectiveTemperature = temperature ?? config.temperature ?? 0.4;
  const guard = beginLLMRequest({
    route,
    provider: config.provider,
    model: config.apiModel,
    sessionId,
    clientId,
    idempotencyKey,
    prompt: `${systemPrompt || ''}\n${userPrompt || ''}`,
    background,
    estimatedInputTokens: estimateTokens(systemPrompt, userPrompt),
  });

  if (!guard.allowed) {
    if (guard.cached) return guard.cachedResponse;
    return {
      text: fallbackForBlockedRequest(guard.reason),
      provider: config.provider,
      model: config.apiModel,
      blocked: true,
      reason: guard.reason,
    };
  }

  if (config.provider === 'openai') {
    try {
      const client = getOpenAIClient();
      const { text, usage } = await createOpenAIText({
        client,
        model: config.apiModel,
        systemPrompt,
        userPrompt,
        maxTokens: effectiveMaxTokens,
        temperature: effectiveTemperature,
        reasoningEffort: config.reasoningEffort,
      });
      const response = {
        text,
        provider: config.provider,
        model: config.apiModel,
      };
      finishLLMRequest({
        key: guard.key,
        entryId: guard.entryId,
        response,
        // Prefer billed counts over the estimate when the API reports them —
        // reasoning tokens bill as output, so this is the only honest number.
        estimatedOutputTokens: usage?.output_tokens ?? estimateTokens(response.text),
        reasoningTokens: usage?.output_tokens_details?.reasoning_tokens ?? 0,
      });
      return response;
    } catch (error) {
      finishLLMRequest({ key: guard.key, entryId: guard.entryId, error });
      throw error;
    }
  }

  try {
    const apiKey = getGeminiApiKey();
    const geminiResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(config.apiModel)}:generateContent?key=${encodeURIComponent(apiKey)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: {
            parts: [{ text: systemPrompt || 'You are a concise historical simulation assistant.' }],
          },
          contents: [{ role: 'user', parts: [{ text: userPrompt || '' }] }],
          generationConfig: {
            maxOutputTokens: effectiveMaxTokens,
            temperature: effectiveTemperature,
          },
          safetySettings: [
            { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
            { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
            { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
            { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
          ],
        }),
      },
    );

    if (!geminiResponse.ok) {
      const errorText = await geminiResponse.text();
      throw new Error(`Gemini API request failed (${geminiResponse.status}): ${errorText}`);
    }

    const geminiData = await geminiResponse.json();
    const text = geminiData.candidates?.[0]?.content?.parts
      ?.map(part => part.text || '')
      .join('')
      .trim() || '';

    const response = {
      text,
      provider: config.provider,
      model: config.apiModel,
    };
    finishLLMRequest({
      key: guard.key,
      entryId: guard.entryId,
      response,
      estimatedOutputTokens: estimateTokens(response.text),
    });
    return response;
  } catch (error) {
    const fallback = LLM_MODELS.find(candidate => candidate.provider === 'openai' && process.env.OPENAI_API_KEY);
    if (!fallback || config.provider !== 'google') {
      finishLLMRequest({ key: guard.key, entryId: guard.entryId, error });
      throw error;
    }

    try {
      const client = getOpenAIClient();
      const { text, usage } = await createOpenAIText({
        client,
        model: fallback.apiModel,
        systemPrompt,
        userPrompt,
        maxTokens: effectiveMaxTokens,
        temperature: effectiveTemperature,
        reasoningEffort: fallback.reasoningEffort,
      });
      const response = {
        text,
        provider: fallback.provider,
        model: fallback.apiModel,
        fallbackFrom: config.apiModel,
      };
      finishLLMRequest({
        key: guard.key,
        entryId: guard.entryId,
        response,
        estimatedOutputTokens: usage?.output_tokens ?? estimateTokens(response.text),
        reasoningTokens: usage?.output_tokens_details?.reasoning_tokens ?? 0,
      });
      return response;
    } catch (fallbackError) {
      finishLLMRequest({ key: guard.key, entryId: guard.entryId, error: fallbackError });
      throw fallbackError;
    }
  }
}
