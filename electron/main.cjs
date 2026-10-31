const { app, BrowserWindow, dialog, ipcMain, shell } = require("electron");
const { spawn } = require("node:child_process");
const { randomUUID } = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");

const selectedPdfs = new Map();
const generatedAudio = new Map();

function projectPath(...parts) {
  const root = app.isPackaged ? process.resourcesPath : app.getAppPath();
  return path.join(root, ...parts);
}

function getPythonPath() {
  if (process.env.AUCOVE_PYTHON) {
    return process.env.AUCOVE_PYTHON;
  }

  if (app.isPackaged) {
    return projectPath("python-runtime", "aucove-tts.exe");
  }

  return projectPath(
    ".venv",
    process.platform === "win32" ? "Scripts" : "bin",
    process.platform === "win32" ? "python.exe" : "python",
  );
}

async function createAudioOutputPath(pdfPath) {
  const outputDirectory = path.join(app.getPath("music"), "Aucove Audio");
  await fs.mkdir(outputDirectory, { recursive: true });

  const baseName = path.parse(pdfPath).name;
  for (let suffix = 1; suffix <= 999; suffix += 1) {
    const fileName =
      suffix === 1 ? `${baseName}.wav` : `${baseName} (${suffix}).wav`;
    const outputPath = path.join(outputDirectory, fileName);
    try {
      await fs.access(outputPath);
    } catch {
      return outputPath;
    }
  }

  throw new Error("Could not find an available name for the generated audio.");
}

async function registerPdf(filePath) {
  if (path.extname(filePath).toLowerCase() !== ".pdf") {
    throw new Error("Choose a PDF file to continue.");
  }

  const fileStats = await fs.stat(filePath);
  if (!fileStats.isFile()) {
    throw new Error("The selected PDF could not be opened.");
  }

  const id = randomUUID();
  selectedPdfs.set(id, filePath);
  return { id, name: path.basename(filePath), size: fileStats.size };
}

ipcMain.handle("pdf:select", async () => {
  const result = await dialog.showOpenDialog({
    properties: ["openFile"],
    filters: [{ name: "PDF documents", extensions: ["pdf"] }],
  });
  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }

  return registerPdf(result.filePaths[0]);
});

ipcMain.handle("pdf:register-drop", async (_event, filePath) =>
  registerPdf(filePath),
);

ipcMain.handle("audio:convert", async (event, { fileId, speed }) => {
  const pdfPath = selectedPdfs.get(fileId);
  if (!pdfPath) {
    throw new Error("Select the PDF again before converting it.");
  }

  const outputPath = await createAudioOutputPath(pdfPath);
  const audioId = randomUUID();
  const workerPath = projectPath("python", "tts_worker.py");
  const modelPath = projectPath("model.onnx");
  const assetsPath = projectPath("python", "assets");

  return new Promise((resolve, reject) => {
    const workerArgs = [
      "--pdf",
      pdfPath,
      "--model",
      modelPath,
      "--assets",
      assetsPath,
      "--output",
      outputPath,
      "--speed",
      String(speed),
    ];
    if (!app.isPackaged) {
      workerArgs.unshift(workerPath);
    }

    const worker = spawn(getPythonPath(), workerArgs, {
      cwd: app.getAppPath(),
      windowsHide: true,
    });

    let stdout = "";
    let stderr = "";
    let workerError = "";

    worker.stdout.setEncoding("utf8");
    worker.stdout.on("data", (chunk) => {
      stdout += chunk;
      const lines = stdout.split(/\r?\n/);
      stdout = lines.pop() ?? "";

      for (const line of lines) {
        if (!line) continue;
        try {
          const message = JSON.parse(line);
          if (message.type === "progress" && !event.sender.isDestroyed()) {
            event.sender.send("audio:progress", message);
          } else if (message.type === "error") {
            workerError = message.message;
          }
        } catch {
          stderr += `${line}\n`;
        }
      }
    });
    worker.stderr.setEncoding("utf8");
    worker.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    worker.on("error", (error) => {
      reject(
        new Error(`Could not start the local Python worker: ${error.message}`),
      );
    });
    worker.on("close", (code) => {
      if (code !== 0) {
        reject(
          new Error(
            workerError ||
              stderr.trim() ||
              `Audio conversion failed (${code}).`,
          ),
        );
        return;
      }

      generatedAudio.set(audioId, outputPath);
      resolve({
        audioId,
        name: path.basename(outputPath),
        sampleRate: 24_000,
      });
    });
  });
});

ipcMain.handle("audio:read", async (_event, audioId) => {
  const audioPath = generatedAudio.get(audioId);
  if (!audioPath) {
    throw new Error("Generated audio is no longer available.");
  }
  return fs.readFile(audioPath);
});

ipcMain.handle("audio:reveal", (_event, audioId) => {
  const audioPath = generatedAudio.get(audioId);
  if (!audioPath) {
    throw new Error("Generated audio is no longer available.");
  }
  shell.showItemInFolder(audioPath);
});

function createWindow() {
  const window = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  window.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("https://")) {
      void shell.openExternal(url);
    }

    return { action: "deny" };
  });

  if (app.isPackaged) {
    void window.loadFile(path.join(__dirname, "..", "dist", "index.html"));
  } else {
    void window.loadURL("http://127.0.0.1:5173");
  }
}

app.whenReady().then(() => {
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
