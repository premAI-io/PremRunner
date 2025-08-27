import { Hono } from 'hono';
import { describeRoute } from 'hono-openapi';
import { resolver } from 'hono-openapi/zod';
import { HTTPException } from 'hono/http-exception';
import { proxy } from 'hono/proxy';

import { zValidator } from '@hono/zod-validator';

import config from '@/config';
import { billLLMCall } from '@/utils/billingUtils';
import { insertLLMCost } from '@/utils/costUtils';

import { ChatModel, Provider, getModels } from './aiModels';
import {
	validateFunctionCallingSupport,
	validateJsonOutputSupport,
	validateModelAccess
} from './utils';
import {
	OpenAIChatCompletionChunkSchema,
	OpenAIChatCompletionRequestSchema,
	OpenAIChatCompletionResponseSchema
} from './utils';

const { POWERED_BY, LLM_REQUEST_TIMEOUT } = config;

const app = new Hono()
	.get('/internalModels', async (c) => {
		const userId = c.get('userId') as string;
		const models = await getModels(userId);

		// Remove cost fields, only return price fields
		const modelsWithoutCosts = models.map(
			({ inputCostPer1MTokens, outputCostPer1MTokens, ...model }) => model
		);

		console.log('[API /internal-models] Returning raw internal structure.');
		return c.json(modelsWithoutCosts);
	})
	.post(
		'/completions',
		describeRoute({
			tags: ['Chat'],
			operationId: 'chat.completions.create',
			description: 'Create a chat completion (OpenAI compatible).',
			requestBody: {
				content: {
					'application/json': resolver(OpenAIChatCompletionRequestSchema).builder()
				}
			},
			responses: {
				200: {
					description:
						'Successful chat completion response (non-streaming). For streaming, use stream=true and expect text/event-stream.',
					content: {
						'application/json': resolver(OpenAIChatCompletionResponseSchema).builder(),
						'text/event-stream': resolver(OpenAIChatCompletionChunkSchema).builder()
					}
				}
			}
		}),
		zValidator('json', OpenAIChatCompletionRequestSchema),
		async (c) => {
			const payload = c.req.valid('json');
			const userId = c.get('userId');

			const modelInfo = await validateModelAccess(payload.model, userId);

			// Validate JSON output support before proceeding
			validateJsonOutputSupport(modelInfo, payload.response_format);

			// Validate function calling support before proceeding
			validateFunctionCallingSupport(modelInfo, payload.tools, payload.tool_choice);

			const requestBody = { ...payload, model: modelInfo.id } as any;
			// Force temperature for OpenAI models
			if (modelInfo.provider === Provider.OPENAI) {
				requestBody.temperature = 1;
			}
			if (requestBody.stream) {
				requestBody.stream_options = { include_usage: true };
			}
			if (requestBody.max_completion_tokens === null) {
				requestBody.max_completion_tokens = modelInfo.maxCompletionTokens;
			}

			const response = await proxy(
				`${modelInfo.provider === Provider.PREM ? config.proxyGatewaySelfHostedUrl : config.proxyGatewayUrl}/v1/chat/completions`,
				{
					method: 'POST',
					body: JSON.stringify(requestBody),
					headers: {
						[`x-${POWERED_BY}-request-timeout`]: LLM_REQUEST_TIMEOUT.toString(),
						'content-type': 'application/json',
						[`x-${POWERED_BY}-provider`]: modelInfo.provider,
						[`x-${POWERED_BY}-model`]: modelInfo.id,
						...getHeader(modelInfo.provider)
					}
				}
			);
			return handleResponse(
				response,
				modelInfo,
				userId,
				c.get('completionTask') ?? 'chat-inference',
				payload.model
			);
		}
	);

export default app;

const getHeader = (provider: Provider) => {
	switch (provider) {
		case Provider.OPENAI:
			return {
				Authorization: `Bearer ${config.openaiApiKey}`
			};
		case Provider.PREM:
			return {
				Authorization: `Bearer ${config.INFERENCE_API_KEY}`,
				[`x-${POWERED_BY}-request-timeout`]: LLM_REQUEST_TIMEOUT.toString(),
				[`x-${POWERED_BY}-provider`]: 'openai',
				[`x-${POWERED_BY}-custom-host`]:
					config.INFERENCE_BASE_URL + (config.INFERENCE_BASE_URL.endsWith('/') ? 'v1' : '/v1')
			};
		case Provider.BEDROCK:
			return {
				[`x-${POWERED_BY}-request-timeout`]: LLM_REQUEST_TIMEOUT.toString(),
				[`x-${POWERED_BY}-aws-region`]: config.AWS_BEDROCK_REGION,
				[`x-${POWERED_BY}-aws-access-key-id`]: config.AWS_ACCESS_KEY_ID,
				[`x-${POWERED_BY}-aws-secret-access-key`]: config.AWS_SECRET_ACCESS_KEY
			};
		case Provider.OPEN_ROUTER:
			return {
				Authorization: `Bearer ${config.openRouterApiKey}`
			};
		default:
			return {};
	}
};

