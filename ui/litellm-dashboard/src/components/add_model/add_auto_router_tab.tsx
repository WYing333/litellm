import React, { useEffect, useState } from "react";
import { Card, Form, Button, Tooltip, Typography, Select as AntdSelect, Modal } from "antd";
import { TextInput } from "@tremor/react";
import { modelAvailableCall } from "../networking";
import { all_admin_roles } from "@/utils/roles";
import { handleAddAutoRouterSubmit } from "./handle_add_auto_router_submit";
import { fetchAvailableModels, ModelGroup } from "@/components/llm_calls/fetch_models";
import ComplexityRouterConfig, {
  ComplexityRouterConfigValue,
  DEFAULT_ADAPTIVE_WEIGHTS,
  DEFAULT_TIER_DISTANCE_PENALTY,
} from "./ComplexityRouterConfig";
import { KeywordTierRule } from "./KeywordTierRules";
import { hydrateKeywordTierRules } from "./complexity_router_keywords";
import { DEFAULT_ESCALATION_KEYWORDS } from "./EscalationKeywords";
import { DEFAULT_MATCH_THRESHOLD } from "./SemanticKeywordMatching";
import {
  buildComplexityRouterConfig,
  getMissingTiersError,
  getSemanticConfigError,
} from "./build_complexity_router_config";
import { buildAutoRouterTestTargets, AutoRouterTestTarget } from "./build_auto_router_test_targets";
import AutoRouterConnectionTest from "./auto_router_connection_test";
import NotificationManager from "../molecules/notifications_manager";
import { getAllPresets, getMissingModelsInPreset } from "@/lib/autorouter_presets";

interface AddAutoRouterTabProps {
  handleOk: () => void;
  accessToken: string;
  userRole: string;
}

const { Title } = Typography;

