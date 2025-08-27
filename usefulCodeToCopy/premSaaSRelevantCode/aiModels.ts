import { eq } from "drizzle-orm";

import { InferenceClient } from "@/clients/inference";
import { db } from "@/db/config";
import { models } from "@/db/schema";

export enum Provider {
  OPENAI = "openai",
  PREM = "prem",
  BEDROCK = "bedrock",
  OPEN_ROUTER = "openrouter",
}

export type ChatModel = {
  id: string;
  alias: string;
  provider: Provider;
  fineTuned: boolean;
  maxCompletionTokens: number;
  inputCostPer1MTokens: number;
  outputCostPer1MTokens: number;
  inputPricePer1MTokens: number;
  outputPricePer1MTokens: number;
  group: string;
  supportsJsonOutput: boolean;
  supportsFunctionCalling: boolean;
};

const openAIModels: ChatModel[] = [
  {
    id: "gpt-5",
    alias: "gpt-5",
    provider: Provider.OPENAI,
    fineTuned: false,
    maxCompletionTokens: 128000,
    inputCostPer1MTokens: 1.25,
    outputCostPer1MTokens: 10.0,
    inputPricePer1MTokens: 2.5,
    outputPricePer1MTokens: 20.0,
    group: "gpt",
    supportsJsonOutput: true,
    supportsFunctionCalling: true,
  },
  {
    id: "gpt-5-mini",
    alias: "gpt-5-mini",
    provider: Provider.OPENAI,
    fineTuned: false,
    maxCompletionTokens: 128000,
    inputCostPer1MTokens: 0.25,
    outputCostPer1MTokens: 2.0,
    inputPricePer1MTokens: 0.5,
    outputPricePer1MTokens: 4.0,
    group: "gpt",
    supportsJsonOutput: true,
    supportsFunctionCalling: true,
  },
  {
    id: "gpt-5-nano",
    alias: "gpt-5-nano",
    provider: Provider.OPENAI,
    fineTuned: false,
    maxCompletionTokens: 128000,
    inputCostPer1MTokens: 0.05,
    outputCostPer1MTokens: 0.4,
    inputPricePer1MTokens: 0.1,
    outputPricePer1MTokens: 0.8,
    group: "gpt",
    supportsJsonOutput: true,
    supportsFunctionCalling: true,
  },
];

