import OpenAI from 'openai';
import {
  beginLLMRequest,
  estimateTokens,
  fallbackForBlockedRequest,
  finishLLMRequest,
} from './llmSafety';

export const LLM_MODELS = [
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
    apiModel: process.env.OPENAI_FAST_MODEL || 'gpt-5.4-mini',
    maxTokens: 900,
    temperature: 0.4,
  },
  {
    id: 'openai-small',
    provider: 'openai',
    apiModel: process.env.OPENAI_SMALL_MODEL || 'gpt-5.4-nano',
    maxTokens: 500,
    temperature: 0.25,
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

export const DEFAULT_LLM_MODEL = process.env.YOUNG_DARWIN_DEFAULT_MODEL || 'gemini-flash-lite';

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

async function createOpenAIText({
  client,
  model,
  systemPrompt,
  userPrompt,
  maxTokens,
  temperature,
}) {
  if (shouldUseResponsesAPI(model) && client.responses?.create) {
    const response = await client.responses.create({
      model,
      instructions: systemPrompt || 'You are a concise historical simulation assistant.',
      input: userPrompt || '',
      max_output_tokens: maxTokens,
      temperature,
      text: {
        format: { type: 'text' },
      },
    });
    return extractOpenAIResponseText(response);
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
  return completion.choices?.[0]?.message?.content || '';
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
      const text = await createOpenAIText({
        client,
        model: config.apiModel,
        systemPrompt,
        userPrompt,
        maxTokens: effectiveMaxTokens,
        temperature: effectiveTemperature,
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
        estimatedOutputTokens: estimateTokens(response.text),
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
      const text = await createOpenAIText({
        client,
        model: fallback.apiModel,
        systemPrompt,
        userPrompt,
        maxTokens: effectiveMaxTokens,
        temperature: effectiveTemperature,
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
        estimatedOutputTokens: estimateTokens(response.text),
      });
      return response;
    } catch (fallbackError) {
      finishLLMRequest({ key: guard.key, entryId: guard.entryId, error: fallbackError });
      throw fallbackError;
    }
  }
}
