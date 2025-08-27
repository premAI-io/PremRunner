import { HTTPException } from 'hono/http-exception';

import { z } from 'zod';
import { extendZodWithOpenApi } from 'zod-openapi';

import { resolveModelByIdOrAlias } from './aiModels';

extendZodWithOpenApi(z);

export const OpenAIMessageSchema = z.object({
	role: z
		.enum(['system', 'user', 'assistant', 'tool'])
		.describe(
			'The role of the message sender. "system" is for system-level instructions, "user" represents the end user, and "assistant" represents the AI model\'s responses.'
		),
	content: z
		.string()
		.nullable()
		.optional()
		.describe(
			"The actual text content of the message. Note that this can be null in certain cases, such as when the message contains tool calls or when specific roles don't require content."
		),
	name: z.string().optional().describe('The name of the function to call, if any.'),
	tool_calls: z
		.array(
			z.object({
				id: z.string().describe('A unique identifier for this tool call'),
				type: z.literal('function').describe('The type of tool call'),
				function: z.object({
					name: z.string().describe('The name of the function to call'),
					arguments: z.string().describe('The arguments to pass to the function as a JSON string')
				})
			})
		)
		.optional()
		.describe('Tool calls to be made by the assistant'),
	tool_call_id: z
		.string()
		.optional()
		.describe(
			'The ID of the tool call that this message is a response to (only for tool role messages)'
		)
});
// Schema for the chat completion request, aligning with OpenAI spec
// https://platform.openai.com/docs/api-reference/chat/create

export const OpenAIChatCompletionRequestSchema = z.object({
	messages: z
		.array(OpenAIMessageSchema)
		.min(1)
		.refine((messages) => !messages.some((msg, index) => msg.role === 'system' && index !== 0), {
			message: 'System messages can only appear at index 0'
		})
		.describe(
			'An array of messages comprising the conversation so far. Must contain at least one message. System messages are only allowed as the first message.'
		),
	model: z
		.string()
		.describe(
			'The identifier of the model to use for generating completions. This can be a model ID or an alias.'
		),
	frequency_penalty: z
		.number()
		.min(-2.0)
		.max(2.0)
		.default(0)
		.optional()
		.describe(
			'A value between -2.0 and 2.0 that penalizes new tokens based on their frequency in the text so far. Higher values decrease the likelihood of the model repeating the same tokens.'
		),
	max_completion_tokens: z
		.number()
		.int()
		.positive()
		.nullable()
		.default(null)
		.optional()
		.describe(
			"The maximum number of tokens to generate in the completion. If null, will use the model's maximum context length. This is the maximum number of tokens that will be generated."
		),
	presence_penalty: z
		.number()
		.min(-2.0)
		.max(2.0)
		.default(0)
		.optional()
		.describe(
			'A value between -2.0 and 2.0 that penalizes new tokens based on whether they appear in the text so far. Higher values increase the likelihood of the model talking about new topics.'
		),
	seed: z
		.number()
		.int()
		.optional()
		.describe(
			'A seed value for deterministic sampling. Using the same seed with the same parameters will generate the same completion.'
		),
	stop: z
		.union([z.string(), z.array(z.string())])
		.optional()
		.describe(
			'One or more sequences where the API will stop generating further tokens. Can be a single string or an array of strings.'
		),
	stream: z
		.boolean()
		.default(false)
		.optional()
		.describe(
			'If true, partial message deltas will be sent as server-sent events. Useful for showing progressive generation in real-time.'
		),
	temperature: z
		.number()
		.min(0.0)
		.max(2.0)
		.nullable()
		.default(0.7)
		.optional()
		.describe(
			"Controls randomness in the model's output. Values between 0 and 2. Lower values make the output more focused and deterministic, higher values make it more random and creative."
		),
	top_p: z
		.number()
		.min(0.0)
		.max(1.0)
		.nullable()
		.default(1)
		.optional()
		.describe(
			'An alternative to temperature for controlling randomness. Controls the cumulative probability of tokens to consider. Lower values make output more focused.'
		),
	response_format: z
		.object({
			type: z.enum(['text', 'json_schema']),
			json_schema: z.record(z.any())
		})
		.default({ type: 'text', json_schema: {} })
		.optional()
		.describe(
			'Specifies the format of the model\'s output. Use "json_schema" to constrain responses to valid JSON matching the provided schema.'
		),
	tools: z
		.array(z.any())
		.optional()
		.describe(
			'A list of tools the model may call. Each tool has a specific function the model can use to achieve specific tasks.'
		),
	tool_choice: z
		.union([z.literal('none'), z.literal('auto'), z.object({})])
		.optional()
		.describe(
			'Controls how the model uses tools. "none" disables tools, "auto" lets the model decide, or specify a particular tool configuration.'
		)
});
// Schema for a choice in the chat completion response
export const OpenAIChatCompletionChoiceSchema = z.object({
	finish_reason: z.enum(['stop', 'length', 'tool_calls', 'content_filter', 'function_call']), // Added more reasons
	index: z.number().int().nonnegative(),
	message: z.object({
		content: z.string().nullable(),
		role: z.enum(['assistant', 'tool']),
		name: z.string().optional(),
		tool_calls: z
			.array(
				z.object({
					id: z.string(),
					type: z.literal('function'),
					function: z.object({
						name: z.string(),
						arguments: z.string()
					})
				})
			)
			.optional(),
		tool_call_id: z.string().optional()
	})
	// logprobs: z.any().optional() // Example if needed
});
// Schema for the usage object in the chat completion response
export const OpenAIUsageSchema = z.object({
	completion_tokens: z
		.number()
		.int()
		.nonnegative()
		.describe(
			"The number of tokens generated in the completion response. This counts only the tokens in the assistant's reply."
		),
	prompt_tokens: z
		.number()
		.int()
		.nonnegative()
		.describe(
			'The number of tokens in the prompt/input. This includes all messages sent to the API in the conversation history.'
		),
	total_tokens: z.number().int().nonnegative()
});
// Schema for the non-streaming chat completion response
// https://platform.openai.com/docs/api-reference/chat/object

