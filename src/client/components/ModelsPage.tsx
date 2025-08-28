import { useState, useEffect, useRef } from "react";
import { authFetch } from "../utils/api";

interface Model {
  id: string;
  name: string;
  alias?: string;
  size: number;
  uploadedAt: string;
  active: boolean;
  imported?: boolean;
  status?: "importing" | "ready" | "failed";
}

export default function ModelsPage() {
  const [models, setModels] = useState<Model[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [dragActive, setDragActive] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [modelName, setModelName] = useState("");
  const [showNameDialog, setShowNameDialog] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadModels();
    // Poll for import status updates every 5 seconds
    const interval = setInterval(loadModels, 5000);
    return () => clearInterval(interval);
  }, []);

  const loadModels = async () => {
    try {
      const response = await authFetch("/v1/models");
      if (response.ok) {
        const data = await response.json();
        setModels(data.models || []);
      }
    } catch (error) {
      console.error("Failed to load models:", error);
    }
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileSelect(e.dataTransfer.files[0]);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleFileSelect(e.target.files[0]);
    }
  };

  const handleFileSelect = (file: File) => {
    console.log(
      "File selected:",
      file.name,
      "Type:",
      file.type,
      "Size:",
      file.size,
    );
    console.log("File size in MB:", (file.size / 1024 / 1024).toFixed(2));
    console.log(
      "File size in GB:",
      (file.size / 1024 / 1024 / 1024).toFixed(2),
    );

    // Check file extension and MIME type
    const isZip =
      file.name.toLowerCase().endsWith(".zip") ||
      file.type === "application/zip" ||
      file.type === "application/x-zip-compressed";

    if (!isZip) {
      alert(
        `Please upload a ZIP file containing the model weights.\nYou selected: ${file.name} (type: ${file.type || "unknown"})`,
      );
      return;
    }

    // Warn if file is suspiciously small
    if (file.size < 1000) {
      if (
        !confirm(
          `This file seems very small (${file.size} bytes). Are you sure it contains a valid model?`,
        )
      ) {
        return;
      }
    }

    setSelectedFile(file);
    setModelName(file.name.replace(".zip", ""));
    setShowNameDialog(true);
  };

  const uploadChunked = async (file: File, modelName: string) => {
    const CHUNK_SIZE = 50 * 1024 * 1024; // 50MB chunks
    const totalChunks = Math.ceil(file.size / CHUNK_SIZE);

    console.log(
      `📦 Starting chunked upload: ${totalChunks} chunks of ${CHUNK_SIZE / 1024 / 1024}MB`,
    );

    // Step 1: Initialize chunked upload
    const initResponse = await authFetch("/v1/chunked-upload/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fileName: file.name,
        fileSize: file.size,
        modelName: modelName,
      }),
    });

    if (!initResponse.ok) {
      throw new Error("Failed to initialize upload");
    }

    const { modelId } = await initResponse.json();
    console.log(`📝 Upload ID: ${modelId}`);

    // Step 2: Upload chunks
    for (let i = 0; i < totalChunks; i++) {
      const start = i * CHUNK_SIZE;
      const end = Math.min(start + CHUNK_SIZE, file.size);
      const chunk = file.slice(start, end);

      const formData = new FormData();
      formData.append("chunk", chunk);
      formData.append("modelId", modelId);
      formData.append("chunkIndex", i.toString());
      formData.append("totalChunks", totalChunks.toString());

      const chunkResponse = await authFetch("/v1/chunked-upload/chunk", {
        method: "POST",
        body: formData,
      });

      if (!chunkResponse.ok) {
        throw new Error(`Failed to upload chunk ${i + 1}/${totalChunks}`);
      }

      const progress = ((i + 1) / totalChunks) * 100;
      setUploadProgress(Math.round(progress));
      console.log(
        `📊 Uploaded chunk ${i + 1}/${totalChunks} (${progress.toFixed(1)}%)`,
      );
    }

    // Step 3: Complete upload
    const completeResponse = await authFetch("/v1/chunked-upload/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        modelId,
        modelName,
        totalChunks,
      }),
    });

    if (!completeResponse.ok) {
      throw new Error("Failed to complete upload");
    }

    return await completeResponse.json();
  };

  const handleUpload = async () => {
    if (!selectedFile || !modelName.trim()) {
      alert("Please provide a name for the model");
      return;
    }

    setShowNameDialog(false);
    setUploading(true);
    setUploadProgress(0);

    console.log("Starting upload of file:", selectedFile.name);
    console.log("File size:", selectedFile.size, "bytes");
    console.log(
      "File size (GB):",
      (selectedFile.size / 1024 / 1024 / 1024).toFixed(2),
      "GB",
    );

    try {
      // Use chunked upload for files over 100MB
      if (selectedFile.size > 100 * 1024 * 1024) {
        console.log("🔄 Using chunked upload for large file");
        const result = await uploadChunked(selectedFile, modelName.trim());

        // Now trigger the model import
        const formData = new FormData();
        formData.append("modelId", result.modelId);
        formData.append("modelName", modelName.trim());
        formData.append("filePath", result.path);

        const importResponse = await authFetch("/v1/models/import", {
          method: "POST",
          body: formData,
        });

        if (importResponse.ok) {
          const { id } = await importResponse.json();
          pollModelStatus(id || result.modelId);
        }

        setTimeout(() => {
          setUploading(false);
          setUploadProgress(0);
          setSelectedFile(null);
          setModelName("");
          loadModels();
        }, 1000);
      } else {
        // Use regular upload for small files
        console.log("📤 Using regular upload for small file");
        const formData = new FormData();
        formData.append("file", selectedFile);
        formData.append("name", modelName.trim());

        const xhr = new XMLHttpRequest();

        xhr.upload.addEventListener("progress", (e) => {
          if (e.lengthComputable) {
            const percentComplete = (e.loaded / e.total) * 100;
            setUploadProgress(Math.round(percentComplete));
            console.log(
              `Upload progress: ${e.loaded} / ${e.total} bytes (${percentComplete.toFixed(1)}%)`,
            );
          }
        });

        xhr.addEventListener("load", async () => {
          console.log("Upload completed with status:", xhr.status);
          console.log("Response:", xhr.responseText.substring(0, 200));

          if (xhr.status === 200) {
            setUploadProgress(100);

            // Parse response to get model ID
            try {
              const response = JSON.parse(xhr.responseText);
              if (response.id) {
                // Start polling for import status
                pollModelStatus(response.id);
              }
            } catch (e) {
              console.error("Failed to parse upload response:", e);
            }

            setTimeout(() => {
              setUploading(false);
              setUploadProgress(0);
              setSelectedFile(null);
              setModelName("");
              loadModels();
            }, 1000);
          } else {
            alert("Upload failed");
            setUploading(false);
            setUploadProgress(0);
          }
        });

        xhr.addEventListener("error", () => {
          alert("Upload failed");
          setUploading(false);
          setUploadProgress(0);
        });

        xhr.open("POST", "/v1/models/upload");
        xhr.send(formData);
      }
    } catch (error) {
      console.error("Upload error:", error);
      alert("Failed to upload model: " + error);
      setUploading(false);
      setUploadProgress(0);
    }
  };

  const deleteModel = async (modelId: string) => {
    if (!confirm("Are you sure you want to delete this model?")) {
      return;
    }

    try {
      const response = await authFetch(`/v1/models/${modelId}`, {
        method: "DELETE",
      });
      if (response.ok) {
        loadModels();
      }
    } catch (error) {
      console.error("Failed to delete model:", error);
      alert("Failed to delete model");
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i];
  };

  const pollModelStatus = async (modelId: string) => {
    let attempts = 0;
    const maxAttempts = 60; // Poll for up to 5 minutes (60 * 5 seconds)

    const checkStatus = async () => {
      try {
        const response = await authFetch(`/v1/models/${modelId}/status`);
        if (response.ok) {
          const data = await response.json();
          if (data.imported) {
            // Model is ready, refresh the list
            loadModels();
            return true;
          }
        }
      } catch (error) {
        console.error("Failed to check model status:", error);
      }

      attempts++;
      if (attempts < maxAttempts) {
        setTimeout(checkStatus, 5000); // Check again in 5 seconds
      }
      return false;
    };

    checkStatus();
  };

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Header */}
      <div className="h-[73px] border-b border-stone-200 bg-stone-50 px-6 flex items-center">
        <div className="flex items-center justify-between w-full">
          <h2 className="text-lg font-semibold text-stone-950">
            Finetuned Models
          </h2>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-6xl mx-auto">
          {/* Page Description */}
          <p className="text-base font-medium text-stone-950 mb-6">
            Upload and manage your finetuned models
          </p>
          {/* Upload Area */}
          <div
            className={`mb-8 border-2 border-dashed rounded-2xl p-12 text-center transition-all duration-200 cursor-pointer ${
              dragActive
                ? "border-primary bg-blue-50"
                : "border-stone-200 bg-stone-50 hover:border-stone-300"
            }`}
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
            onClick={() => !uploading && fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".zip"
              onChange={handleFileInputChange}
              className="hidden"
            />

            {uploading ? (
              <div className="space-y-6">
                <div className="flex justify-center">
                  <div className="w-16 h-16 bg-primary bg-opacity-10 rounded-full flex items-center justify-center">
                    <svg
                      className="animate-spin h-8 w-8 text-primary"
                      fill="none"
                      viewBox="0 0 24 24"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      ></circle>
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      ></path>
                    </svg>
                  </div>
                </div>
                <div>
                  <p className="text-lg font-medium text-stone-950 mb-2">
                    Uploading model...
                  </p>
                  <p className="text-sm text-stone-500 mb-4">
                    {uploadProgress}% complete
                  </p>
                  <div className="max-w-xs mx-auto">
                    <div className="bg-stone-200 rounded-full h-2 overflow-hidden">
                      <div
                        className="bg-primary h-full transition-all duration-300"
                        style={{ width: `${uploadProgress}%` }}
                      ></div>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <>
                <div className="flex justify-center mb-4">
                  <div className="w-16 h-16 bg-stone-100 rounded-full flex items-center justify-center">
                    <svg
                      className="w-8 h-8 text-stone-400"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={1.5}
                        d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                      />
                    </svg>
                  </div>
                </div>
                <p className="text-lg font-medium text-stone-950 mb-2">
                  Drop your model ZIP file here
                </p>
                <p className="text-sm text-stone-500 mb-4">
                  or click to browse your files
                </p>
                <p className="text-xs text-stone-400">
                  Supports ZIP files up to 10GB containing model weights
                </p>
              </>
            )}
          </div>

          {/* Models List */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-medium text-stone-950">
                Available Finetuned Models
              </h3>
              <span className="text-sm text-stone-500">
                {models.length} {models.length === 1 ? "model" : "models"}
              </span>
            </div>

            {models.length === 0 ? (
              <div className="bg-stone-50 rounded-lg border border-stone-200 p-12 text-center">
                <div className="w-16 h-16 bg-stone-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <svg
                    className="w-8 h-8 text-stone-400"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.5}
                      d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
                    />
                  </svg>
                </div>
                <p className="text-lg font-medium text-stone-950 mb-1">
                  No finetuned models yet
                </p>
                <p className="text-sm text-stone-500">
                  Upload your first finetuned model to get started
                </p>
              </div>
            ) : (
              <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                {models.map((model) => (
                  <div
                    key={model.id}
                    className="bg-white rounded-lg border border-stone-200 p-4 hover:shadow-md hover:translate-y-[-2px] transition-all duration-200"
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1">
                        <h4 className="font-medium text-stone-950 text-sm mb-1">
                          {model.name}
                        </h4>
                        <p className="text-xs text-stone-500">
                          {formatFileSize(model.size)}
                        </p>
                      </div>
                      {model.active ? (
                        <span className="px-2 py-0.5 text-xs bg-green-100 text-green-700 rounded-full font-medium">
                          Ready
                        </span>
                      ) : (
                        <div className="flex items-center gap-1">
                          <div className="w-2 h-2 bg-amber-500 rounded-full animate-pulse"></div>
                          <span className="px-2 py-0.5 text-xs text-amber-700 font-medium">
                            Importing...
                          </span>
                        </div>
                      )}
                    </div>

                    <div className="flex items-center justify-between pt-3 border-t border-stone-100">
                      <p className="text-xs text-stone-400">
                        {new Date(model.uploadedAt).toLocaleDateString(
                          "en-US",
                          {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          },
                        )}
                      </p>
                      <button
                        onClick={() => deleteModel(model.id)}
                        className="p-1.5 text-stone-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                        title="Delete model"
                      >
                        <svg
                          className="w-4 h-4"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                          />
                        </svg>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Model Name Dialog */}
      {showNameDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
            <h3 className="text-lg font-semibold text-stone-950 mb-4">
              Name Your Finetuned Model
            </h3>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-stone-700 mb-2">
                  Model Name
                </label>
                <input
                  type="text"
                  value={modelName}
                  onChange={(e) => setModelName(e.target.value)}
                  placeholder="Enter a name for your model"
                  className="w-full px-3 py-2 border border-stone-200 rounded-lg text-stone-950 placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                  autoFocus
                />
                <p className="text-xs text-stone-500 mt-1">
                  This name will be used to identify your model
                </p>
              </div>

              <div className="bg-stone-50 rounded-lg p-3">
                <p className="text-xs text-stone-600">
                  <span className="font-medium">File:</span>{" "}
                  {selectedFile?.name}
                </p>
                <p className="text-xs text-stone-600">
                  <span className="font-medium">Size:</span>{" "}
                  {selectedFile ? formatFileSize(selectedFile.size) : ""}
                </p>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => {
                  setShowNameDialog(false);
                  setSelectedFile(null);
                  setModelName("");
                }}
                className="flex-1 px-4 py-2 border border-stone-200 text-stone-700 rounded-lg hover:bg-stone-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleUpload}
                disabled={!modelName.trim()}
                className="flex-1 px-4 py-2 bg-primary text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Upload
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
