// Defense in depth for errors and logs. Do not log document contents or headers.
export function redactSecrets(value) {
  let text = String(value ?? "");
  const configured = Object.entries(process.env)
    .filter(([name, secret]) => /API_KEY|PASSWORD|TOKEN|SECRET/i.test(name) && secret && secret.length >= 4)
    .map(([, secret]) => secret)
    .sort((a, b) => b.length - a.length);

  for (const secret of configured) text = text.split(secret).join("[REDACTED]");

  return text
    .replace(/AIza[A-Za-z0-9_-]{20,}/g, "[REDACTED]")
    .replace(/sk-(?:ant-|proj-)?[A-Za-z0-9_-]{12,}/g, "[REDACTED]")
    .replace(/([?&](?:key|api_key|token)=)[^&\s]+/gi, "$1[REDACTED]");
}
