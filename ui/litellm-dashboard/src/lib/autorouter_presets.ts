import { z } from "zod";
import { ComplexityRouterConfigPayload } from "@/components/add_model/build_complexity_router_config";
import presetsRaw from "@/autorouter_presets.json";

const classifierLLMConfigShape = {
  model: z.string(),
  timeout_ms: z.number(),
};
const ClassifierLLMConfigSchema = z.object(classifierLLMConfigShape).strict();

const complexityTiersShape = {
  SIMPLE: z.array(z.string()).min(1),
  MEDIUM: z.array(z.string()).min(1),
  COMPLEX: z.array(z.string()).min(1),
  REASONING: z.array(z.string()).min(1),
};
const ComplexityTiersSchema = z.object(complexityTiersShape).strict();

const adaptiveRouterWeightsShape = {
  quality: z.number(),
  cost: z.number(),
};
const AdaptiveRouterWeightsSchema = z.object(adaptiveRouterWeightsShape).strict();

const keywordTierRuleShape = {
  keywords: z.array(z.string()),
  tier: z.enum(["SIMPLE", "MEDIUM", "COMPLEX", "REASONING"]),
};
const KeywordTierRuleSchema = z.object(keywordTierRuleShape).strict();

const complexityRouterConfigShape = {
  tiers: ComplexityTiersSchema,
  classifier_type: z.enum(["heuristic", "llm"]),
  classifier_llm_config: ClassifierLLMConfigSchema.optional(),
  custom_technical_keywords: z.array(z.string()).optional(),
  keyword_tier_rules: z.array(KeywordTierRuleSchema).optional(),
  semantic_keyword_matching: z.boolean().optional(),
  embedding_model: z.string().optional(),
  match_threshold: z.number().optional(),
  escalation_keywords: z.array(z.string()).optional(),
  adaptive: z.boolean().optional(),
  adaptive_weights: AdaptiveRouterWeightsSchema.optional(),
  tier_distance_penalty: z.number().optional(),
  adaptive_eligible: z.enum(["all", "classified_tier"]).optional(),
  return_raw_model_name: z.boolean().optional(),
};
const ComplexityRouterConfigSchema = z.object(complexityRouterConfigShape).strict();

const autoRouterPresetShape = {
  label: z.string(),
  description: z.string(),
  default_model: z.string(),
  complexity_router_config: ComplexityRouterConfigSchema,
};
const AutoRouterPresetSchema = z.object(autoRouterPresetShape).strict();

const AutoRouterPresetsFileSchema = z.record(z.string(), AutoRouterPresetSchema);

// The schema above is written to structurally match ComplexityRouterConfigPayload field-for-field
// (same optionality, same nested shapes), so a parsed value satisfies it with no cast.
export interface AutoRouterPreset {
  label: string;
  description: string;
  default_model: string;
  complexity_router_config: ComplexityRouterConfigPayload;
}

export interface ValidatedPresets {
  presets: Record<string, AutoRouterPreset>;
  errors: string[];
}

export const validateAndParsePresets = (): ValidatedPresets => {
  try {
    const parsed = AutoRouterPresetsFileSchema.parse(presetsRaw);

    const presetEntries = Object.entries(parsed).filter(([key]) => key !== "sample_spec");
    const presets: Record<string, AutoRouterPreset> = Object.fromEntries(presetEntries);

    return { presets, errors: [] };
  } catch (e) {
    return {
      presets: {},
      errors: [e instanceof Error ? e.message : "Failed to parse presets file"],
    };
  }
};

export const getAllPresets = (): AutoRouterPreset[] => {
  const { presets, errors } = validateAndParsePresets();
  if (errors.length > 0) {
    console.error("Preset validation errors:", errors);
  }
  return Object.values(presets);
};

export const getPresetByKey = (key: string): AutoRouterPreset | null => {
  const { presets } = validateAndParsePresets();
  return presets[key] || null;
};

export const getAvailableModelsInPreset = (preset: AutoRouterPreset): Set<string> => {
  const {
    tiers,
    classifier_llm_config: classifierLlmConfig,
    embedding_model: embeddingModel,
  } = preset.complexity_router_config;

  const tierModels = [...tiers.SIMPLE, ...tiers.MEDIUM, ...tiers.COMPLEX, ...tiers.REASONING];
  const classifierModel = classifierLlmConfig?.model;

  return new Set([...tierModels, classifierModel, embeddingModel].filter((model) => model != null));
};

export const getMissingModelsInPreset = (preset: AutoRouterPreset, availableModels: Set<string>): string[] => {
  const requiredModels = getAvailableModelsInPreset(preset);
  return Array.from(requiredModels)
    .filter((model) => !availableModels.has(model))
    .sort();
};
