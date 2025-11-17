import { Language } from "../types";

export function createGenerationPrompt(
  diff: string,
  stats: string,
  lang: Language,
  multiLine = false
): string {
  const isUkrainian = lang === "ua";

  if (isUkrainian) {
    if (multiLine) {
      return `Проаналізуй git зміни та згенеруй детальний commit message у форматі conventional commits.

Статистика змін:
${stats}

Diff (перші 6000 символів):
${diff.slice(0, 6000)}

ФОРМАТ ВІДПОВІДІ:
<type>(<scope>): <subject>

<body>

<footer>

ПРАВИЛА:
- Subject: МИНУЛИЙ ЧАС, макс 50 символів, без крапки
- Body: детальний опис змін (що і чому змінено)
- Footer: Breaking changes, issue references
- Type: feat/fix/refactor/docs/style/test/chore/perf
- Дієслова: додано, виправлено, оновлено, видалено, рефакторено

Приклад:
feat(auth): додано Google OAuth провайдер

Реалізовано аутентифікацію через Google OAuth 2.0.
Додано обробку токенів та refresh механізм.
Оновлено конфігурацію для підтримки нових провайдерів.

Closes #123

Поверни ТІЛЬКИ commit message у вказаному форматі, без пояснень.`;
    }
    return `Проаналізуй git зміни та згенеруй commit message у форматі conventional commits.

Статистика змін:
${stats}

Diff (перші 6000 символів):
${diff.slice(0, 6000)}

СУВОРІ ПРАВИЛА:
- Формат: <type>(<scope>): <subject>
- Type: feat/fix/refactor/docs/style/test/chore/perf
- Subject ТІЛЬКИ у МИНУЛОМУ ЧАСІ (що ЗРОБЛЕНО), макс 50 символів, без крапки
- Використовуй дієслова: додано, виправлено, оновлено, видалено, рефакторено
- НЕПРАВИЛЬНО: "додати функцію", "виправити баг", "оновити стилі"
- ПРАВИЛЬНО: "додано функцію", "виправлено баг", "оновлено стилі"

Приклади:
feat(auth): додано Google OAuth провайдер
fix(api): виправлено помилку валідації в user endpoint
refactor(store): оптимізовано управління станом корзини
docs(readme): оновлено інструкції встановлення

Поверни ТІЛЬКИ commit message (один рядок), без пояснень.`;
  } else {
    if (multiLine) {
      return `Analyze git changes and generate detailed commit message in conventional commits format.

Change statistics:
${stats}

Diff (first 6000 characters):
${diff.slice(0, 6000)}

RESPONSE FORMAT:
<type>(<scope>): <subject>

<body>

<footer>

RULES:
- Subject: PAST TENSE, max 50 characters, no period
- Body: detailed description of changes (what and why)
- Footer: Breaking changes, issue references
- Type: feat/fix/refactor/docs/style/test/chore/perf
- Use verbs: added, fixed, updated, removed, refactored

Example:
feat(auth): added Google OAuth provider

Implemented authentication via Google OAuth 2.0.
Added token handling and refresh mechanism.
Updated configuration to support new providers.

Closes #123

Return ONLY the commit message in the specified format, no explanations.`;
    }
    return `Analyze git changes and generate commit message in conventional commits format.

Change statistics:
${stats}

Diff (first 6000 characters):
${diff.slice(0, 6000)}

STRICT RULES:
- Format: <type>(<scope>): <subject>
- Type: feat/fix/refactor/docs/style/test/chore/perf
- Subject in PAST TENSE (what WAS DONE), max 50 characters, no period
- Use verbs like: added, fixed, updated, removed, refactored
- WRONG: "add feature", "fix bug", "update styles"
- CORRECT: "added feature", "fixed bug", "updated styles"

Examples:
feat(auth): added Google OAuth provider
fix(api): fixed validation error in user endpoint
refactor(store): optimized cart state management
docs(readme): updated installation instructions

Return ONLY the commit message (one line), no explanations.`;
  }
}

export function createEditPrompt(
  currentMessage: string,
  userFeedback: string,
  diff: string,
  stats: string,
  lang: Language
): string {
  const isUkrainian = lang === "ua";

  if (isUkrainian) {
    return `Поточний commit message:
${currentMessage}

Відгук користувача:
${userFeedback}

Git зміни:
${stats}

${diff.slice(0, 4000)}

Перегенеруй commit message враховуючи відгук користувача.
Дотримуйся формату conventional commits.
Поверни ТІЛЬКИ новий commit message, без пояснень.`;
  } else {
    return `Current commit message:
${currentMessage}

User feedback:
${userFeedback}

Git changes:
${stats}

${diff.slice(0, 4000)}

Regenerate the commit message considering user feedback.
Follow conventional commits format.
Return ONLY the new commit message, no explanations.`;
  }
}
