const vscode = require("vscode");
const { exec } = require("child_process");
const { promisify } = require("util");
const fs = require("fs");
const path = require("path");
const os = require("os");

const execAsync = promisify(exec);

// Кешуємо знайдений шлях до CLI
let cachedCliPath = null;

/**
 * Створення промпту для генерації commit message
 */
function createGenerationPrompt(diff, stats, lang, multiLine = false) {
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

/**
 * Створення промпту для редагування commit message
 */
function createEditPrompt(currentMessage, userFeedback, diff, stats, lang) {
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

/**
 * Отримання diff через git CLI
 */
async function getDiff(repoPath) {
	try {
		const [diffResult, statsResult] = await Promise.all([
			execAsync("git diff --cached --unified=1", {
				cwd: repoPath,
				maxBuffer: 10 * 1024 * 1024,
			}),
			execAsync("git diff --cached --stat", {
				cwd: repoPath,
			}),
		]);

		return { diff: diffResult.stdout || "", stats: statsResult.stdout || "" };
	} catch (error) {
		// Якщо немає staged changes, спробуємо unstaged
		try {
			const [diffResult, statsResult] = await Promise.all([
				execAsync("git diff --unified=1", {
					cwd: repoPath,
					maxBuffer: 10 * 1024 * 1024,
				}),
				execAsync("git diff --stat", {
					cwd: repoPath,
				}),
			]);

			return {
				diff: diffResult.stdout || "",
				stats: statsResult.stdout || "",
			};
		} catch (err) {
			throw new Error(`Failed to get git diff: ${err.message}`);
		}
	}
}

/**
 * Отримання типових шляхів для пошуку Claude CLI
 */
function getCommonCliPaths() {
	const home = os.homedir();
	const paths = [];

	if (process.platform === "win32") {
		// Windows paths
		paths.push(
			path.join(home, "AppData", "Roaming", "npm", "claude.cmd"),
			path.join(home, "AppData", "Local", "npm", "claude.cmd"),
			path.join(home, ".claude", "local", "claude.exe"),
			"C:\\Program Files\\nodejs\\claude.cmd",
			"C:\\Program Files (x86)\\nodejs\\claude.cmd",
		);
	} else {
		// Unix-like paths (macOS, Linux)
		paths.push(
			"/usr/local/bin/claude",
			"/usr/bin/claude",
			"/opt/homebrew/bin/claude",
			path.join(home, ".local", "bin", "claude"),
			path.join(home, ".claude", "local", "claude"),
			path.join(home, ".nvm", "versions", "node", "*", "bin", "claude"),
			path.join(home, ".npm-global", "bin", "claude"),
			path.join(home, "bin", "claude"),
		);
	}

	return paths;
}

/**
 * Перевірка чи існує файл
 */
async function fileExists(filePath) {
	try {
		await fs.promises.access(filePath, fs.constants.X_OK);
		return true;
	} catch {
		return false;
	}
}

/**
 * Пошук CLI через glob pattern (для NVM)
 */
async function findCliWithGlob(pattern) {
	if (!pattern.includes("*")) {
		return (await fileExists(pattern)) ? pattern : null;
	}

	const parts = pattern.split("*");
	if (parts.length !== 2) return null;

	const baseDir = parts[0].slice(0, -1); // Remove trailing /
	const suffix = parts[1];

	try {
		const entries = await fs.promises.readdir(baseDir);
		for (const entry of entries) {
			const fullPath = path.join(baseDir, entry, suffix.slice(1)); // Remove leading /
			if (await fileExists(fullPath)) {
				return fullPath;
			}
		}
	} catch {
		// Directory doesn't exist
	}
	return null;
}

/**
 * Автоматично зберегти знайдений шлях до CLI
 */
async function autoSaveCliPath(cliPath) {
	const config = vscode.workspace.getConfiguration("claudeCommit");
	const currentPath = config.get("cliPath");

	// Зберігаємо тільки якщо ще не збережено
	if (!currentPath || !currentPath.trim()) {
		try {
			await config.update(
				"cliPath",
				cliPath,
				vscode.ConfigurationTarget.Global,
			);
			console.log(`Claude CLI path auto-saved: ${cliPath}`);
		} catch (err) {
			console.warn(`Failed to auto-save CLI path: ${err.message}`);
		}
	}
}

/**
 * Знайти шлях до Claude CLI
 */
async function findClaudeCliPath() {
	// 1. Перевіряємо налаштування користувача
	const config = vscode.workspace.getConfiguration("claudeCommit");
	const userPath = config.get("cliPath");

	if (userPath && userPath.trim()) {
		if (await fileExists(userPath)) {
			return userPath;
		}
		// Користувач вказав невірний шлях
		throw new Error(`Configured CLI path not found: ${userPath}`);
	}

	// 2. Перевіряємо кеш
	if (cachedCliPath && (await fileExists(cachedCliPath))) {
		return cachedCliPath;
	}

	// 3. Спробуємо which/where
	try {
		const cmd = process.platform === "win32" ? "where claude" : "which claude";
		const { stdout } = await execAsync(cmd, {
			env: { ...process.env },
			shell: process.platform === "win32" ? "cmd.exe" : "/bin/bash",
		});
		const foundPath = stdout.trim().split("\n")[0];
		if (foundPath && (await fileExists(foundPath))) {
			cachedCliPath = foundPath;
			await autoSaveCliPath(foundPath);
			return foundPath;
		}
	} catch {
		// which/where не знайшов
	}

	// 4. Пробуємо отримати PATH з shell profile
	if (process.platform !== "win32") {
		try {
			const { stdout } = await execAsync(
				"source ~/.zshrc 2>/dev/null || source ~/.bashrc 2>/dev/null || true; which claude",
				{
					shell: "/bin/bash",
				},
			);
			const foundPath = stdout.trim();
			if (foundPath && (await fileExists(foundPath))) {
				cachedCliPath = foundPath;
				await autoSaveCliPath(foundPath);
				return foundPath;
			}
		} catch {
			// Не вдалося
		}
	}

	// 5. Перевіряємо типові шляхи
	const commonPaths = getCommonCliPaths();
	for (const p of commonPaths) {
		const found = await findCliWithGlob(p);
		if (found) {
			cachedCliPath = found;
			await autoSaveCliPath(found);
			return found;
		}
	}

	return null;
}

/**
 * Перевірка наявності Claude Code CLI
 */
async function hasClaudeCodeCLI() {
	try {
		const cliPath = await findClaudeCliPath();
		return cliPath !== null;
	} catch {
		return false;
	}
}

/**
 * Запит у користувача шляху до CLI
 */
async function promptForCliPath() {
	const result = await vscode.window.showWarningMessage(
		"Claude Code CLI not found. Would you like to configure the path manually?",
		"Browse for CLI",
		"Enter Path Manually",
		"Skip (Use API)",
	);

	if (result === "Browse for CLI") {
		const fileUri = await vscode.window.showOpenDialog({
			canSelectFiles: true,
			canSelectFolders: false,
			canSelectMany: false,
			title: "Select Claude CLI Executable",
			filters:
				process.platform === "win32"
					? { Executable: ["exe", "cmd", "bat"] }
					: undefined,
		});

		if (fileUri && fileUri[0]) {
			const selectedPath = fileUri[0].fsPath;
			await saveCliPath(selectedPath);
			return selectedPath;
		}
	} else if (result === "Enter Path Manually") {
		const manualPath = await vscode.window.showInputBox({
			prompt: "Enter the full path to Claude CLI executable",
			placeHolder:
				process.platform === "win32"
					? "C:\\path\\to\\claude.cmd"
					: "/usr/local/bin/claude",
			validateInput: async (value) => {
				if (!value) return "Path cannot be empty";
				if (!(await fileExists(value))) {
					return `File not found or not executable: ${value}`;
				}
				return null;
			},
		});

		if (manualPath) {
			await saveCliPath(manualPath);
			return manualPath;
		}
	}

	return null;
}

/**
 * Зберегти шлях до CLI в налаштуваннях
 */
async function saveCliPath(cliPath) {
	const config = vscode.workspace.getConfiguration("claudeCommit");
	await config.update("cliPath", cliPath, vscode.ConfigurationTarget.Global);
	cachedCliPath = cliPath;
	vscode.window.showInformationMessage(`Claude CLI path saved: ${cliPath}`);
}

/**
 * Генерація через Claude Code CLI
 */
async function generateWithCLI(prompt, progressCallback = null) {
	const cliPath = await findClaudeCliPath();

	if (!cliPath) {
		throw new Error("Claude CLI path not found");
	}

	// Екрануємо шлях для використання в shell
	const escapedCliPath = cliPath.includes(" ") ? `"${cliPath}"` : cliPath;

	// Отримуємо модель з налаштувань
	const config = vscode.workspace.getConfiguration("claudeCommit");
	const model = config.get("model", "haiku");

	// Записуємо промпт у тимчасовий файл щоб уникнути проблем з екрануванням
	const tmpDir = os.tmpdir();
	const promptFile = path.join(
		tmpDir,
		`claude-commit-prompt-${Date.now()}.txt`,
	);

	try {
		await fs.promises.writeFile(promptFile, prompt, "utf-8");

		if (progressCallback) {
			progressCallback(`Using ${model} model...`);
		}

		const command =
			process.platform === "win32"
				? `type "${promptFile}" | ${escapedCliPath} -p --model ${model}`
				: `cat "${promptFile}" | ${escapedCliPath} -p --model ${model}`;

		const { stdout, stderr } = await execAsync(command, {
			shell: process.platform === "win32" ? "cmd.exe" : "/bin/bash",
			maxBuffer: 10 * 1024 * 1024,
			timeout: 120000, // 2 хвилини для генерації
		});

		// Перевіряємо на помилки в stderr
		if (stderr && !stdout) {
			throw new Error(`CLI error output: ${stderr.trim()}`);
		}

		// Парсимо відповідь
		const lines = stdout
			.split("\n")
			.map((line) => line.trim())
			.filter((line) => line.length > 0);

		if (lines.length === 0) {
			throw new Error("Empty response from CLI");
		}

		// Для multi-line комітів повертаємо весь вивід
		const multiLine = config.get("multiLineCommit", false);
		if (multiLine) {
			// Шукаємо початок conventional commit
			const conventionalCommitPattern =
				/^(feat|fix|docs|style|refactor|test|chore|perf)(\(.+?\))?:.+/;
			let startIndex = -1;

			for (let i = 0; i < lines.length; i++) {
				if (conventionalCommitPattern.test(lines[i])) {
					startIndex = i;
					break;
				}
			}

			if (startIndex >= 0) {
				return lines.slice(startIndex).join("\n");
			}
		}

		// Для однорядкових комітів шукаємо conventional commit pattern
		const conventionalCommitPattern =
			/^(feat|fix|docs|style|refactor|test|chore|perf)(\(.+?\))?:.+/;

		for (let i = lines.length - 1; i >= 0; i--) {
			if (conventionalCommitPattern.test(lines[i])) {
				return lines[i];
			}
		}

		return lines[lines.length - 1] || "chore: update code";
	} catch (error) {
		// Покращене повідомлення про помилку
		if (error.killed) {
			throw new Error(
				"CLI process timed out after 2 minutes. Try a smaller diff or check your connection.",
			);
		}
		if (error.code === "ENOENT") {
			throw new Error(`CLI executable not found at: ${cliPath}`);
		}
		throw error;
	} finally {
		// Видаляємо тимчасовий файл
		try {
			await fs.promises.unlink(promptFile);
		} catch {
			// Ігноруємо помилки видалення
		}
	}
}

/**
 * Генерація через Anthropic API
 */
async function generateWithAPI(prompt, progressCallback = null) {
	const config = vscode.workspace.getConfiguration("claudeCommit");
	const apiKey = config.get("apiKey") || process.env.ANTHROPIC_API_KEY;

	if (!apiKey) {
		throw new Error(
			"ANTHROPIC_API_KEY not found. Set it in extension settings or environment variable.",
		);
	}

	if (progressCallback) {
		progressCallback("Connecting to Anthropic API...");
	}

	try {
		const Anthropic = require("@anthropic-ai/sdk");
		const anthropic = new Anthropic({ apiKey });

		const message = await anthropic.messages.create({
			model: "claude-sonnet-4-5-20250929",
			max_tokens: 1000,
			temperature: 0.3,
			messages: [{ role: "user", content: prompt }],
		});

		return message.content[0].text.trim();
	} catch (error) {
		if (error.code === "MODULE_NOT_FOUND") {
			throw new Error(
				"Install @anthropic-ai/sdk to use API: npm install @anthropic-ai/sdk",
			);
		}
		if (error.status === 401) {
			throw new Error(
				"Invalid API key. Check your ANTHROPIC_API_KEY in settings.",
			);
		}
		if (error.status === 429) {
			throw new Error("Rate limit exceeded. Please wait and try again.");
		}
		throw error;
	}
}

/**
 * Головна функція генерації commit message
 */
async function generateCommitMessage(
	repo,
	language = "en",
	progressCallback = null,
) {
	const repoPath = repo.rootUri.fsPath;

	if (progressCallback) {
		progressCallback("Getting git diff...");
	}

	// Отримуємо diff
	const { diff, stats } = await getDiff(repoPath);

	if (!diff && !stats) {
		throw new Error("No changes found. Stage some files first.");
	}

	if (progressCallback) {
		progressCallback("Preparing prompt...");
	}

	// Отримуємо налаштування
	const config = vscode.workspace.getConfiguration("claudeCommit");
	const multiLine = config.get("multiLineCommit", false);

	// Створюємо промпт
	const prompt = createGenerationPrompt(diff, stats, language, multiLine);

	// Визначаємо метод генерації
	const preferredMethod = config.get("preferredMethod", "auto");

	let commitMessage;
	let cliNotFound = false;

	if (preferredMethod === "cli" || preferredMethod === "auto") {
		// Спробуємо CLI
		if (await hasClaudeCodeCLI()) {
			try {
				if (progressCallback) {
					progressCallback("Generating with Claude CLI...");
				}
				commitMessage = await generateWithCLI(prompt, progressCallback);
				return commitMessage;
			} catch (error) {
				if (preferredMethod === "cli") {
					throw new Error(`Claude CLI error: ${error.message}`);
				}
				// Якщо auto, спробуємо API
				console.warn(`CLI failed, trying API: ${error.message}`);
			}
		} else {
			cliNotFound = true;
			// CLI не знайдено, запитаємо користувача
			if (preferredMethod === "cli") {
				const userPath = await promptForCliPath();
				if (userPath) {
					// Користувач вказав шлях, спробуємо ще раз
					try {
						if (progressCallback) {
							progressCallback("Generating with Claude CLI...");
						}
						commitMessage = await generateWithCLI(prompt, progressCallback);
						return commitMessage;
					} catch (error) {
						throw new Error(`Claude CLI error: ${error.message}`);
					}
				} else {
					throw new Error(
						'Claude CLI not found and no path configured. Run "which claude" in terminal to find the path.',
					);
				}
			}
		}
	}

	if (preferredMethod === "api" || preferredMethod === "auto") {
		// Перевіряємо чи є API ключ
		const apiKey = config.get("apiKey") || process.env.ANTHROPIC_API_KEY;

		if (!apiKey && cliNotFound) {
			// Немає ні CLI, ні API ключа - запитаємо шлях до CLI
			const userPath = await promptForCliPath();
			if (userPath) {
				// Користувач вказав шлях, спробуємо CLI
				try {
					if (progressCallback) {
						progressCallback("Generating with Claude CLI...");
					}
					commitMessage = await generateWithCLI(prompt, progressCallback);
					return commitMessage;
				} catch (error) {
					throw new Error(`Claude CLI error: ${error.message}`);
				}
			}
			// Користувач відмовився - пробуємо API (викличе помилку про відсутність ключа)
		}

		// Спробуємо API
		try {
			if (progressCallback) {
				progressCallback("Generating with Anthropic API...");
			}
			commitMessage = await generateWithAPI(prompt, progressCallback);
			return commitMessage;
		} catch (error) {
			if (cliNotFound && error.message.includes("ANTHROPIC_API_KEY")) {
				throw new Error(
					"Claude CLI not found and no API key configured. Either configure CLI path in settings or set ANTHROPIC_API_KEY.",
				);
			}
			throw new Error(`API error: ${error.message}`);
		}
	}

	throw new Error(
		"No generation method available. Install Claude Code CLI or set API key.",
	);
}

/**
 * Редагування commit message на основі відгуку
 */
async function editCommitMessage(
	repo,
	currentMessage,
	userFeedback,
	language = "en",
	progressCallback = null,
) {
	const repoPath = repo.rootUri.fsPath;

	if (progressCallback) {
		progressCallback("Getting git diff...");
	}

	const { diff, stats } = await getDiff(repoPath);

	if (progressCallback) {
		progressCallback("Regenerating based on feedback...");
	}

	const prompt = createEditPrompt(
		currentMessage,
		userFeedback,
		diff,
		stats,
		language,
	);

	const config = vscode.workspace.getConfiguration("claudeCommit");
	const preferredMethod = config.get("preferredMethod", "auto");

	if (preferredMethod === "cli" || preferredMethod === "auto") {
		if (await hasClaudeCodeCLI()) {
			return await generateWithCLI(prompt, progressCallback);
		}
	}

	if (preferredMethod === "api" || preferredMethod === "auto") {
		return await generateWithAPI(prompt, progressCallback);
	}

	throw new Error("No generation method available");
}

module.exports = {
	generateCommitMessage,
	editCommitMessage,
	promptForCliPath,
	findClaudeCliPath,
};
