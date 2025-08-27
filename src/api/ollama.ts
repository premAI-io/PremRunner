const OLLAMA_EXECUTABLE_PATH = "/usr/local/bin/ollama";

async function getOllamaPath(): Promise<string> {
  if (
    OLLAMA_EXECUTABLE_PATH &&
    (await Bun.file(OLLAMA_EXECUTABLE_PATH).exists())
  ) {
    return OLLAMA_EXECUTABLE_PATH;
  }
  return "ollama";
}

export async function checkOllamaStatus(): Promise<
  "running" | "stopped" | "not_installed"
> {
  const ollamaPath = await getOllamaPath();

  try {
    const proc = Bun.spawnSync([ollamaPath, "ps"], {
      stdio: ["ignore", "pipe", "pipe"],
    });

    const stderr = new TextDecoder().decode(proc.stderr);

    if (proc.exitCode === 0) {
      return "running";
    }

    if (stderr.includes("could not connect to ollama server")) {
      return "stopped";
    }

    return "not_installed";
  } catch (error: any) {
    if (error.code === "ENOENT") {
      return "not_installed";
    }
    console.error(
      `An unexpected error occurred while running 'ollama ps':`,
      error,
    );
    return "not_installed";
  }
}

async function installOllama(): Promise<boolean> {
  console.log(
    "🔧 Ollama not found or is malfunctioning. Starting installation...",
  );
  const installCommand = "curl -fsSL https://ollama.com/install.sh | sh";
  const proc = Bun.spawn(["sh", "-c", installCommand], {
    stdio: ["inherit", "inherit", "inherit"],
    env: { ...process.env },
  });
  const exitCode = await proc.exitCode;
  if (exitCode !== 0) {
    console.error("❌ Ollama installation failed.");
    return false;
  }
  console.log("✅ Ollama installed successfully.");
  return true;
}

async function startOllamaService(): Promise<void> {
  const ollamaPath = await getOllamaPath();
  console.log(`⚙️ Starting Ollama service with command: '${ollamaPath} serve'`);
  Bun.spawn(["nohup", ollamaPath, "serve"], {
    stdio: ["ignore", "ignore", "ignore"],
    detached: true,
  });
}

async function waitForOllamaReady(timeoutSeconds = 20): Promise<boolean> {
  console.log("⏳ Waiting for Ollama service to become available...");
  const startTime = Date.now();
  while (Date.now() - startTime < timeoutSeconds * 1000) {
    if ((await checkOllamaStatus()) === "running") {
      return true;
    }
    await Bun.sleep(1000);
  }
  return false;
}

async function downloadModel(modelName: string): Promise<boolean> {
  const ollamaPath = await getOllamaPath();
  console.log(`📥 Downloading model: ${modelName}...`);

  try {
    const proc = Bun.spawn([ollamaPath, "pull", modelName], {
      stdio: ["inherit", "inherit", "inherit"],
    });

    const exitCode = await proc.exitCode;
    if (exitCode === 0) {
      console.log(`✅ Model ${modelName} downloaded successfully`);
      return true;
    } else {
      console.error(`❌ Failed to download model ${modelName}`);
      return false;
    }
  } catch (error) {
    console.error(`❌ Error downloading model ${modelName}:`, error);
    return false;
  }
}

async function checkModelExists(modelName: string): Promise<boolean> {
  const ollamaPath = await getOllamaPath();

  try {
    const proc = Bun.spawnSync([ollamaPath, "list"], {
      stdio: ["ignore", "pipe", "pipe"],
    });

    const stdout = new TextDecoder().decode(proc.stdout);
    return stdout.includes(modelName);
  } catch (error) {
    console.error("Error checking model list:", error);
    return false;
  }
}

export async function ensureModelDownloaded(
  modelName: string = "gemma3:270m",
): Promise<boolean> {
  console.log(`🔍 Checking if model ${modelName} is available...`);

  const exists = await checkModelExists(modelName);
  if (exists) {
    console.log(`✅ Model ${modelName} is already available`);
    return true;
  }

  return await downloadModel(modelName);
}

export async function chatWithOllama(
  model: string,
  message: string,
): Promise<string> {
  const ollamaPath = await getOllamaPath();

  try {
    const proc = Bun.spawnSync([ollamaPath, "run", model, message], {
      stdio: ["ignore", "pipe", "pipe"],
    });

    const stdout = new TextDecoder().decode(proc.stdout);
    const stderr = new TextDecoder().decode(proc.stderr);

    if (proc.exitCode === 0 && stdout.trim()) {
      return stdout.trim();
    } else {
      throw new Error(`Ollama error: ${stderr || "No response"}`);
    }
  } catch (error) {
    throw new Error(`Failed to chat with Ollama: ${error}`);
  }
}

export async function* chatWithOllamaStream(
  model: string,
  message: string,
): AsyncGenerator<string, void, unknown> {
  const ollamaPath = await getOllamaPath();

  try {
    const proc = Bun.spawn([ollamaPath, "run", model, message], {
      stdio: ["ignore", "pipe", "pipe"],
    });

    const reader = proc.stdout.getReader();
    const decoder = new TextDecoder();

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        if (chunk.trim()) {
          yield chunk;
        }
      }
    } finally {
      reader.releaseLock();
    }

    await proc.exited;
  } catch (error) {
    throw new Error(`Failed to stream chat with Ollama: ${error}`);
  }
}

export async function ensureOllamaRunning(): Promise<boolean> {
  console.log("🔍 Checking Ollama status...");

  let status = await checkOllamaStatus();

  if (status === "not_installed") {
    const installed = await installOllama();
    if (!installed) {
      return false;
    }
    status = await checkOllamaStatus();
  }

  if (status === "stopped") {
    console.log("✅ Ollama is installed but not running. Starting service...");
    await startOllamaService();
    if (!(await waitForOllamaReady())) {
      console.error("❌ Timed out waiting for the Ollama service to start.");
      return false;
    }
  }

  console.log("🚀 Ollama is up and running!");

  // Download initial model
  await ensureModelDownloaded("gemma3:270m");

  return true;
}
