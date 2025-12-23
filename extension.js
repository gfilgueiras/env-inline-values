const vscode = require("vscode");
const fs = require("fs");
const path = require("path");

function parseEnv(envPath) {
  if (!fs.existsSync(envPath)) return {};
  const raw = fs.readFileSync(envPath, "utf8");
  const vars = {};

  raw.split(/\r?\n/).forEach((line) => {
    if (line.trim().startsWith("#")) return;
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (m) vars[m[1]] = m[2];
  });

  function resolve(val, depth = 0) {
    if (depth > 10) return val;
    return val.replace(/\$\{([^}]+)\}/g, (_, v) => {
      if (vars[v] !== undefined) return resolve(vars[v], depth + 1);
      return "undefined";
    });
  }

  const resolved = {};
  Object.keys(vars).forEach((k) => (resolved[k] = resolve(vars[k])));
  return resolved;
}

function shouldActivate(editor, files) {
  const fileName = path.basename(editor.document.fileName);
  const ext = path.extname(fileName);
  return files.some((f) => f === fileName || f === ext);
}

function activate(context) {
  let decoration;

  function rebuildDecoration() {
    const config = vscode.workspace.getConfiguration("envInlineValues");
    const isItalic = config.get("italic");

    decoration = vscode.window.createTextEditorDecorationType({
      after: {
        color: config.get("textColor"),
        backgroundColor: config.get("backgroundColor") || "transparent",
        margin: "0 0 0 1rem",
        textDecoration: isItalic ? "none; font-style: italic;" : "none;",
      },
    });
  }

  rebuildDecoration();

  function update(editor) {
    if (!editor) return;

    const config = vscode.workspace.getConfiguration("envInlineValues");
    const files = config.get("files");

    if (!shouldActivate(editor, files)) {
      editor.setDecorations(decoration, []);
      return;
    }

    const ws = vscode.workspace.workspaceFolders;
    if (!ws) return;

    const envPath = path.join(ws[0].uri.fsPath, ".env");
    const env = parseEnv(envPath);

    const isEnvFile = path.basename(editor.document.fileName) === ".env";

    const lines = editor.document.getText().split(/\r?\n/);
    const decs = [];

    lines.forEach((line, i) => {
      const matches = [...line.matchAll(/\$\{([^}]+)\}/g)];
      if (!matches.length) return;

      let values;

      if (isEnvFile) {
        const keyMatch = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=/);
        if (!keyMatch) return;

        const key = keyMatch[1];
        values = [`${key}=${env[key] ?? "undefined"}`];
      } else {
        values = matches.map((m) => {
          const v = m[1];
          return `${v}=${env[v] ?? "undefined"}`;
        });
      }

      const range = new vscode.Range(i, line.length, i, line.length);
      decs.push({
        range,
        renderOptions: {
          after: {
            contentText: "  " + values.join(" | "),
          },
        },
      });
    });

    editor.setDecorations(decoration, decs);
  }

  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor(update),
    vscode.workspace.onDidChangeTextDocument(() => {
      if (vscode.window.activeTextEditor) {
        update(vscode.window.activeTextEditor);
      }
    }),
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("envInlineValues")) {
        rebuildDecoration();
        if (vscode.window.activeTextEditor) {
          update(vscode.window.activeTextEditor);
        }
      }
    })
  );

  if (vscode.window.activeTextEditor) {
    update(vscode.window.activeTextEditor);
  }
}

function deactivate() {}

module.exports = { activate, deactivate };