const openRouterModels: ChatModel[] = [
  {
    id: "google/gemma-3-4b-it",
    alias: "gemma3-4b",
    provider: Provider.OPEN_ROUTER,
    fineTuned: false,
    maxCompletionTokens: 32000,
    inputCostPer1MTokens: 0.02,
    outputCostPer1MTokens: 0.04,
    inputPricePer1MTokens: 0.1,
    outputPricePer1MTokens: 0.3,
    group: "gemma",
    supportsJsonOutput: true,
    supportsFunctionCalling: false,
  },
  {
    id: "meta-llama/llama-3.1-8b-instruct",
    alias: "llama3.1-8b",
    provider: Provider.OPEN_ROUTER,
    fineTuned: false,
    maxCompletionTokens: 32000,
    inputCostPer1MTokens: 0.016,
    outputCostPer1MTokens: 0.021,
    inputPricePer1MTokens: 0.1,
    outputPricePer1MTokens: 0.3,
    group: "llama",
    supportsJsonOutput: true,
    supportsFunctionCalling: false,
  },
  {
    id: "meta-llama/llama-3.2-1b-instruct",
    alias: "llama3.2-1b",
    provider: Provider.OPEN_ROUTER,
    fineTuned: false,
    maxCompletionTokens: 32000,
    inputCostPer1MTokens: 0.005,
    outputCostPer1MTokens: 0.01,
    inputPricePer1MTokens: 0.1,
    outputPricePer1MTokens: 0.3,
    group: "llama",
    supportsJsonOutput: false,
    supportsFunctionCalling: false,
  },
  {
    id: "meta-llama/llama-3.2-3b-instruct",
    alias: "llama3.2-3b",
    provider: Provider.OPEN_ROUTER,
    fineTuned: false,
    maxCompletionTokens: 32000,
    inputCostPer1MTokens: 0.003,
    outputCostPer1MTokens: 0.006,
    inputPricePer1MTokens: 0.1,
    outputPricePer1MTokens: 0.3,
    group: "llama",
    supportsJsonOutput: false,
    supportsFunctionCalling: false,
  },
  {
    id: "microsoft/phi-3.5-mini-128k-instruct",
    alias: "phi-3.5-mini",
    provider: Provider.OPEN_ROUTER,
    fineTuned: false,
    maxCompletionTokens: 128000,
    inputCostPer1MTokens: 0.1,
    outputCostPer1MTokens: 0.1,
    inputPricePer1MTokens: 0.1,
    outputPricePer1MTokens: 0.3,
    group: "phi",
    supportsJsonOutput: false,
    supportsFunctionCalling: false,
  },
  {
    id: "microsoft/phi-4",
    alias: "phi-4",
    provider: Provider.OPEN_ROUTER,
    fineTuned: false,
    maxCompletionTokens: 16000,
    inputCostPer1MTokens: 0.07,
    outputCostPer1MTokens: 0.14,
    inputPricePer1MTokens: 0.1,
    outputPricePer1MTokens: 0.3,
    group: "phi",
    supportsJsonOutput: true,
    supportsFunctionCalling: false,
  },
  {
    id: "qwen/qwen-2.5-vl-7b-instruct",
    alias: "qwen2.5-7b",
    provider: Provider.OPEN_ROUTER,
    fineTuned: false,
    maxCompletionTokens: 16000,
    inputCostPer1MTokens: 0.2,
    outputCostPer1MTokens: 0.2,
    inputPricePer1MTokens: 0.1,
    outputPricePer1MTokens: 0.3,
    group: "qwen",
    supportsJsonOutput: false,
    supportsFunctionCalling: false,
  },
  {
    id: "qwen/qwen3-30b-a3b-instruct-2507",
    alias: "qwen-flash",
    provider: Provider.OPEN_ROUTER,
    fineTuned: false,
    maxCompletionTokens: 131072,
    inputCostPer1MTokens: 0.2,
    outputCostPer1MTokens: 0.8,
    inputPricePer1MTokens: 0.2,
    outputPricePer1MTokens: 0.8,
    group: "qwen",
    supportsJsonOutput: false,
    supportsFunctionCalling: false,
  },
  {
    id: "openai/gpt-oss-20b",
    alias: "gpt-oss-20b",
    provider: Provider.OPEN_ROUTER,
    fineTuned: false,
    maxCompletionTokens: 131072,
    inputCostPer1MTokens: 0.04,
    outputCostPer1MTokens: 0.16,
    inputPricePer1MTokens: 0.1,
    outputPricePer1MTokens: 0.3,
    group: "gpt-oss",
    supportsJsonOutput: true,
    supportsFunctionCalling: false,
  },
  {
    id: "openai/gpt-oss-120b",
    alias: "gpt-oss-120b",
    provider: Provider.OPEN_ROUTER,
    fineTuned: false,
    maxCompletionTokens: 131072,
    inputCostPer1MTokens: 0.073,
    outputCostPer1MTokens: 0.29,
    inputPricePer1MTokens: 0.1,
    outputPricePer1MTokens: 0.3,
    group: "gpt-oss",
    supportsJsonOutput: true,
    supportsFunctionCalling: false,
  },
  // Inference models number: 16
  // HERE'S THE MODEL FILE:  svc/src/configs/models/models.json
  // gemma3-1b | google/gemma-3-1b-it NOT PRESENT IN OPENROUTER
  // gemma3-4b | google/gemma-3-4b-it DONE
  // llama3.1-8b | meta-llama/Llama-3.1-8B-Instruct  DONE
  // llama3.2-1b | meta-llama/Llama-3.2-1B-Instruct DONE
  // llama3.2-3b | meta-llama/Llama-3.2-3B-Instruct DONE
  // phi-3.5-mini | microsoft/Phi-3.5-mini-instruct DONE
  // phi-4 | microsoft/Phi-4 DONE
  // qwen2.5-0.5b | Qwen/Qwen2.5-0.5B-Instruct NOT PRESENT IN OPENROUTER
  // qwen2.5-1.5b | Qwen/Qwen2.5-1.5B-Instruct NOT PRESENT IN OPENROUTER
  // qwen2.5-3b | Qwen/Qwen2.5-3B-Instruct NOT PRESENT IN OPENROUTER
  // qwen2.5-7b | Qwen/Qwen2.5-7B-Instruct DONE
  // qwen2.5-math-1.5b | Qwen/Qwen2.5-Math-1.5B-Instruct NOT PRESENT IN OPENROUTER
  // qwen2.5-math-7b | Qwen/Qwen2.5-Math-7B-Instruct NOT PRESENT IN OPENROUTER
  // smollm-1.7b | HuggingFaceTB/SmolLM2-1.7B-Instruct NOT PRESENT IN OPENROUTER
  // smollm-135m | HuggingFaceTB/SmolLM2-135M-Instruct NOT PRESENT IN OPENROUTER
  // smollm-360m | HuggingFaceTB/SmolLM2-360M-Instruct NOT PRESENT IN OPENROUTER
];