async function handleResponse(
	response: Response,
	model: ChatModel,
	userId: string,
	taskType: string,
	originalModelRequest: string
) {
	// Clean up headers
	response.headers.delete(`x-${POWERED_BY}-provider`);
	response.headers.delete(`x-${POWERED_BY}-cache-status`);
	response.headers.delete(`x-${POWERED_BY}-retry-attempt-count`);
	response.headers.delete(`x-${POWERED_BY}-last-used-option-index`);

	// Log usage for both streaming and non-streaming
	const contentType = response.headers.get('content-type');
	if (contentType?.includes('text/event-stream')) {
		// For streaming, intercept with TransformStream
		const transformStream = new TransformStream({
			transform(chunk, controller) {
				const text = new TextDecoder().decode(chunk);
				// Look for usage in SSE data lines and mask provider info
				const lines = text.split('\n');
				const modifiedLines: string[] = [];

				for (const line of lines) {
					if (line.startsWith('data: ') && !line.includes('[DONE]')) {
						try {
							const data = JSON.parse(line.substring(6));

							// Mask the model field to show original user request instead of real provider model
							if (data.model) {
								data.model = originalModelRequest;
							}
							if (data.provider) {
								data.provider = 'prem';
							}
							// Only process when usage information is present and not null
							if (
								data.usage &&
								data.usage.prompt_tokens &&
								data.usage.completion_tokens &&
								data.id
							) {
								const chatId = data.id;
								const promptTokens = data.usage.prompt_tokens;
								const completionTokens = data.usage.completion_tokens;

								insertLLMCost(userId, taskType, model, promptTokens, completionTokens, chatId);
								billLLMCall(userId, taskType, model, promptTokens, completionTokens, chatId);
							}

							// Reconstruct the SSE line with masked data
							modifiedLines.push(`data: ${JSON.stringify(data)}`);
						} catch (e) {
							// If parsing fails, keep original line
							modifiedLines.push(line);
						}
					} else {
						// Keep non-data lines as is
						modifiedLines.push(line);
					}
				}

				const modifiedText = modifiedLines.join('\n');
				controller.enqueue(new TextEncoder().encode(modifiedText));
			}
		});
		return new Response(response.body?.pipeThrough(transformStream), {
			status: response.status,
			statusText: response.statusText,
			headers: response.headers
		});
	} else if (contentType?.includes('application/json')) {
		// For JSON, clone, modify, and log
		try {
			const data = (await response.clone().json()) as {
				id?: string;
				model?: string;
				provider?: string;
				usage?: {
					prompt_tokens?: number;
					completion_tokens?: number;
				};
				error?: {
					message?: string;
					type?: string;
					param?: string;
					code?: string;
				};
			};

			// Mask the model field to show original user request instead of real provider model
			if (data.model) {
				data.model = originalModelRequest;
			}
			if (data.provider) {
				data.provider = 'prem';
			}

			// Also mask provider info in error messages
			if (data.error?.message) {
				// Replace any occurrence of the real model ID with the original user request
				data.error.message = data.error.message.replace(
					new RegExp(model.id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'),
					originalModelRequest
				);
				// Replace provider names in error messages
				data.error.message = data.error.message
					.replace(/\bopenai\b/gi, 'prem')
					.replace(/\bopenrouter\b/gi, 'prem')
					.replace(/\bbedrock\b/gi, 'prem')
					.replace(/\baws\b/gi, 'prem')
					.replace(/\banthropic\b/gi, 'prem');
			}

			const chatId = data.id;
			const promptTokens = data.usage?.prompt_tokens;
			const completionTokens = data.usage?.completion_tokens;

			if (chatId && promptTokens && completionTokens) {
				insertLLMCost(userId, taskType, model, promptTokens, completionTokens, chatId);
				billLLMCall(userId, taskType, model, promptTokens, completionTokens, chatId);
			}

			// Return modified response with masked model name
			return new Response(JSON.stringify(data), {
				status: response.status,
				statusText: response.statusText,
				headers: response.headers
			});
		} catch (e) {
			// If parsing fails, return original response
		}
	}

	return response;
}
