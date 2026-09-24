interface TurnstileApi {
  render: (element: HTMLElement, options: { sitekey: string; action: string }) => string;
  getResponse: (widgetId: string) => string;
  reset: (widgetId: string) => void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

export {};