const bedrockModels: ChatModel[] = [
  {
    id: "us.anthropic.claude-sonnet-4-20250514-v1:0",
    alias: "claude-4-sonnet",
    provider: Provider.BEDROCK,
    fineTuned: false,
    maxCompletionTokens: 64000,
    inputCostPer1MTokens: 3.0,
    outputCostPer1MTokens: 15.0,
    inputPricePer1MTokens: 6.0,
    outputPricePer1MTokens: 30.0,
    group: "claude",
    supportsJsonOutput: false,
    supportsFunctionCalling: true,
  },
  {
    id: "us.anthropic.claude-3-7-sonnet-20250219-v1:0",
    alias: "claude-3.7-sonnet",
    provider: Provider.BEDROCK,
    fineTuned: false,
    maxCompletionTokens: 64000,
    inputCostPer1MTokens: 3.0,
    outputCostPer1MTokens: 15.0,
    inputPricePer1MTokens: 6.0,
    outputPricePer1MTokens: 30.0,
    group: "claude",
    supportsJsonOutput: false,
    supportsFunctionCalling: true,
  },
  {
    id: "us.anthropic.claude-3-5-sonnet-20241022-v2:0",
    alias: "claude-3.5-sonnet",
    provider: Provider.BEDROCK,
    fineTuned: false,
    maxCompletionTokens: 8192,
    inputCostPer1MTokens: 3.0,
    outputCostPer1MTokens: 15.0,
    inputPricePer1MTokens: 6.0,
    outputPricePer1MTokens: 30.0,
    group: "claude",
    supportsJsonOutput: false,
    supportsFunctionCalling: true,
  },
  {
    id: "us.anthropic.claude-3-5-haiku-20241022-v1:0",
    alias: "claude-3.5-haiku",
    provider: Provider.BEDROCK,
    fineTuned: false,
    maxCompletionTokens: 8192,
    inputCostPer1MTokens: 0.8,
    outputCostPer1MTokens: 4.0,
    inputPricePer1MTokens: 1.6,
    outputPricePer1MTokens: 8.0,
    group: "claude",
    supportsJsonOutput: false,
    supportsFunctionCalling: true,
  },
  {
    id: "us.deepseek.r1-v1:0",
    alias: "deepseek-r1",
    provider: Provider.BEDROCK,
    fineTuned: false,
    maxCompletionTokens: 32768,
    inputCostPer1MTokens: 1.35,
    outputCostPer1MTokens: 5.4,
    inputPricePer1MTokens: 2.7,
    outputPricePer1MTokens: 10.8,
    group: "deepseek",
    supportsJsonOutput: false,
    supportsFunctionCalling: false,
  },
  {
    id: "us.meta.llama3-3-70b-instruct-v1:0",
    alias: "llama3.3-70b-instruct",
    provider: Provider.BEDROCK,
    fineTuned: false,
    maxCompletionTokens: 8192,
    inputCostPer1MTokens: 0.72,
    outputCostPer1MTokens: 0.72,
    inputPricePer1MTokens: 1.44,
    outputPricePer1MTokens: 1.44,
    group: "llama",
    supportsJsonOutput: false,
    supportsFunctionCalling: false,
  },
  {
    id: "amazon.nova-pro-v1:0",
    alias: "nova-pro",
    provider: Provider.BEDROCK,
    fineTuned: false,
    maxCompletionTokens: 10000,
    inputCostPer1MTokens: 0.8,
    outputCostPer1MTokens: 3.2,
    inputPricePer1MTokens: 1.6,
    outputPricePer1MTokens: 6.4,
    group: "nova",
    supportsJsonOutput: false,
    supportsFunctionCalling: true,
  },
  {
    id: "amazon.nova-lite-v1:0",
    alias: "nova-lite",
    provider: Provider.BEDROCK,
    fineTuned: false,
    maxCompletionTokens: 10000,
    inputCostPer1MTokens: 0.06,
    outputCostPer1MTokens: 0.24,
    inputPricePer1MTokens: 0.12,
    outputPricePer1MTokens: 0.48,
    group: "nova",
    supportsJsonOutput: false,
    supportsFunctionCalling: true,
  },
  {
    id: "amazon.nova-micro-v1:0",
    alias: "nova-micro",
    provider: Provider.BEDROCK,
    fineTuned: false,
    maxCompletionTokens: 10000,
    inputCostPer1MTokens: 0.035,
    outputCostPer1MTokens: 0.14,
    inputPricePer1MTokens: 0.07,
    outputPricePer1MTokens: 0.28,
    group: "nova",
    supportsJsonOutput: false,
    supportsFunctionCalling: true,
  },
];

