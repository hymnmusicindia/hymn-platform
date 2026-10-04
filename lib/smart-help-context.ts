export type SmartHelpTrigger = "hover" | "click" | "error" | "inactivity" | "repeated_failed_attempt" | "time_on_screen";

export type SmartHelpContext = {
  page: { productName: string; route: string; pageTitle: string; sectionName: string | null };
  element: {
    label: string;
    type: string;
    nearbyText: string | null;
    placeholder: string | null;
    buttonText: string | null;
    currentValue: string | null;
    validationState: "valid" | "invalid" | "unknown";
    errorText: string | null;
    emptyStateText: string | null;
  };
  user: { role: string | null; plan: string | null; deviceType: "mobile" | "tablet" | "desktop"; recentActions: string[] };
  trigger: SmartHelpTrigger;
};

const trimText = (value: string | null | undefined, limit = 220) => value?.replace(/\s+/g, " ").trim().slice(0, limit) || null;

function labelFor(element: HTMLElement) {
  const explicit = element.dataset.smartHelp || element.getAttribute("aria-label") || element.getAttribute("title");
  if (explicit) return trimText(explicit, 100) || "This item";
  if (element instanceof HTMLInputElement || element instanceof HTMLSelectElement || element instanceof HTMLTextAreaElement) {
    const label = element.labels?.[0]?.textContent || (element.id ? document.querySelector(`label[for="${CSS.escape(element.id)}"]`)?.textContent : null);
    return trimText(label || element.getAttribute("placeholder") || element.name, 100) || "This field";
  }
  return trimText(element.textContent, 100) || element.getAttribute("role") || element.tagName.toLowerCase();
}

function safeValue(element: HTMLElement) {
  if (!(element instanceof HTMLInputElement || element instanceof HTMLSelectElement || element instanceof HTMLTextAreaElement)) return null;
  if (element instanceof HTMLInputElement && ["password", "file", "hidden"].includes(element.type)) return null;
  return trimText(element.value, 100);
}

function sectionFor(element: HTMLElement) {
  const section = element.closest("section, article, aside, form, main, [data-section]");
  return trimText(section?.getAttribute("data-section") || section?.querySelector("h1,h2,h3,[role=heading]")?.textContent, 100);
}

function nearbyFor(element: HTMLElement) {
  const container = element.closest("label, li, article, section, form, [role=group], .surface-card") || element.parentElement;
  const text = trimText(container?.textContent, 260);
  const own = trimText(element.textContent, 120);
  return text && text !== own ? text : null;
}

export function getAIHelpContext(element: HTMLElement, trigger: SmartHelpTrigger, recentActions: string[] = []): SmartHelpContext {
  const field = element instanceof HTMLInputElement || element instanceof HTMLSelectElement || element instanceof HTMLTextAreaElement ? element : null;
  const errorNode = element.closest('[role="alert"], .inline-error, .field-error, [data-error]') || field?.closest("label,form")?.querySelector('[role="alert"], .inline-error, .field-error, [data-error]');
  const emptyNode = element.closest("[data-empty-state], .empty-state, .overview-update-empty") || element.querySelector?.("[data-empty-state], .empty-state");
  const width = window.innerWidth;
  return {
    page: {
      productName: "HYMN Music",
      route: `${window.location.pathname}${window.location.search}`.slice(0, 300),
      pageTitle: trimText(document.querySelector("main h1")?.textContent || document.title, 120) || "HYMN Music",
      sectionName: sectionFor(element)
    },
    element: {
      label: labelFor(element),
      type: element.dataset.smartHelpType || element.getAttribute("role") || (field ? `${field.tagName.toLowerCase()}:${field instanceof HTMLInputElement ? field.type : "field"}` : element.tagName.toLowerCase()),
      nearbyText: nearbyFor(element),
      placeholder: field ? trimText(field.getAttribute("placeholder"), 120) : null,
      buttonText: element.matches("button,a,[role=button]") ? trimText(element.textContent, 100) : null,
      currentValue: safeValue(element),
      validationState: field ? (field.validity.valid ? "valid" : "invalid") : "unknown",
      errorText: trimText(errorNode?.textContent, 180),
      emptyStateText: trimText(emptyNode?.textContent, 180)
    },
    user: { role: null, plan: null, deviceType: width < 640 ? "mobile" : width < 1024 ? "tablet" : "desktop", recentActions: recentActions.slice(-5) },
    trigger
  };
}
