const vscode = require("vscode");

const tasks = [
  { label: "Run DEV", taskName: "Tentacles: Run DEV" },
  { label: "Build DEV", taskName: "Tentacles: Build DEV" },
  { label: "Run Tests", taskName: "Tentacles: Run Tests" },
  { label: "Release", taskName: "Tentacles: Release" },
  { label: "Deploy", taskName: "Tentacles: Deploy" }
];

class TentaclesControlsProvider {
  getTreeItem(item) {
    return item;
  }

  getChildren() {
    return tasks.map(({ label, taskName }) => {
      const item = new vscode.TreeItem(label, vscode.TreeItemCollapsibleState.None);
      item.command = {
        command: "tentacles.runTask",
        title: label,
        arguments: [taskName]
      };
      return item;
    });
  }
}

async function runTask(label) {
  const tasks = await vscode.tasks.fetchTasks();
  const task = tasks.find((candidate) => candidate.name === label);

  if (!task) {
    vscode.window.showErrorMessage(`Task not found: ${label}`);
    return;
  }

  await vscode.tasks.executeTask(task);
}

function activate(context) {
  const provider = new TentaclesControlsProvider();

  context.subscriptions.push(
    vscode.window.registerTreeDataProvider("tentacles.controls", provider),
    vscode.commands.registerCommand("tentacles.runTask", runTask)
  );
}

function deactivate() {}

module.exports = {
  activate,
  deactivate
};