export async function getPremInferenceModels(
  userId: string,
): Promise<ChatModel[][]> {
  // Get base models from inference service
  const baseModels = await InferenceClient.getChatModels();

  return await Promise.all([
    // get the prem models
    Promise.resolve(
      baseModels.map((model) => ({
        ...model,
        inputCostPer1MTokens: 0.05, // PREM standard cost
        outputCostPer1MTokens: 0.15,
        inputPricePer1MTokens: 0.1, // PREM standard price (double cost)
        outputPricePer1MTokens: 0.3,
        // supportsJsonOutput is already included from the inference client
      })),
    ),
    // get the fine-tuned models with their capabilities (stored directly on models table)
    db
      .select({
        id: models.id,
        alias: models.alias,
        maxCompletionTokens: models.maxCompletionTokens,
        baseModelGroup: models.baseModelGroup,
        supportsJsonOutput: models.supportsJsonOutput,
        supportsFunctionCalling: models.supportsFunctionCalling,
      })
      .from(models)
      .where(eq(models.userId, userId))
      .then((results) =>
        results.map((model) => ({
          id: model.id,
          alias: model.alias,
          provider: Provider.PREM,
          fineTuned: true,
          maxCompletionTokens: model.maxCompletionTokens,
          inputCostPer1MTokens: 0.1, // PREM fine-tuned models cost
          outputCostPer1MTokens: 0.3,
          inputPricePer1MTokens: 0.2, // PREM fine-tuned models price (double cost)
          outputPricePer1MTokens: 0.6,
          group: `${model.baseModelGroup ?? ""} finetuned`,
          supportsJsonOutput: model.supportsJsonOutput ?? false,
          supportsFunctionCalling: model.supportsFunctionCalling ?? false,
        })),
      ),
  ]);
}

export async function getModels(userId: string): Promise<ChatModel[]> {
  const [premModels, fineTunedModels] = await getPremInferenceModels(userId);

  // Collect all aliases from external providers
  const externalProviderAliases = new Set([
    ...openAIModels.map((m) => m.alias),
    ...openRouterModels.map((m) => m.alias),
    ...bedrockModels.map((m) => m.alias),
  ]);

  // Filter out PREM models that have aliases already present in external providers
  const filteredPremModels = premModels.filter(
    (model) => !externalProviderAliases.has(model.alias),
  );

  const sortedModels = [
    ...openAIModels,
    ...openRouterModels,
    ...bedrockModels,
    ...filteredPremModels,
    ...fineTunedModels,
  ].sort((a, b) => a.alias.localeCompare(b.alias));
  return sortedModels;
}

export async function resolveModelByIdOrAlias(
  idOrAlias: string,
  userId: string,
): Promise<ChatModel | undefined> {
  const openRouterIndex = openRouterModels.findIndex(
    (m) => m.alias === idOrAlias || m.id === idOrAlias,
  );
  if (openRouterIndex !== -1) {
    return openRouterModels[openRouterIndex];
  }

  const openAiIndex = openAIModels.findIndex(
    (m) => m.alias === idOrAlias || m.id === idOrAlias,
  );
  if (openAiIndex !== -1) {
    return openAIModels[openAiIndex];
  }

  const bedrockIndex = bedrockModels.findIndex(
    (m) => m.alias === idOrAlias || m.id === idOrAlias,
  );
  if (bedrockIndex !== -1) {
    return bedrockModels[bedrockIndex];
  }

  // TODO: do a pattern match for model id/slug before doing a db call
  // only make a network call when provider is prem to validate
  const premModels = (await getPremInferenceModels(userId)).flat();
  const premIndex = premModels.findIndex(
    (m) => m.alias === idOrAlias || m.id === idOrAlias,
  );
  if (premIndex !== -1) {
    return premModels[premIndex];
  }

  return undefined;
}

// check if slugs are unique
const slugs = [...openAIModels, ...bedrockModels, ...openRouterModels].map(
  (m) => m.alias,
);
const uniqueSlugs = new Set(slugs);
if (uniqueSlugs.size !== slugs.length) {
  throw new Error("Slugs are not unique");
}
