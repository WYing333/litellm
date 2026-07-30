import { renderWithProviders, screen, waitFor } from "../../../tests/test-utils";
import { fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi, describe, it, expect, beforeEach } from "vitest";
import AddAutoRouterTab from "./add_auto_router_tab";
import NotificationManager from "../molecules/notifications_manager";
import { ModelGroup } from "@/components/llm_calls/fetch_models";

// Every model referenced by both bundled family presets. A caller holding all of these can
// select either preset; dropping any one greys out the preset that names it.
const ALL_FAMILY_MODELS: ModelGroup[] = [
  { model_group: "claude-haiku-4-5", mode: "chat" },
  { model_group: "claude-sonnet-4-5", mode: "chat" },
  { model_group: "claude-opus-5", mode: "chat" },
  { model_group: "gpt-5-nano", mode: "chat" },
  { model_group: "gpt-5-mini", mode: "chat" },
  { model_group: "gpt-5", mode: "chat" },
  { model_group: "o3", mode: "chat" },
];

const openTemplateDropdown = (): void => {
  fireEvent.mouseDown(screen.getByTestId("template-selector").querySelector(".ant-select-selector")!);
};

// The rendered antd option whose text starts with a preset label. Matching on text (not role +
// accessible name) sidesteps antd's list re-rendering options in place on every state change.
const optionByLabel = (label: string): HTMLElement | undefined =>
  Array.from(document.querySelectorAll<HTMLElement>(".ant-select-item-option")).find((el) =>
    el.textContent?.startsWith(label),
  );

// antd marks a disabled option with a class, not aria-disabled.
const isOptionDisabled = (option: HTMLElement): boolean => option.classList.contains("ant-select-item-option-disabled");

const { mockFetchAvailableModels, mockHandleAddAutoRouterSubmit } = vi.hoisted(() => ({
  mockFetchAvailableModels: vi.fn(),
  mockHandleAddAutoRouterSubmit: vi.fn(),
}));

vi.mock("../networking", () => ({
  modelAvailableCall: vi.fn().mockResolvedValue({ data: [] }),
}));

vi.mock("@/components/llm_calls/fetch_models", () => ({
  fetchAvailableModels: mockFetchAvailableModels,
}));

vi.mock("./handle_add_auto_router_submit", () => ({
  handleAddAutoRouterSubmit: mockHandleAddAutoRouterSubmit,
}));

vi.mock("../molecules/notifications_manager", () => ({
  default: { fromBackend: vi.fn() },
}));

const Harness = ({ onOk = vi.fn() }: { onOk?: () => void } = {}) => (
  <AddAutoRouterTab handleOk={onOk} accessToken="token" userRole="Admin" />
);

describe("AddAutoRouterTab", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetchAvailableModels.mockResolvedValue([]);
    mockHandleAddAutoRouterSubmit.mockResolvedValue(undefined);
  });

  it("flags every mandatory field when Add Auto Router is clicked with nothing filled", async () => {
    const user = userEvent.setup();
    renderWithProviders(<Harness />);

    await user.click(screen.getByRole("button", { name: /add auto router/i }));

    expect(await screen.findByText("Auto router name is required")).toBeInTheDocument();
    expect(screen.getAllByText("This tier is required")).toHaveLength(4);
    expect(NotificationManager.fromBackend).toHaveBeenCalledWith("Please enter an Auto Router Name");
  });

  it("renders template selector as the first control", async () => {
    renderWithProviders(<Harness />);

    const templateSelector = screen.getByTestId("template-selector");
    expect(templateSelector).toBeInTheDocument();

    const templateLabel = screen.getByText("Template");
    const nameLabel = screen.getByText("Auto Router Name");

    expect(templateLabel.compareDocumentPosition(nameLabel)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });

  it("enables a preset once every model it references has loaded", async () => {
    mockFetchAvailableModels.mockResolvedValue(ALL_FAMILY_MODELS);

    renderWithProviders(<Harness />);
    openTemplateDropdown();

    await waitFor(() => expect(isOptionDisabled(optionByLabel("Anthropic Family")!)).toBe(false));
    expect(optionByLabel("Anthropic Family")).not.toHaveTextContent(/Missing:/);
  });

  it("greys out only the preset whose model the caller is missing", async () => {
    // Full OpenAI family, but the Anthropic family is short claude-opus-5.
    mockFetchAvailableModels.mockResolvedValue(ALL_FAMILY_MODELS.filter((m) => m.model_group !== "claude-opus-5"));

    renderWithProviders(<Harness />);
    openTemplateDropdown();

    await waitFor(() => expect(isOptionDisabled(optionByLabel("Anthropic Family")!)).toBe(true));
    expect(optionByLabel("Anthropic Family")).toHaveTextContent(/Missing:.*claude-opus-5/);
    // The other family, fully available, stays selectable.
    expect(isOptionDisabled(optionByLabel("OpenAI Family")!)).toBe(false);
  });

  // The fail-closed regression: a rejected fetch must NOT be read as "caller has zero models"
  // and grey out every preset. With no authoritative list, presets stay selectable.
  it("keeps presets selectable when the model fetch fails", async () => {
    mockFetchAvailableModels.mockRejectedValue(new Error("boom"));

    renderWithProviders(<Harness />);
    await waitFor(() => expect(mockFetchAvailableModels).toHaveBeenCalled());
    openTemplateDropdown();

    // Both presets require models, yet with no authoritative list neither may be greyed out.
    await waitFor(() => expect(optionByLabel("Anthropic Family")).toBeTruthy());
    expect(isOptionDisabled(optionByLabel("Anthropic Family")!)).toBe(false);
    expect(optionByLabel("Anthropic Family")).not.toHaveTextContent(/Missing:/);
    expect(isOptionDisabled(optionByLabel("OpenAI Family")!)).toBe(false);
  });
});
