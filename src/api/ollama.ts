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
  messages: Array<{ role: string; content: string }>,
): Promise<string> {
  try {
    const response = await fetch("http://localhost:11434/api/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages,
        stream: false,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP error! status: ${response.status}, body: ${errorText}`);
    }

    const data = await response.json();
    if (!data.message?.content) {
      console.error("Unexpected response format:", data);
      throw new Error("No content in response");
    }
    return data.message.content;
  } catch (error) {
    console.error("Ollama API error:", error);
    throw new Error(`Failed to chat with Ollama: ${error}`);
  }
}

export async function* chatWithOllamaStream(
  model: string,
  messages: Array<{ role: string; content: string }>,
): AsyncGenerator<string, void, unknown> {
  try {
    const response = await fetch("http://localhost:11434/api/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages,
        stream: true,
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error("No response body");
    }

    const decoder = new TextDecoder();
    let buffer = "";

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.trim()) {
            try {
              const data = JSON.parse(line);
              if (data.message?.content !== undefined && !data.done) {
                // Yield only the incremental content
                yield data.message.content;
              }
            } catch (e) {
              console.error("Failed to parse JSON:", line, e);
            }
          }
        }
      }
      
      // Process any remaining buffer
      if (buffer.trim()) {
        try {
          const data = JSON.parse(buffer);
          if (data.message?.content !== undefined && !data.done) {
            yield data.message.content;
          }
        } catch (e) {
          // Ignore final parse errors
        }
      }
    } finally {
      reader.releaseLock();
    }
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
