import { useEffect, useState } from "react";
import {
  AudioLines,
  CircleCheck,
  FileText,
  FolderOpen,
  Headphones,
  LockKeyhole,
  LoaderCircle,
  Music2,
  Upload,
  X,
} from "lucide-react";
import "./App.css";

const playbackRates = [0.85, 1, 1.15];

function formatFileSize(bytes) {
  if (bytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function App() {
  const [selectedFile, setSelectedFile] = useState(null);
  const [error, setError] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [isConverting, setIsConverting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressStatus, setProgressStatus] = useState("");
  const [audioResult, setAudioResult] = useState(null);
  const [audioUrl, setAudioUrl] = useState("");
  const [playbackRate, setPlaybackRate] = useState(1);

  useEffect(() => {
    if (!window.desktop?.onProgress) return undefined;

    return window.desktop.onProgress((update) => {
      setProgress(update.percent);
      setProgressStatus(update.status);
    });
  }, []);

  useEffect(
    () => () => {
      if (audioUrl) URL.revokeObjectURL(audioUrl);
    },
    [audioUrl],
  );

  function resetAudioOutput() {
    setAudioResult(null);
    setAudioUrl("");
    setProgress(0);
    setProgressStatus("");
  }

  function clearSelectedPdf() {
    setSelectedFile(null);
    resetAudioOutput();
  }

  function selectPdf(file) {
    if (!file) return;

    if (!file.name.toLowerCase().endsWith(".pdf")) {
      setSelectedFile(null);
      setError("Choose a PDF file to continue.");
      return;
    }

    setError("");
    setSelectedFile(file);
    resetAudioOutput();
  }

  async function registerPdf(file) {
    if (window.desktop?.registerDroppedPdf) {
      try {
        const selected = await window.desktop.registerDroppedPdf(file);
        setSelectedFile(selected);
        setError("");
        resetAudioOutput();
      } catch (registrationError) {
        setError(registrationError.message || "Could not open this PDF.");
      }
      return;
    }

    selectPdf(file);
  }

  function handleFileChange(event) {
    const file = event.currentTarget.files?.[0];
    if (file) void registerPdf(file);
    event.currentTarget.value = "";
  }

  async function handleDrop(event) {
    event.preventDefault();
    setIsDragging(false);
    const file = event.dataTransfer.files?.[0];
    if (file) await registerPdf(file);
  }

  async function handleUploadClick(event) {
    if (!window.desktop?.selectPdf) return;
    event.preventDefault();

    try {
      const file = await window.desktop.selectPdf();
      if (file) {
        setSelectedFile(file);
        setError("");
        resetAudioOutput();
      }
    } catch (selectionError) {
      setError(selectionError.message || "Could not open this PDF.");
    }
  }

  async function handleConvert() {
    if (!selectedFile?.id || !window.desktop?.convertPdf || isConverting)
      return;

    setError("");
    setProgress(0);
    setProgressStatus("Starting offline conversion");
    setIsConverting(true);
    setAudioResult(null);
    setAudioUrl("");

    try {
      const result = await window.desktop.convertPdf({
        fileId: selectedFile.id,
        speed: playbackRate,
      });
      const audioData = await window.desktop.readAudio(result.audioId);
      const audioBlob = new Blob([audioData], { type: "audio/wav" });
      setAudioUrl(URL.createObjectURL(audioBlob));
      setAudioResult(result);
      setProgress(100);
      setProgressStatus("Audio ready");
    } catch (conversionError) {
      setError(conversionError.message || "Audio conversion failed.");
      setProgressStatus("Conversion failed");
    } finally {
      setIsConverting(false);
    }
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="#workspace" aria-label="Aucove home">
          <span className="brand-mark">
            <AudioLines size={19} strokeWidth={2.2} />
          </span>
          <span className="brand-name">aucove</span>
        </a>
        <div className="topbar-meta">
          <span className="topbar-divider" />
          <span className="topbar-caption">PDF AUDIO WORKSPACE</span>
        </div>
        <div className="privacy-label">
          <LockKeyhole size={14} strokeWidth={1.8} />
          <span>DESIGNED FOR OFFLINE USE</span>
        </div>
      </header>

      <main id="workspace" className="workspace">
        <div className="page-heading">
          <div>
            <p className="eyebrow">YOUR LISTENING DESK</p>
            <h1>PDF to audio</h1>
            <p className="page-description">
              Prepare a document for your next listening session.
            </p>
          </div>
          <div className="step-indicator" aria-label="Step 1 of 2">
            <span className="step-indicator-current">01</span>
            <span className="step-indicator-line" />
            <span>02</span>
            <span className="step-indicator-label">SOURCE</span>
          </div>
        </div>

        <div className="workspace-grid">
          <section className="source-panel" aria-labelledby="source-heading">
            <div className="section-heading">
              <div className="section-index">01</div>
              <div>
                <h2 id="source-heading">Choose a document</h2>
                <p>Start with a PDF from your device.</p>
              </div>
            </div>

            {selectedFile ? (
              <div className="selected-file">
                <div className="file-type-icon">
                  <FileText size={21} strokeWidth={1.7} />
                </div>
                <div className="file-details">
                  <span className="file-name" title={selectedFile.name}>
                    {selectedFile.name}
                  </span>
                  <span className="file-meta">
                    PDF document <span className="meta-dot">·</span>{" "}
                    {formatFileSize(selectedFile.size)}
                  </span>
                </div>
                <span className="file-ready">
                  <span /> READY
                </span>
                <button
                  className="icon-button remove-file"
                  type="button"
                  aria-label="Remove selected PDF"
                  title="Remove PDF"
                  onClick={clearSelectedPdf}
                >
                  <X size={17} />
                </button>
              </div>
            ) : (
              <label
                className={`upload-zone${isDragging ? " upload-zone-active" : ""}`}
                htmlFor="pdf-file"
                onDragOver={(event) => {
                  event.preventDefault();
                  setIsDragging(true);
                }}
                onDragLeave={(event) => {
                  if (!event.currentTarget.contains(event.relatedTarget)) {
                    setIsDragging(false);
                  }
                }}
                onDrop={handleDrop}
                onClick={handleUploadClick}
              >
                <input
                  id="pdf-file"
                  className="visually-hidden"
                  type="file"
                  accept="application/pdf,.pdf"
                  onChange={handleFileChange}
                />
                <span className="upload-icon">
                  <Upload size={20} strokeWidth={1.8} />
                </span>
                <span className="upload-title">Drop your PDF here</span>
                <span className="upload-subtitle">
                  or browse files on your device
                </span>
                <span className="upload-browse">Browse PDF</span>
                <span className="upload-footnote">PDF files only</span>
              </label>
            )}

            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}

            <div className="local-note">
              <LockKeyhole size={15} strokeWidth={1.8} />
              <p>
                <strong>Your file stays on this device.</strong> Nothing is
                uploaded.
              </p>
            </div>
          </section>

          <section
            className="settings-panel"
            aria-labelledby="settings-heading"
          >
            <div className="section-heading">
              <div className="section-index">02</div>
              <div>
                <h2 id="settings-heading">Listening settings</h2>
                <p>Fine-tune your audio session.</p>
              </div>
            </div>

            <div className="setting-group">
              <div className="setting-label-row">
                <label htmlFor="voice-model">Voice</label>
                <span className="coming-soon">OFFLINE MODEL</span>
              </div>
              <div className="voice-select-wrap">
                <Headphones size={17} strokeWidth={1.8} />
                <select
                  id="voice-model"
                  value="af_msa"
                  disabled
                  aria-label="Voice model"
                >
                  <option value="af_msa">English · American voice</option>
                </select>
              </div>
              <p className="setting-hint">
                Kokoro distilled voice · runs locally on this device.
              </p>
            </div>

            <div className="setting-group speed-setting">
              <div className="setting-label-row">
                <span className="setting-label">Reading speed</span>
                <span className="speed-value">
                  {playbackRate.toFixed(2).replace(/0$/, "")}×
                </span>
              </div>
              <div
                className="speed-control"
                role="group"
                aria-label="Reading speed"
              >
                {playbackRates.map((rate) => (
                  <button
                    className={
                      playbackRate === rate
                        ? "speed-option speed-option-active"
                        : "speed-option"
                    }
                    key={rate}
                    type="button"
                    aria-pressed={playbackRate === rate}
                    onClick={() => setPlaybackRate(rate)}
                  >
                    {rate.toFixed(2).replace(/0$/, "")}×
                  </button>
                ))}
              </div>
              <p className="setting-hint">You can change this any time.</p>
            </div>

            <div className="output-format">
              <div className="output-icon">
                <Music2 size={17} strokeWidth={1.8} />
              </div>
              <div>
                <span className="output-title">Audio output</span>
                <span className="output-detail">
                  WAV · 24 kHz <span className="meta-dot">·</span> saved to your
                  device
                </span>
              </div>
            </div>
          </section>
        </div>

        {(isConverting || progress > 0 || audioResult) && (
          <section
            className="conversion-feedback"
            aria-label="Conversion status"
          >
            <div className="progress-heading">
              <div className="progress-title">
                {isConverting ? (
                  <LoaderCircle className="progress-spinner" size={16} />
                ) : (
                  <CircleCheck size={16} />
                )}
                <span>{progressStatus || "Conversion progress"}</span>
              </div>
              <strong>{progress}%</strong>
            </div>
            <div
              className="progress-track"
              role="progressbar"
              aria-label="Audio generation progress"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={progress}
            >
              <span style={{ width: `${progress}%` }} />
            </div>
            {audioResult && audioUrl && (
              <div className="audio-result">
                <div className="audio-result-title">
                  <Music2 size={16} />
                  <span>{audioResult.name}</span>
                  <button
                    className="icon-button reveal-audio"
                    type="button"
                    title="Show audio file in folder"
                    aria-label="Show audio file in folder"
                    onClick={() =>
                      window.desktop?.revealAudio(audioResult.audioId)
                    }
                  >
                    <FolderOpen size={16} />
                  </button>
                </div>
                <audio controls preload="metadata" src={audioUrl}>
                  Your browser does not support audio playback.
                </audio>
              </div>
            )}
          </section>
        )}

        <footer className="action-bar">
          <div className="action-status">
            <span
              className={`status-indicator${isConverting ? " status-indicator-active" : ""}`}
            />
            <span>
              {isConverting
                ? "Generating audio locally"
                : audioResult
                  ? "Audio saved to your device"
                  : selectedFile
                    ? "Document selected"
                    : "Waiting for a document"}
            </span>
          </div>
          <div className="action-right">
            <span className="model-notice">
              Audio saves to Music/Aucove Audio. Your PDF stays on this device.
            </span>
            <button
              className={`convert-button${selectedFile?.id ? " convert-button-ready" : ""}`}
              type="button"
              disabled={
                !selectedFile?.id || isConverting || !window.desktop?.convertPdf
              }
              onClick={handleConvert}
              title={
                !selectedFile?.id
                  ? "Choose a PDF first"
                  : "Convert this PDF to WAV audio"
              }
            >
              {isConverting ? (
                <LoaderCircle className="progress-spinner" size={17} />
              ) : (
                <AudioLines size={17} strokeWidth={2} />
              )}
              {isConverting ? "Generating audio" : "Convert to audio"}
            </button>
          </div>
        </footer>
      </main>

      <div className="bottom-caption">
        <span>AUCOVE</span>
        <span>PRIVATE BY DESIGN</span>
      </div>
    </div>
  );
}

export default App;
