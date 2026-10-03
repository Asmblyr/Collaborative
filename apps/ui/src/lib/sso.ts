export interface LoginProvider {
  id: string;
  label: string;
  driver: "openid" | "oauth2";
}

export interface LinkedIdentity {
  id: string;
  provider: string;
  label: string;
  available: boolean;
  createdAt: string;
}

export function ssoMessage(code: string | null | undefined): string | null {
  if (!code) return null;
  const messages: Record<string, string> = {
    SSO_LINKED:
      "Способ входа подключён. Теперь можно входить через этого провайдера.",
    SSO_NOT_LINKED:
      "Сначала войдите в свой аккаунт привычным способом и подключите провайдера в настройках → Безопасность.",
    SSO_IDENTITY_CONFLICT:
      "Этот аккаунт провайдера уже привязан. Сначала отключите прежнюю привязку.",
    SSO_LAST_IDENTITY: "Нельзя отключить последний доступный способ входа.",
    SSO_INVALID_FLOW:
      "Попытка входа истекла или открыта в другом браузере. Начните заново.",
    SSO_DENIED: "Вход отменён. Можно попробовать снова.",
    SSO_AUTH_FAILED:
      "Не удалось подтвердить вход у провайдера. Попробуйте снова.",
    SSO_PROVIDER_UNAVAILABLE:
      "Провайдер входа временно недоступен. Попробуйте позже.",
    SSO_WRONG_ORIGIN: "Откройте админку по адресу, указанному в AUTH_UI_URL.",
    SSO_UNKNOWN_PROVIDER: "Этот способ входа не настроен или отключён.",
  };
  return Object.hasOwn(messages, code)
    ? messages[code]
    : "Не удалось завершить вход. Начните заново.";
}

export function ssoProviderKey(value: string): boolean {
  return /^[a-z][a-z0-9_]{0,47}$/.test(value);
}