export const OpenAIChatCompletionResponseSchema = z.object({
	id: z
		.string()
		.describe(
			'A unique identifier for this chat completion response. Can be used for tracking or debugging.'
		),
	choices: z
		.array(OpenAIChatCompletionChoiceSchema)
		.describe(
			'An array of completion choices. Each choice represents a possible completion for the input prompt, though currently only one choice is typically returned.'
		),
	created: z
		.number()
		.int()
		.describe(
			'The Unix timestamp (in seconds) indicating when this completion was generated by the API.'
		),
	model: z
		.string()
		.describe(
			"The specific model used to generate this completion. This will be the model's full identifier string."
		),
	system_fingerprint: z
		.string()
		.optional()
		.nullable()
		.describe(
			'A unique identifier for the system state that generated this response. Useful for tracking model behavior across requests.'
		),
	object: z
		.literal('chat.completion')
		.describe(
			'The type of object returned, always "chat.completion" for chat completion responses.'
		),
	usage: OpenAIUsageSchema.optional().describe(
		'Statistics about token usage for this request and response. May be omitted in error cases or when not available.'
	)
});
// Schema for a single model object, aligning with OpenAI spec
// https://platform.openai.com/docs/api-reference/models/object

export const OpenAIModelSchema = z.object({
	id: z
		.string()
		.describe(
			'The unique identifier of the model. This can be used to specify the model in API requests. For fine-tuned models, this may include a user-specific prefix.'
		),
	created: z
		.number()
		.int()
		.describe(
			'Unix timestamp (in seconds) when this model was created or made available. For fine-tuned models, this represents when the fine-tuning was completed.'
		),
	object: z
		.literal('model')
		.describe(
			'The type of object represented, which is always "model" for model objects. This helps distinguish model objects from other types of responses.'
		),
	owned_by: z
		.string()
		.describe(
			'Identifies the owner or provider of the model. Can be "premai" for base models, a user ID for fine-tuned models, or other providers like "openai" or "anthropic".'
		)
	// Add other fields like 'permission', 'root', 'parent' if needed
});
// Schema for the list models response, aligning with OpenAI spec
// https://platform.openai.com/docs/api-reference/models/list

export const OpenAIModelListResponseSchema = z.object({
	object: z
		.literal('list')
		.describe(
			'The type of object returned, always "list" for model listing responses. Helps identify this as a collection of models.'
		),
	data: z
		.array(OpenAIModelSchema)
		.describe(
			'An array containing the available models. Each element is a complete model object with all its properties.'
		)
});

// Schema for function call delta in streaming responses
export const OpenAIFunctionCallDeltaSchema = z.object({
	arguments: z
		.string()
		.optional()
		.describe('The arguments passed to the function in string format, typically JSON-formatted'),
	name: z.string().optional().describe('The name of the function being called in this delta update')
});

