import { describe, it, expect } from "vitest";
import { getAllPresets, getAvailableModelsInPreset, getMissingModelsInPreset } from "./autorouter_presets";

describe("autorouter_presets", () => {
  it("loads exactly the two model-family presets (excluding sample_spec)", () => {
    const presets = getAllPresets();
    const labels = presets.map((p) => p.label).sort();
    expect(labels).toEqual(["Anthropic Family", "OpenAI Family"]);
    expect(presets.every((p) => p.label && p.description && p.complexity_router_config)).toBe(true);
  });

  it("keeps every preset a plain complexity router with no adaptive or quality-router settings", () => {
    const presets = getAllPresets();
    for (const preset of presets) {
      const config = preset.complexity_router_config;
      expect(config.classifier_type).toBe("heuristic");
      expect(config.adaptive).toBeUndefined();
      expect(config.adaptive_weights).toBeUndefined();
      expect(config.adaptive_eligible).toBeUndefined();
      expect(config.tier_distance_penalty).toBeUndefined();
    }
  });

  it("identifies all required models in the Anthropic preset", () => {
    const preset = getAllPresets().find((p) => p.label === "Anthropic Family");
    expect(preset).toBeTruthy();

    const models = getAvailableModelsInPreset(preset!);
    expect(models.has("claude-haiku-4-5")).toBe(true);
    expect(models.has("claude-sonnet-4-5")).toBe(true);
    expect(models.has("claude-opus-5")).toBe(true);
  });

  it("detects missing models when the caller lacks part of a family", () => {
    const preset = getAllPresets().find((p) => p.label === "OpenAI Family");
    expect(preset).toBeTruthy();

    const availableModels = new Set(["gpt-5-nano"]);
    const missing = getMissingModelsInPreset(preset!, availableModels);

    expect(missing).toContain("gpt-5-mini");
    expect(missing).toContain("gpt-5");
    expect(missing).toContain("o3");
    expect(missing).not.toContain("gpt-5-nano");
  });

  it("returns an empty missing list when the whole family is available", () => {
    const preset = getAllPresets().find((p) => p.label === "Anthropic Family");
    expect(preset).toBeTruthy();

    const availableModels = new Set(["claude-haiku-4-5", "claude-sonnet-4-5", "claude-opus-5"]);
    const missing = getMissingModelsInPreset(preset!, availableModels);

    expect(missing).toEqual([]);
  });

  it("collects every tier model into the availability check", () => {
    const preset = getAllPresets().find((p) => p.label === "OpenAI Family");
    expect(preset).toBeTruthy();

    const models = getAvailableModelsInPreset(preset!);
    const tierModels = Object.values(preset!.complexity_router_config.tiers).flatMap((t) => t);

    for (const tierModel of tierModels) {
      expect(models.has(tierModel)).toBe(true);
    }
  });
});
