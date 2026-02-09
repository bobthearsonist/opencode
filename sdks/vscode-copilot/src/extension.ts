// This method is called when your extension is deactivated
export function deactivate() {}

import * as vscode from "vscode"

export function activate(context: vscode.ExtensionContext) {
  console.log("OpenCode Copilot Agent activated")

  // TODO: Register chat participant handler for "opencode.copilot"
  // This will handle incoming chat requests from Copilot's chat panel
  // and route them through the OpenCode agent runtime.

  // TODO: Register chat session provider for "opencode" session type
  // This will allow creating new OpenCode-backed chat sessions
  // via the proposed chatSessionsProvider API.

  // TODO: Initialize the OpenCode SDK client connection
  // The SDK will bridge between VS Code's chat APIs and
  // the OpenCode agent backend.
}