// Schema for tool call function delta in streaming responses
export const OpenAIToolCallFunctionDeltaSchema = z.object({
	arguments: z
		.string()
		.optional()
		.describe('The arguments passed to the tool function, typically provided as a JSON string'),
	name: z.string().optional().describe('The name of the tool function being invoked in this delta')
});

// Schema for tool call delta in streaming responses
export const OpenAIToolCallDeltaSchema = z.object({
	index: z.number().int().describe('The position of this tool call in the sequence of tool calls'),
	id: z.string().optional().describe('A unique identifier for this specific tool call instance'),
	function: OpenAIToolCallFunctionDeltaSchema.optional().describe(
		'The function details for this tool call'
	),
	type: z
		.literal('function')
		.optional()
		.describe('The type of tool call, currently only supports "function"')
});

// Schema for choice delta in streaming responses
export const OpenAIChoiceDeltaSchema = z.object({
	content: z.string().optional().describe('The actual text content generated in this delta update'),
	function_call: OpenAIFunctionCallDeltaSchema.optional().describe(
		'Information about a function call being made in this delta'
	),
	refusal: z.string().optional().describe('Any refusal message if the model declines to respond'),
	role: z
		.enum(['developer', 'system', 'user', 'assistant', 'tool'])
		.optional()
		.describe('The role of the entity generating this message part'),
	tool_calls: z
		.array(OpenAIToolCallDeltaSchema)
		.optional()
		.describe('Array of tool calls being made in this delta update')
});

// Schema for a choice in streaming chat completion response
export const OpenAIStreamingChoiceSchema = z.object({
	delta: OpenAIChoiceDeltaSchema.describe('The incremental update to the completion in this chunk'),
	finish_reason: z
		.enum(['stop', 'length', 'tool_calls', 'content_filter', 'function_call'])
		.optional()
		.describe('The reason why the completion stopped, if applicable in this chunk'),
	index: z
		.number()
		.int()
		.nonnegative()
		.describe('The index of this choice in the array of choices'),
	logprobs: z
		.any()
		.optional()
		.describe('Log probabilities of the tokens in this chunk, if requested') // Could be expanded if needed
});

// Schema for the streaming chat completion chunk response
export const OpenAIChatCompletionChunkSchema = z.object({
	id: z.string().describe('A unique identifier for this streaming completion chunk'),
	choices: z
		.array(OpenAIStreamingChoiceSchema)
		.describe('Array of completion choices in this chunk, typically contains one choice'),
	created: z.number().int().describe('Unix timestamp (in seconds) when this chunk was generated'),
	model: z.string().describe('The identifier of the model used to generate this completion chunk'),
	object: z
		.literal('chat.completion.chunk')
		.describe('Type identifier indicating this is a chat completion chunk'),
	service_tier: z
		.enum(['auto', 'default', 'flex'])
		.optional()
		.describe('The service tier used for this completion request'),
	system_fingerprint: z
		.string()
		.optional()
		.describe('A unique identifier for the system state that generated this chunk'),
	usage: OpenAIUsageSchema.optional().describe(
		'Token usage statistics, only included in the final chunk when requested'
	)
});

export async function validateModelAccess(modelName: string, userId: string) {
	const modelInfo = await resolveModelByIdOrAlias(modelName, userId);

	if (!modelInfo) {
		throw new HTTPException(404, {
			message: `The model \`${modelName}\` does not exist or you do not have access to it.`
		});
	}

	return modelInfo;
}

export function validateJsonOutputSupport(
	modelInfo: { alias: string; supportsJsonOutput: boolean },
	responseFormat?: { type: string; json_schema?: any }
) {
	// Check if JSON output is requested
	if (responseFormat?.type === 'json_schema') {
		if (!modelInfo.supportsJsonOutput) {
			throw new HTTPException(400, {
				message: `The model \`${modelInfo.alias}\` does not support JSON output format. Please use a different model or remove the response_format parameter.`
			});
		}
	}
}

export function validateFunctionCallingSupport(
	modelInfo: { alias: string; supportsFunctionCalling: boolean },
	tools?: any[],
	toolChoice?: string | object
) {
	// Check if function calling is requested
	const hasFunctionCalling = tools && tools.length > 0;
	const hasToolChoice = toolChoice && toolChoice !== 'none';

	if (hasFunctionCalling || hasToolChoice) {
		if (!modelInfo.supportsFunctionCalling) {
			throw new HTTPException(400, {
				message: `The model \`${modelInfo.alias}\` does not support function calling. Please use a different model or remove the tools and tool_choice parameters.`
			});
		}
	}
}
