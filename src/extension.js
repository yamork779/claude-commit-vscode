const vscode = require("vscode");
const {
	generateCommitMessage,
	editCommitMessage,
} = require("./commit-generator");

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
	console.log("Claude Commit extension is now active");

	// Реєструємо команду для генерації коміту
	let generateCommit = vscode.commands.registerCommand(
		"claude-commit.generate",
		async () => {
			try {
				// Отримуємо git extension
				const gitExtension = vscode.extensions.getExtension("vscode.git");
				if (!gitExtension) {
					vscode.window.showErrorMessage("Git extension not found");
					return;
				}

				const git = gitExtension.exports.getAPI(1);
				if (git.repositories.length === 0) {
					vscode.window.showErrorMessage("No Git repository found");
					return;
				}

				const repo = git.repositories[0];

				// Перевіряємо staged changes
				if (
					repo.state.indexChanges.length === 0 &&
					repo.state.workingTreeChanges.length === 0
				) {
					vscode.window.showWarningMessage(
						"No changes to commit. Stage files first.",
					);
					return;
				}

				// Показуємо індикатор прогресу
				let commitMessage = null;
				let generationError = null;

				await vscode.window.withProgress(
					{
						location: vscode.ProgressLocation.Notification,
						title: "Claude Commit",
						cancellable: false,
					},
					async (progress) => {
						try {
							// Отримуємо конфігурацію
							const config =
								vscode.workspace.getConfiguration("claudeCommit");
							const language = config.get("language", "en");

							// Callback для оновлення прогресу
							const updateProgress = (message) => {
								progress.report({ message });
							};

							// Генеруємо commit message
							commitMessage = await generateCommitMessage(
								repo,
								language,
								updateProgress,
							);
						} catch (error) {
							generationError = error;
						}
					},
				);

				// Обробляємо результат після закриття прогрес-індикатора
				if (generationError) {
					vscode.window.showErrorMessage(
						`Failed to generate commit: ${generationError.message}`,
					);
					return;
				}

				if (commitMessage) {
					// Встановлюємо згенерований message в input box
					repo.inputBox.value = commitMessage;

					// Показуємо діалог з опціями
					const action = await vscode.window.showInformationMessage(
						"Commit message generated!",
						"Edit with feedback",
						"OK",
					);

					if (action === "Edit with feedback") {
						await handleEditWithFeedback(repo, commitMessage);
					}
				}
			} catch (error) {
				vscode.window.showErrorMessage(`Error: ${error.message}`);
			}
		},
	);

	context.subscriptions.push(generateCommit);
}

/**
 * Обробка редагування з відгуком
 */
async function handleEditWithFeedback(repo, currentMessage) {
	const feedback = await vscode.window.showInputBox({
		prompt: "Enter your feedback to improve the commit message",
		placeHolder:
			"e.g., 'Make it shorter', 'Focus on the API changes', 'Add breaking change note'",
		validateInput: (value) => {
			if (!value || value.trim().length === 0) {
				return "Please provide some feedback";
			}
			return null;
		},
	});

	if (!feedback) {
		return;
	}

	await vscode.window.withProgress(
		{
			location: vscode.ProgressLocation.Notification,
			title: "Claude Commit",
			cancellable: false,
		},
		async (progress) => {
			try {
				const config = vscode.workspace.getConfiguration("claudeCommit");
				const language = config.get("language", "en");

				const updateProgress = (message) => {
					progress.report({ message });
				};

				const newMessage = await editCommitMessage(
					repo,
					currentMessage,
					feedback,
					language,
					updateProgress,
				);

				if (newMessage) {
					repo.inputBox.value = newMessage;

					const action = await vscode.window.showInformationMessage(
						"Commit message regenerated!",
						"Edit again",
						"OK",
					);

					if (action === "Edit again") {
						await handleEditWithFeedback(repo, newMessage);
					}
				}
			} catch (error) {
				vscode.window.showErrorMessage(
					`Failed to regenerate: ${error.message}`,
				);
			}
		},
	);
}

function deactivate() {}

module.exports = {
	activate,
	deactivate,
};