const AddAutoRouterTab: React.FC<AddAutoRouterTabProps> = ({ handleOk, accessToken, userRole }) => {
  const [form] = Form.useForm();
  const [modelAccessGroups, setModelAccessGroups] = useState<string[]>([]);
  const [modelInfo, setModelInfo] = useState<ModelGroup[]>([]);
  const [modelsLoadState, setModelsLoadState] = useState<"loading" | "loaded" | "error">("loading");

  const [complexityRouterConfig, setComplexityRouterConfig] = useState<ComplexityRouterConfigValue>({
    tiers: { SIMPLE: [], MEDIUM: [], COMPLEX: [], REASONING: [] },
    classifier_type: "heuristic",
  });

  const [customTechnicalKeywords, setCustomTechnicalKeywords] = useState<string[]>([]);
  const [keywordTierRules, setKeywordTierRules] = useState<KeywordTierRule[]>([]);
  const [semanticMatchingEnabled, setSemanticMatchingEnabled] = useState<boolean>(false);
  const [embeddingModel, setEmbeddingModel] = useState<string | undefined>(undefined);
  const [matchThreshold, setMatchThreshold] = useState<number>(DEFAULT_MATCH_THRESHOLD);
  const [escalationKeywords, setEscalationKeywords] = useState<string[]>(DEFAULT_ESCALATION_KEYWORDS);
  const [showValidationErrors, setShowValidationErrors] = useState<boolean>(false);

  const [isTestModalVisible, setIsTestModalVisible] = useState<boolean>(false);
  const [isTestingConnection, setIsTestingConnection] = useState<boolean>(false);
  const [connectionTestId, setConnectionTestId] = useState<number>(0);
  const [testTargets, setTestTargets] = useState<AutoRouterTestTarget[]>([]);

  const [selectedPreset, setSelectedPreset] = useState<string | undefined>(undefined);

  useEffect(() => {
    const fetchModelAccessGroups = async () => {
      const response = await modelAvailableCall(accessToken, "", "", false, null, true, true);
      setModelAccessGroups(response["data"].map((model: any) => model["id"]));
    };
    fetchModelAccessGroups();
  }, [accessToken]);

  useEffect(() => {
    const loadModels = async () => {
      try {
        const uniqueModels = await fetchAvailableModels(accessToken);
        setModelInfo(uniqueModels);
        setModelsLoadState("loaded");
      } catch (error) {
        console.error("Error fetching model info for auto router:", error);
        setModelsLoadState("error");
      }
    };
    loadModels();
  }, [accessToken]);

  const isAdmin = all_admin_roles.includes(userRole);

  const modelGroupOptions = Array.from(new Set(modelInfo.map((option) => option.model_group))).map((model_group) => ({
    value: model_group,
    label: model_group,
  }));

  const availableModelSet = new Set(modelInfo.map((m) => m.model_group));
  const presets = getAllPresets();

  // Only the authoritative loaded list can prove a model absent. While loading, or when the
  // fetch failed, we have no evidence a caller lacks a model, so gating on the empty set here
  // would fail closed and grey out every preset for a user who may have full access. Gate only
  // on a successful load; otherwise leave presets selectable (the tier selects and submit still
  // surface a genuinely missing model).
  const canGateOnAvailability = modelsLoadState === "loaded";
  const missingModelsFor = (preset: (typeof presets)[number]): string[] =>
    canGateOnAvailability ? getMissingModelsInPreset(preset, availableModelSet) : [];

  const handlePresetChange = (presetKey: string | undefined) => {
    setSelectedPreset(presetKey);

    if (!presetKey || presetKey === "custom") {
      setComplexityRouterConfig({
        tiers: { SIMPLE: [], MEDIUM: [], COMPLEX: [], REASONING: [] },
        classifier_type: "heuristic",
      });
      setCustomTechnicalKeywords([]);
      setKeywordTierRules([]);
      setSemanticMatchingEnabled(false);
      setEmbeddingModel(undefined);
      setMatchThreshold(DEFAULT_MATCH_THRESHOLD);
      setEscalationKeywords(DEFAULT_ESCALATION_KEYWORDS);
      return;
    }

    const preset = presets.find((p) => p.label === presetKey);
    if (!preset) return;

    const config = preset.complexity_router_config;
    const presetComplexityRouterConfig: ComplexityRouterConfigValue = {
      tiers: config.tiers,
      classifier_type: config.classifier_type,
      classifier_llm_config: config.classifier_llm_config,
      adaptive: config.adaptive,
      adaptive_weights: config.adaptive_weights,
      tier_distance_penalty: config.tier_distance_penalty,
      adaptive_eligible: config.adaptive_eligible,
      return_raw_model_name: config.return_raw_model_name,
    };
    setComplexityRouterConfig(presetComplexityRouterConfig);

    setCustomTechnicalKeywords(config.custom_technical_keywords || []);
    setKeywordTierRules(hydrateKeywordTierRules(config.keyword_tier_rules || []));
    setSemanticMatchingEnabled(config.semantic_keyword_matching || false);
    setEmbeddingModel(config.embedding_model);
    setMatchThreshold(config.match_threshold || DEFAULT_MATCH_THRESHOLD);
    setEscalationKeywords(config.escalation_keywords || DEFAULT_ESCALATION_KEYWORDS);
  };

  const submitRecommendedRouter = (name: string) => {
    const {
      tiers,
      classifier_type: classifierType,
      classifier_llm_config: classifierLlmConfig,
      adaptive = false,
      adaptive_weights: adaptiveWeights = DEFAULT_ADAPTIVE_WEIGHTS,
      tier_distance_penalty: tierDistancePenalty = DEFAULT_TIER_DISTANCE_PENALTY,
      adaptive_eligible: adaptiveEligible = "all",
      return_raw_model_name: returnRawModelName = false,
    } = complexityRouterConfig;

    const missingTiersError = getMissingTiersError(tiers);
    if (missingTiersError) {
      setShowValidationErrors(true);
      NotificationManager.fromBackend(missingTiersError);
      return;
    }

    if (classifierType === "llm" && !classifierLlmConfig?.model) {
      setShowValidationErrors(true);
      NotificationManager.fromBackend("Please select a classifier model, or switch back to Heuristic");
      return;
    }

    const semanticError = getSemanticConfigError({ semanticMatchingEnabled, embeddingModel, keywordTierRules });
    if (semanticError) {
      setShowValidationErrors(true);
      NotificationManager.fromBackend(semanticError);
      return;
    }

    const defaultModel = tiers.MEDIUM[0] || tiers.SIMPLE[0] || tiers.COMPLEX[0] || tiers.REASONING[0];

    form.setFieldsValue({
      custom_llm_provider: "auto_router",
      model: name,
      api_key: "not_required_for_auto_router",
      auto_router_default_model: defaultModel,
    });

    form
      .validateFields(["auto_router_name"])
      .then((values) => {
        const complexityRouterConfigParams = {
          tiers,
          classifierType,
          classifierLlmConfig,
          customTechnicalKeywords,
          keywordTierRules,
          semanticMatchingEnabled,
          embeddingModel,
          matchThreshold,
          escalationKeywords,
          adaptive,
          adaptiveWeights,
          tierDistancePenalty,
          adaptiveEligible,
          returnRawModelName,
        };

        const submitValues = {
          ...values,
          auto_router_name: name,
          auto_router_default_model: defaultModel,
          model_type: "complexity_router",
          complexity_router_config: buildComplexityRouterConfig(complexityRouterConfigParams),
          model_access_group: form.getFieldValue("model_access_group"),
        };

        handleAddAutoRouterSubmit(submitValues, accessToken, form, handleOk);
      })
      .catch((error) => {
        console.error("Validation failed:", error);
        NotificationManager.fromBackend("Please fill in all required fields");
      });
  };

  const handleAutoRouterSubmit = () => {
    const name = form.getFieldValue("auto_router_name");
    if (!name) {
      setShowValidationErrors(true);
      form.validateFields(["auto_router_name"]).catch(() => undefined);
      NotificationManager.fromBackend("Please enter an Auto Router Name");
      return;
    }

    submitRecommendedRouter(name);
  };

  const handleTestConnection = () => {
    const targets = buildAutoRouterTestTargets({
      tiers: complexityRouterConfig.tiers,
      semanticMatchingEnabled,
      embeddingModel,
    });

    if (targets.length === 0) {
      NotificationManager.fromBackend("Please select at least one model for a complexity tier");
      return;
    }

    setTestTargets(targets);
    setConnectionTestId((id) => id + 1);
    setIsTestingConnection(true);
    setIsTestModalVisible(true);
  };

  return (
    <>
      <Card>
        <Form
          form={form}
          onFinish={handleAutoRouterSubmit}
          labelCol={{ span: 10 }}
          wrapperCol={{ span: 16 }}
          labelAlign="left"
        >
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-900 mb-2">
              Template <span className="text-red-500">*</span>
            </label>
            <AntdSelect
              value={selectedPreset}
              onChange={handlePresetChange}
              placeholder="Choose a template or select Custom to define your own"
              className="w-full"
              optionLabelProp="label"
              data-testid="template-selector"
            >
              <AntdSelect.Option value="custom" label="Custom Configuration">
                <div>
                  <div className="font-medium">Custom Configuration</div>
                  <div className="text-xs text-gray-500">Define your auto router from scratch</div>
                </div>
              </AntdSelect.Option>
              {presets.map((preset) => {
                const missingModels = missingModelsFor(preset);
                const isDisabled = missingModels.length > 0;

                return (
                  <AntdSelect.Option
                    key={preset.label}
                    value={preset.label}
                    label={preset.label}
                    disabled={isDisabled}
                    title={isDisabled ? `Missing models: ${missingModels.join(", ")}` : preset.description}
                  >
                    <div>
                      <div className="font-medium">{preset.label}</div>
                      <div className="text-xs text-gray-500">{preset.description}</div>
                      {isDisabled && (
                        <div className="text-xs text-red-500 mt-1">Missing: {missingModels.join(", ")}</div>
                      )}
                    </div>
                  </AntdSelect.Option>
                );
              })}
            </AntdSelect>
          </div>

          <Form.Item
            rules={[{ required: true, message: "Auto router name is required" }]}
            label="Auto Router Name"
            name="auto_router_name"
            tooltip="Unique name for this auto router configuration"
            labelCol={{ span: 10 }}
            labelAlign="left"
          >
            <TextInput placeholder="e.g., smart_router, auto_router_1" />
          </Form.Item>

          <div className="w-full mb-4">
            <ComplexityRouterConfig
              modelInfo={modelInfo}
              value={complexityRouterConfig}
              onChange={setComplexityRouterConfig}
              customTechnicalKeywords={customTechnicalKeywords}
              onCustomTechnicalKeywordsChange={setCustomTechnicalKeywords}
              keywordTierRules={keywordTierRules}
              onKeywordTierRulesChange={setKeywordTierRules}
              semanticMatchingEnabled={semanticMatchingEnabled}
              onSemanticMatchingEnabledChange={setSemanticMatchingEnabled}
              embeddingModel={embeddingModel}
              onEmbeddingModelChange={setEmbeddingModel}
              matchThreshold={matchThreshold}
              onMatchThresholdChange={setMatchThreshold}
              escalationKeywords={escalationKeywords}
              onEscalationKeywordsChange={setEscalationKeywords}
              showValidationErrors={showValidationErrors}
            />
          </div>

          <div className="flex items-center my-4">
            <div className="grow border-t border-gray-200"></div>
            <span className="px-4 text-gray-500 text-sm">Additional Settings</span>
            <div className="grow border-t border-gray-200"></div>
          </div>

          {/* Model Access Groups - Admin only */}
          {isAdmin && (
            <Form.Item
              label="Model Access Group"
              name="model_access_group"
              className="mb-4"
              tooltip="Use model access groups to control who can access this auto router"
            >
              <AntdSelect
                mode="tags"
                showSearch
                placeholder="Select existing groups or type to create new ones"
                optionFilterProp="children"
                tokenSeparators={[","]}
                options={modelAccessGroups.map((group) => ({
                  value: group,
                  label: group,
                }))}
                maxTagCount="responsive"
                allowClear
              />
            </Form.Item>
          )}

          <div className="flex justify-between items-center mb-4">
            <Tooltip title="Get help on our github">
              <Typography.Link href="https://github.com/BerriAI/litellm/issues">Need Help?</Typography.Link>
            </Tooltip>
            <div className="space-x-2">
              {
                <Button
                  data-testid="auto-router-test-connect-btn"
                  onClick={handleTestConnection}
                  loading={isTestingConnection}
                >
                  Test Connection
                </Button>
              }
              <Button
                type="primary"
                onClick={() => {
                  handleAutoRouterSubmit();
                }}
              >
                Add Auto Router
              </Button>
            </div>
          </div>
        </Form>
      </Card>

      <Modal
        title="Connection Test Results"
        open={isTestModalVisible}
        onCancel={() => {
          setIsTestModalVisible(false);
          setIsTestingConnection(false);
        }}
        footer={[
          <Button
            key="close"
            onClick={() => {
              setIsTestModalVisible(false);
              setIsTestingConnection(false);
            }}
          >
            Close
          </Button>,
        ]}
        width={700}
      >
        {isTestModalVisible && (
          <AutoRouterConnectionTest
            key={connectionTestId}
            accessToken={accessToken}
            targets={testTargets}
            onTestComplete={() => setIsTestingConnection(false)}
          />
        )}
      </Modal>
    </>
  );
};

export default AddAutoRouterTab;
