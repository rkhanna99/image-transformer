import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Download,
  FileImage,
  FolderOpen,
  Home,
  ImagePlus,
  Moon,
  Palette,
  Sun,
  Upload,
  X,
} from "lucide-react";
import { ThreeHeroCanvas } from "./components/ThreeHeroCanvas";
import { ThreeToolInspector } from "./components/ThreeToolInspector";
import { GenerateActions, RatioSelect, RATIO_OPTIONS, WandIcon } from "./components/ToolControls";
import { IntakeDropDock } from "./components/IntakeDropDock";
import {
  getJob,
  refreshJob,
  requestQrCode,
  submitBorderBatch,
  submitMetadataBatch,
  submitMetadataImage,
  submitPalette,
} from "./lib/toolkitApi";
import type {
  MetadataDraft,
  MetadataSubmission,
  ProcessingJob,
  QrCodeResult,
  ToolId,
  WorkspaceImage,
} from "./types/toolkit";

type Tool = ToolId;
type Draft = MetadataDraft;
type Source = WorkspaceImage;
type Job = ProcessingJob;
type Artifact = { job: Job; index: number; fingerprint: string; imageId?: string; tool?: Tool };
const routes: Record<Tool, string> = {
  home: "/",
  metadata: "/metadata",
  border: "/border",
  palette: "/palette",
  qrcode: "/qr-code",
};
const labels: Record<Tool, string> = {
  home: "Overview",
  metadata: "Metadata",
  border: "White Border",
  palette: "Color Palette",
  qrcode: "QR Code",
};
const ratioOptions = RATIO_OPTIONS;
const uid = () => crypto.randomUUID();
function fingerprint(id: string, settings: unknown) {
  return `${id}:${JSON.stringify(settings)}`;
}
function metadataPayload(settings: Draft & { clientImageId: string }): MetadataSubmission {
  const ratio = settings.aspectRatio;
  const custom = !ratioOptions.slice(0, -1).includes(ratio);
  return {
    ...settings,
    aspectRatio: custom ? "Custom" : ratio === "Default" ? "DEFAULT" : ratio,
    customAspectRatio: custom ? ratio : null,
  };
}
function toolForPath(path: string): Tool {
  return (Object.entries(routes).find(([, route]) => route === path)?.[0] as Tool) || "home";
}

export default function App() {
  const [pathname, setPathname] = useState(location.pathname);
  const [tool, setTool] = useState<Tool>(() => toolForPath(location.pathname));
  const [sources, setSources] = useState<Source[]>([]);
  const sourcesRef = useRef<Source[]>([]);
  const mountedRef = useRef(false);
  sourcesRef.current = sources;
  const [selected, setSelected] = useState("");
  const [dark, setDark] = useState(false);
  const [borderSize, setBorderSize] = useState(10);
  const [borderRatio, setBorderRatio] = useState("4:5");
  const [paletteCount, setPaletteCount] = useState(7);
  const [qrUrl, setQrUrl] = useState("");
  const [qrFormat, setQrFormat] = useState<"PNG" | "JPEG">("PNG");
  const [qrTransparent, setQrTransparent] = useState(false);
  const [qrUseReference, setQrUseReference] = useState(false);
  const [qrReferenceId, setQrReferenceId] = useState("");
  const [qrColors, setQrColors] = useState({ foreground: "#111827", background: "#FFFFFF" });
  const [qrInitialColors, setQrInitialColors] = useState({
    foreground: "#111827",
    background: "#FFFFFF",
  });
  const [qrResult, setQrResult] = useState<QrCodeResult | null>(null);
  const [qrResultKey, setQrResultKey] = useState("");
  const [qrDirty, setQrDirty] = useState(false);
  const [artifacts, setArtifacts] = useState<Record<string, Artifact>>({});
  const [activeArtifact, setActiveArtifact] = useState<Artifact | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [printMode, setPrintMode] = useState(false);
  const [compareOriginal, setCompareOriginal] = useState(false);
  const [printCanvas, setPrintCanvas] = useState<HTMLCanvasElement | null>(null);
  const [savedJob, setSavedJob] = useState<Job | null>(null);
  const [savedIndex, setSavedIndex] = useState(0);
  const [statusRetry, setStatusRetry] = useState(0);
  const [savedLoading, setSavedLoading] = useState(location.pathname.startsWith("/results/"));
  const [savedError, setSavedError] = useState("");
  const [savedPollingError, setSavedPollingError] = useState("");
  const [recoveryJobs, setRecoveryJobs] = useState<Record<string, { job: Job; tool: Tool }>>({});
  const [dragTarget, setDragTarget] = useState<Tool | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const selectedSource = sources.find((item) => item.id === selected) || null;
  const toolKey = (t: Tool, id: string) => `${t}:${id}`;
  const selectedArtifact = selectedSource ? artifacts[toolKey(tool, selectedSource.id)] : undefined;
  const shownUrl = selectedArtifact?.job.preview_urls[selectedArtifact.index] || "";
  const imageFor3d =
    savedJob?.preview_urls[savedIndex] ||
    (tool === "qrcode" ? qrResult?.image_data_url || "" : shownUrl);

  const navigate = useCallback((next: Tool | string, push = true) => {
    const path = next in routes ? routes[next as Tool] : next;
    if (push && location.pathname !== path) history.pushState({}, "", path);
    setPathname(path);
    if (path.startsWith("/results/")) {
      setTool("home");
      setSavedJob(null);
      setSavedIndex(0);
      setSavedLoading(true);
      setSavedError("");
      setSavedPollingError("");
      return;
    }
    setTool(toolForPath(path));
    setMessage("");
    setSavedJob(null);
    setSavedIndex(0);
    setSavedLoading(false);
    setSavedError("");
    setSavedPollingError("");
    setCompareOriginal(false);
  }, []);
  useEffect(() => {
    const onPop = () => {
      const path = window.location.pathname;
      setPathname(path);
      setTool(toolForPath(path));
      setSavedJob(null);
      setSavedIndex(0);
      setSavedLoading(path.startsWith("/results/"));
      setSavedError("");
      setSavedPollingError("");
      setMessage("");
      setCompareOriginal(false);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        /INPUT|TEXTAREA|SELECT|BUTTON/.test((event.target as HTMLElement)?.tagName || "")
      )
        return;
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      if (savedJob?.outputs.length) {
        event.preventDefault();
        setSavedIndex((index) =>
          Math.max(
            0,
            Math.min(savedJob.outputs.length - 1, index + (event.key === "ArrowRight" ? 1 : -1)),
          ),
        );
      } else if (sources.length > 1) {
        event.preventDefault();
        const current = sources.findIndex((source) => source.id === selected);
        const delta = event.key === "ArrowRight" ? 1 : -1;
        setSelected(sources[(current + delta + sources.length) % sources.length].id);
        setCompareOriginal(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [savedJob, sources, selected]);

  const ingest = useCallback(
    async (files: FileList | File[], targetTool?: Tool) => {
      const items = Array.from(files).filter((file) => file.size > 0);
      if (!items.length) return;
      const created: Source[] = await Promise.all(
        items.map(async (file) => {
          const id = uid();
          const previewUrl = URL.createObjectURL(file);
          let width: number | null = null;
          let height: number | null = null;
          try {
            const bitmap = await createImageBitmap(file);
            width = bitmap.width;
            height = bitmap.height;
            bitmap.close();
          } catch {
            /* Keep the original file available and show a placeholder. */
          }
          const base = file.name.replace(/\.[^.]+$/, "");
          return {
            id,
            file,
            previewUrl,
            name: file.name,
            fileSizeBytes: file.size,
            width,
            height,
            metadataDraft: {
              address: "",
              latitude: "",
              longitude: "",
              photoName: base,
              aspectRatio: "Default",
            },
          };
        }),
      );
      if (!mountedRef.current) {
        created.forEach((source) => URL.revokeObjectURL(source.previewUrl));
        return;
      }
      setSources((prev) => [...prev, ...created]);
      setSelected((prev) => prev || created[0]?.id || "");
      if (targetTool) navigate(targetTool);
    },
    [navigate],
  );
  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      const files = Array.from(event.clipboardData?.items || [])
        .map((item) => item.getAsFile())
        .filter((file): file is File => !!file);
      if (files.length) void ingest(files);
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [ingest]);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      sourcesRef.current.forEach((source) => URL.revokeObjectURL(source.previewUrl));
    };
  }, []);
  const removeSource = (id: string) => {
    if (qrReferenceId === id) {
      setQrReferenceId("");
      setQrUseReference(false);
    }
    setSources((prev) => {
      const source = prev.find((item) => item.id === id);
      if (source) URL.revokeObjectURL(source.previewUrl);
      return prev.filter((item) => item.id !== id);
    });
    setSelected((prev) => (prev === id ? sources.find((item) => item.id !== id)?.id || "" : prev));
    setCompareOriginal(false);
    setArtifacts((prev) =>
      Object.fromEntries(Object.entries(prev).filter(([key]) => !key.endsWith(`:${id}`))),
    );
  };
  const updateDraft = (field: keyof Draft, value: string) => {
    if (!selectedSource) return;
    setSources((prev) =>
      prev.map((source) =>
        source.id === selectedSource.id
          ? { ...source, metadataDraft: { ...source.metadataDraft, [field]: value } }
          : source,
      ),
    );
  };
  const updateArtifact = (t: Tool, id: string, artifact: Artifact) =>
    setArtifacts((prev) => ({ ...prev, [toolKey(t, id)]: artifact }));

  const pollers = useRef(
    new Map<string, { promise: Promise<Job>; subscribers: Set<(job: Job) => void> }>(),
  );
  const pollControllers = useRef(new Map<string, AbortController>());
  useEffect(
    () => () => {
      pollControllers.current.forEach((controller) => controller.abort());
      pollControllers.current.clear();
    },
    [],
  );
  const pendingJobs = useRef(
    new Map<string, { tool: Tool; entries: Array<{ id: string; key: string }> }>(),
  );
  const poll = useCallback((job: Job, onUpdate?: (job: Job) => void): Promise<Job> => {
    const existing = pollers.current.get(job.id);
    if (existing) {
      if (onUpdate) existing.subscribers.add(onUpdate);
      return existing.promise;
    }
    const controller = new AbortController();
    pollControllers.current.set(job.id, controller);
    const subscribers = new Set<(job: Job) => void>();
    if (onUpdate) subscribers.add(onUpdate);
    const polling = (async () => {
      let current = job;
      while (current.status === "queued" || current.status === "running") {
        await new Promise((resolve) => setTimeout(resolve, 1500));
        if (controller.signal.aborted) throw new DOMException("Polling stopped", "AbortError");
        current = await refreshJob(current.status_url, controller.signal);
        subscribers.forEach((subscriber) => subscriber(current));
      }
      return current;
    })();
    pollers.current.set(job.id, { promise: polling, subscribers });
    void polling.then(
      () => {
        pollers.current.delete(job.id);
        pollControllers.current.delete(job.id);
      },
      () => {
        pollers.current.delete(job.id);
        pollControllers.current.delete(job.id);
      },
    );
    return polling;
  }, []);
  const startJob = async (initial: Job, t: Tool, entries: Array<{ id: string; key: string }>) => {
    setBusy(true);
    setMessage("");
    pendingJobs.current.set(initial.id, { tool: t, entries });
    if (entries[0])
      setActiveArtifact({
        job: initial,
        index: 0,
        fingerprint: entries[0].key,
        imageId: entries[0].id,
        tool: t,
      });
    let terminalFailure = false;
    try {
      const publishStatus = (job: Job) => {
        if (mountedRef.current)
          setActiveArtifact((active) => (active?.job.id === job.id ? { ...active, job } : active));
      };
      const completed =
        initial.status === "queued" || initial.status === "running"
          ? await poll(initial, publishStatus)
          : initial;
      if (completed.status === "failed") {
        terminalFailure = true;
        pendingJobs.current.delete(initial.id);
        setActiveArtifact({
          job: completed,
          index: 0,
          fingerprint: entries[0]?.key || "",
          imageId: entries[0]?.id,
          tool: t,
        });
        throw new Error(completed.error || "Processing failed");
      }
      for (const entry of entries) {
        const index = completed.outputs.findIndex((output) => output.client_image_id === entry.id);
        const resolved = index >= 0 ? index : entries.length === 1 ? 0 : -1;
        if (resolved >= 0 && sourcesRef.current.some((source) => source.id === entry.id))
          updateArtifact(t, entry.id, {
            job: completed,
            index: resolved,
            fingerprint: entry.key,
            imageId: entry.id,
            tool: t,
          });
      }
      pendingJobs.current.delete(initial.id);
      setActiveArtifact(null);
      setRecoveryJobs((previous) => {
        const next = { ...previous };
        delete next[initial.id];
        return next;
      });
      setMessage(
        `Generated ${completed.outputs.length} image${completed.outputs.length === 1 ? "" : "s"}.`,
      );
    } catch (error) {
      if (mountedRef.current) {
        const detail =
          error instanceof Error ? error.message : "Unable to check processing status.";
        if (!terminalFailure) {
          setRecoveryJobs((previous) => ({ ...previous, [initial.id]: { job: initial, tool: t } }));
          setMessage(`${detail} Job: ${initial.id}`);
        } else setMessage(detail);
      }
    } finally {
      if (mountedRef.current) setBusy(false);
    }
  };
  const metaFingerprint = (source: Source) => fingerprint(source.id, source.metadataDraft);
  const generateMetadata = async (all: boolean) => {
    const chosen = all ? sources : selectedSource ? [selectedSource] : [];
    if (!chosen.length) return;
    setBusy(true);
    setMessage("");
    const snapshots = chosen.map((source) => ({
      source,
      settings: { ...source.metadataDraft, clientImageId: source.id },
      key: metaFingerprint(source),
    }));
    try {
      let job: Job;
      if (all) {
        job = await submitMetadataBatch(
          snapshots.map(({ source }) => source.file),
          { images: snapshots.map(({ settings }) => metadataPayload(settings)) },
        );
      } else {
        const { source, settings } = snapshots[0];
        job = await submitMetadataImage(source.file, metadataPayload(settings));
      }
      await startJob(
        job,
        "metadata",
        snapshots.map(({ source, key }) => ({ id: source.id, key })),
      );
    } catch (error) {
      setBusy(false);
      setMessage(error instanceof Error ? error.message : "Metadata generation failed.");
    }
  };
  const generateBorder = async (all: boolean) => {
    const chosen = all ? sources : selectedSource ? [selectedSource] : [];
    if (!chosen.length) return;
    setBusy(true);
    setMessage("");
    const key = fingerprint(tool, { borderSize, borderRatio });
    try {
      const job = await submitBorderBatch(
        chosen.map((source) => source.file),
        { clientImageIds: chosen.map((source) => source.id), borderSize, aspectRatio: borderRatio },
      );
      await startJob(
        job,
        "border",
        chosen.map((source) => ({
          id: source.id,
          key: fingerprint(source.id, { borderSize, borderRatio }),
        })),
      );
    } catch (error) {
      setBusy(false);
      setMessage(error instanceof Error ? error.message : "Border generation failed.");
    }
  };
  const generatePalette = async () => {
    if (!selectedSource) return;
    setBusy(true);
    setMessage("");
    const source = selectedSource;
    const key = fingerprint(source.id, { paletteCount });
    try {
      const job = await submitPalette(source.file, paletteCount, source.id);
      if (sourcesRef.current.some((item) => item.id === source.id))
        updateArtifact("palette", source.id, {
          job,
          index: 0,
          fingerprint: key,
          imageId: source.id,
          tool: "palette",
        });
      setBusy(false);
      setMessage("Palette generated from the original image.");
    } catch (error) {
      setBusy(false);
      setMessage(error instanceof Error ? error.message : "Palette extraction failed.");
    }
  };
  const qrSettingsKey = fingerprint("qr", {
    url: qrUrl,
    useReference: qrUseReference,
    referenceId: qrReferenceId,
    format: qrFormat,
    transparent: qrTransparent,
  });
  const qrStale = !!qrResult && qrResultKey !== qrSettingsKey;
  const generateQr = async (applyColors = false) => {
    setBusy(true);
    setMessage("");
    const requestKey = qrSettingsKey;
    const requestUrl = qrUrl;
    const requestFormat = qrFormat;
    const requestTransparent = qrTransparent;
    const requestReferenceId = qrReferenceId;
    const requestUseReference = qrUseReference;
    const requestColors = { ...qrColors };
    const form = new FormData();
    form.append("url", requestUrl);
    form.append("format", requestFormat.toLowerCase());
    form.append("transparent_background", String(requestTransparent));
    if (!applyColors && requestUseReference && requestReferenceId) {
      const ref = sources.find((item) => item.id === requestReferenceId);
      if (ref) form.append("reference_image", ref.file);
    }
    if (applyColors) {
      form.append("foreground", qrColors.foreground);
      form.append("background", qrColors.background);
    }
    try {
      const data = await requestQrCode(form);
      setQrResult(data);
      setQrResultKey(requestKey);
      const colorsChanged =
        qrColors.foreground !== requestColors.foreground ||
        qrColors.background !== requestColors.background;
      if (!colorsChanged) setQrColors({ foreground: data.foreground, background: data.background });
      if (!applyColors)
        setQrInitialColors({ foreground: data.foreground, background: data.background });
      setQrDirty(colorsChanged);
      setBusy(false);
    } catch (error) {
      setBusy(false);
      setMessage(error instanceof Error ? error.message : "QR generation failed.");
    }
  };
  const retryJob = async (jobId: string) => {
    const recovery = recoveryJobs[jobId];
    if (!recovery || busy) return;
    setBusy(true);
    setMessage("");
    try {
      const latest = await refreshJob(recovery.job.status_url);
      const result =
        latest.status === "queued" || latest.status === "running"
          ? await poll(latest, (job) => {
              if (mountedRef.current)
                setRecoveryJobs((previous) =>
                  previous[jobId]
                    ? { ...previous, [jobId]: { ...previous[jobId], job } }
                    : previous,
                );
            })
          : latest;
      if (result.status === "failed") {
        pendingJobs.current.delete(result.id);
        setActiveArtifact((active) =>
          active?.job.id === result.id ? { ...active, job: result } : active,
        );
        setRecoveryJobs((previous) => {
          const next = { ...previous };
          delete next[jobId];
          return next;
        });
        throw new Error(result.error || "Processing failed");
      }
      const pending = pendingJobs.current.get(result.id);
      if (pending) {
        for (const entry of pending.entries) {
          const outputIndex = result.outputs.findIndex(
            (output) => output.client_image_id === entry.id,
          );
          const index = outputIndex >= 0 ? outputIndex : pending.entries.length === 1 ? 0 : -1;
          if (index >= 0 && sourcesRef.current.some((source) => source.id === entry.id))
            updateArtifact(pending.tool, entry.id, {
              job: result,
              index,
              fingerprint: entry.key,
              imageId: entry.id,
              tool: pending.tool,
            });
        }
        pendingJobs.current.delete(result.id);
      }
      setRecoveryJobs((previous) => {
        const next = { ...previous };
        delete next[jobId];
        return next;
      });
      setActiveArtifact((active) => (active?.job.id === result.id ? null : active));
      setMessage("Status updated. Outputs are ready.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Status check failed.");
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    const match = pathname.match(/^\/results\/([^/]+)$/);
    if (!match) return;
    let live = true;
    let hasLoadedJob = false;
    setSavedLoading(true);
    setSavedError("");
    setSavedPollingError("");
    setSavedJob(null);
    const load = async () => {
      try {
        const job = await getJob(match[1]);
        if (!live) return;
        hasLoadedJob = true;
        setSavedJob(job);
        setSavedIndex(0);
        setSavedLoading(false);
        if (job.status === "queued" || job.status === "running") {
          const terminal = await poll(job, (status) => {
            if (live) setSavedJob(status);
          });
          if (live) {
            setSavedJob(terminal);
            setSavedPollingError("");
          }
        }
      } catch (error) {
        if (!live) return;
        const detail = error instanceof Error ? error.message : "Unable to load this job.";
        if (hasLoadedJob) setSavedPollingError(detail);
        else setSavedError(detail);
        setSavedLoading(false);
      }
    };
    void load();
    return () => {
      live = false;
    };
  }, [pathname, poll, statusRetry]);
  useEffect(() => {
    if (!imageFor3d) {
      setPrintCanvas(null);
      return;
    }
    let alive = true;
    const image = new Image();
    image.onload = () => {
      if (!alive) return;
      const canvas = document.createElement("canvas");
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      canvas.getContext("2d")?.drawImage(image, 0, 0);
      setPrintCanvas(canvas);
    };
    image.onerror = () => setPrintCanvas(null);
    image.src = imageFor3d;
    return () => {
      alive = false;
    };
  }, [imageFor3d]);

  const navigateTool = (next: Tool) => navigate(next);
  const saveBlob = (url: string, filename?: string) => {
    const anchor = document.createElement("a");
    anchor.href = url;
    if (filename) anchor.download = filename;
    anchor.click();
  };
  const isResults = pathname.startsWith("/results/");
  const currentJob = isResults
    ? savedJob
    : activeArtifact?.tool === tool
      ? activeArtifact.job
      : selectedArtifact?.job;
  const currentPreview =
    (isResults ? savedJob?.preview_urls[savedIndex] : "") ||
    (tool === "qrcode"
      ? qrResult?.image_data_url || ""
      : compareOriginal && selectedSource
        ? selectedSource.previewUrl
        : shownUrl);
  const artifactIsStale = (artifact: Artifact) => {
    const source = sources.find((item) => item.id === artifact.imageId);
    if (!source) return false;
    const expected =
      artifact.tool === "metadata"
        ? metaFingerprint(source)
        : artifact.tool === "border"
          ? fingerprint(source.id, { borderSize, borderRatio })
          : artifact.tool === "palette"
            ? fingerprint(source.id, { paletteCount })
            : artifact.fingerprint;
    return artifact.fingerprint !== expected;
  };
  const isStale = !!selectedArtifact && artifactIsStale(selectedArtifact);
  const jobHasStaleOutputs =
    !!currentJob &&
    currentJob.outputs.some((output) => {
      const id = output.client_image_id;
      if (!id) return false;
      const outputArtifact = Object.values(artifacts).find(
        (artifact) => artifact.job.id === currentJob.id && artifact.imageId === id,
      );
      return !!outputArtifact && artifactIsStale(outputArtifact);
    });
  const uploadClick = () => fileInput.current?.click();
  const dropHandler = (event: React.DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
    void ingest(event.dataTransfer.files);
  };

  const resetMetadata = () => {
    if (!selectedSource) return;
    const photoName = selectedSource.name.replace(/\.[^.]+$/, "");
    setSources((previous) =>
      previous.map((source) =>
        source.id === selectedSource.id
          ? {
              ...source,
              metadataDraft: {
                address: "",
                latitude: "",
                longitude: "",
                photoName,
                aspectRatio: "Default",
              },
            }
          : source,
      ),
    );
  };
  const resetQr = () => {
    setQrUrl("");
    setQrFormat("PNG");
    setQrTransparent(false);
    setQrUseReference(false);
    setQrReferenceId("");
    setQrColors(qrInitialColors);
    setQrDirty(
      !!qrResult &&
        (qrResult.foreground !== qrInitialColors.foreground ||
          qrResult.background !== qrInitialColors.background),
    );
  };

  return (
    <div
      className={`${dark ? "dark " : ""}min-h-screen bg-[var(--bg-canvas)] text-[var(--fg-primary)]`}
      onDragOver={(e) => e.preventDefault()}
      onDrop={dropHandler}
    >
      <input
        ref={fileInput}
        className="hidden"
        type="file"
        accept="image/*"
        multiple
        onChange={(e) => {
          if (e.target.files) void ingest(e.target.files);
          e.currentTarget.value = "";
        }}
      />
      <header className="sticky top-0 z-30 border-b border-[var(--border-subtle)] bg-[var(--bg-glass)] backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1500px] items-center justify-between px-4 py-3 md:px-8">
          <button
            data-testid="brand-home"
            className="flex items-center gap-2 font-display text-lg font-extrabold"
            onClick={() => navigateTool("home")}
          >
            <span className="grid h-8 w-8 place-items-center rounded-xl bg-[var(--accent-primary)] text-[var(--fg-on-accent)]">
              <FileImage size={17} />
            </span>
            Image Toolkit
          </button>
          <nav className="hidden gap-1 md:flex">
            {(["home", "metadata", "border", "palette", "qrcode"] as Tool[]).map((item) => (
              <button
                key={item}
                onClick={() => navigateTool(item)}
                className={`rounded-xl px-3 py-2 text-sm transition ${tool === item ? "bg-[var(--bg-subtle)] font-semibold" : "text-[var(--fg-secondary)] hover:bg-[var(--bg-subtle)]"}`}
              >
                {labels[item]}
              </button>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            <button onClick={uploadClick} className="btn-primary">
              <Upload size={16} /> <span className="hidden sm:inline">Upload</span>
            </button>
            <button
              data-testid="theme-toggle"
              aria-label="Toggle dark mode"
              className="icon-button"
              onClick={() => setDark(!dark)}
            >
              {dark ? <Sun size={18} /> : <Moon size={18} />}
            </button>
          </div>
        </div>
      </header>
      {tool === "home" && !isResults ? (
        <main className="relative mx-auto flex min-h-[calc(100vh-120px)] w-full max-w-5xl flex-col justify-center px-4 py-10 sm:px-6">
          <div className="pointer-events-none fixed inset-0 z-0">
            <ThreeHeroCanvas palette={[]} isDark={dark} />
          </div>
          <div className="relative z-10 space-y-10">
            <div className="mx-auto max-w-xl space-y-3 text-center">
              <h1 className="font-display text-4xl font-extrabold text-[var(--fg-primary)] sm:text-5xl">
                Image Processing Toolkit
              </h1>
              <p className="text-sm text-[var(--fg-secondary)] sm:text-base">
                Choose a tool below, or drop photos directly onto any card.
              </p>
            </div>
            <div className="mx-auto grid max-w-4xl grid-cols-1 gap-5 sm:grid-cols-2">
              {(["metadata", "border", "palette", "qrcode"] as Tool[]).map((item, index) => (
                <button
                  type="button"
                  key={item}
                  data-testid={`tool-card-${item}`}
                  onClick={() => navigateTool(item)}
                  onDragOver={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    setDragTarget(item);
                  }}
                  onDragLeave={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    setDragTarget(null);
                  }}
                  onDrop={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    setDragTarget(null);
                    if (event.dataTransfer.files.length)
                      void ingest(event.dataTransfer.files, item);
                  }}
                  className={`toolkit-tile group flex min-h-56 flex-col justify-between rounded-2xl p-6 text-left sm:p-7 ${dragTarget === item ? "ring-2 ring-[var(--accent-brand)]" : ""}`}
                >
                  <div className="space-y-5">
                    <div className="flex items-center justify-between">
                      <span className="grid h-11 w-11 place-items-center rounded-xl bg-[var(--bg-subtle)] text-[var(--fg-primary)] transition group-hover:bg-[var(--accent-primary)] group-hover:text-[var(--fg-on-accent)]">
                        {
                          [
                            <FileImage size={20} />,
                            <FolderOpen size={20} />,
                            <Palette size={20} />,
                            <ImagePlus size={20} />,
                          ][index]
                        }
                      </span>
                      <span className="text-xs font-mono text-[var(--fg-muted)]">
                        {["EXIF · GPS", "1:1 · 4:5 · 16:9", "1–32 COLORS", "URL · COLOR"][index]}
                      </span>
                    </div>
                    <div>
                      <h2 className="text-lg font-semibold tracking-tight">{labels[item]}</h2>
                      <p className="mt-1.5 text-sm leading-relaxed text-[var(--fg-secondary)]">
                        {
                          [
                            "Compose location and photo details onto your image.",
                            "Add a white print border at your chosen ratio.",
                            "Extract backend-matched swatches and frequencies.",
                            "Create a downloadable QR code from a URL.",
                          ][index]
                        }
                      </p>
                    </div>
                  </div>
                  <div className="mt-7 flex items-center justify-between border-t border-[var(--border-subtle)] pt-4 text-xs font-medium">
                    <span>{sources.length ? "Open tool or drop files" : "Open tool"}</span>
                    <ArrowRight
                      size={16}
                      className="text-[var(--fg-muted)] transition group-hover:translate-x-1 group-hover:text-[var(--fg-primary)]"
                    />
                  </div>
                </button>
              ))}
            </div>
            <p className="text-center text-xs text-[var(--fg-muted)]">
              Your workspace starts empty. Uploads stay in this browser session.
            </p>
          </div>
        </main>
      ) : (
        <main className="mx-auto grid max-w-[1500px] gap-5 px-4 py-6 md:grid-cols-[minmax(0,1fr)_360px] md:px-8">
          <section className="min-w-0 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <button
                  className="mb-2 flex items-center gap-1 text-sm text-[var(--fg-secondary)]"
                  onClick={() => navigateTool("home")}
                >
                  <ArrowLeft size={15} /> Workspace
                </button>
                <h1 className="font-display text-3xl font-extrabold">
                  {isResults ? "Saved job" : labels[tool]}
                </h1>
                <p className="mt-1 text-sm text-[var(--fg-secondary)]">
                  {isResults
                    ? "Generated outputs saved by the processing service."
                    : "Original files stay in your workspace until you remove them."}
                </p>
              </div>
              {!isResults && tool !== "qrcode" && (
                <button className="btn-secondary" onClick={uploadClick}>
                  <ImagePlus size={16} /> Add images
                </button>
              )}
            </div>
            {!isResults && (
              <IntakeDropDock
                images={sources}
                selectedId={selected}
                onSelect={(id) => {
                  setSelected(id);
                  setCompareOriginal(false);
                }}
                onFilesAdded={(files) => void ingest(files)}
                onRemoveImage={removeSource}
              />
            )}
            <div
              className="preview-panel"
              onDrop={dropHandler}
              onDragOver={(e) => e.preventDefault()}
            >
              {isResults && savedLoading ? (
                <div className="placeholder">
                  <span className="animate-pulse">Loading saved job…</span>
                </div>
              ) : isResults && savedError ? (
                <div className="placeholder">
                  <span>Unable to load this saved job.</span>
                  <small>{savedError}</small>
                  <button
                    className="btn-secondary mt-2"
                    onClick={() => setStatusRetry((value) => value + 1)}
                  >
                    Retry status
                  </button>
                </div>
              ) : isResults && savedJob?.status === "failed" && !savedJob.outputs.length ? (
                <div className="placeholder">
                  <span>This job failed.</span>
                  <small>
                    {savedJob.error || "The processing service could not create an output."}
                  </small>
                </div>
              ) : isResults && savedJob && !savedJob.outputs.length ? (
                <div className="placeholder">
                  <span>This job has no generated images.</span>
                </div>
              ) : currentPreview ? (
                <img
                  className="max-h-[65vh] max-w-full rounded-xl object-contain shadow-lg"
                  src={currentPreview}
                  alt={
                    tool === "qrcode"
                      ? "Generated QR code"
                      : compareOriginal
                        ? "Original image"
                        : "Backend generated preview"
                  }
                />
              ) : selectedSource?.width && tool !== "qrcode" ? (
                <img
                  className="max-h-[65vh] max-w-full rounded-xl object-contain"
                  src={selectedSource.previewUrl}
                  alt={selectedSource.name}
                />
              ) : selectedSource && tool !== "qrcode" ? (
                <div className="placeholder">
                  <FileImage size={42} />
                  <span>Preview unavailable for this format</span>
                  <small>The original file can still be submitted for processing.</small>
                </div>
              ) : (
                <div className="placeholder">
                  <Upload size={42} />
                  <span>
                    {tool === "qrcode"
                      ? "Generate a QR code to preview it here"
                      : "Drop images here or upload to begin"}
                  </span>
                  {!isResults && (
                    <button className="btn-primary mt-2" onClick={uploadClick}>
                      Choose files
                    </button>
                  )}
                </div>
              )}
              {selectedSource &&
                !currentPreview &&
                tool !== "home" &&
                tool !== "qrcode" &&
                !isResults && (
                  <div className="absolute bottom-4 rounded-full bg-black/70 px-4 py-2 text-xs text-white">
                    Generate to create a preview
                  </div>
                )}
              <div className="absolute right-4 top-4 flex flex-wrap justify-end gap-2">
                {selectedSource &&
                  selectedArtifact &&
                  selectedArtifact.job.status === "succeeded" && (
                    <button
                      className="btn-secondary bg-[var(--bg-surface)]"
                      onClick={() => setCompareOriginal(!compareOriginal)}
                    >
                      {compareOriginal ? "Show generated" : "Compare original"}
                    </button>
                  )}
                {(currentJob?.status === "succeeded" ||
                  (tool === "qrcode" && !!qrResult && !qrDirty && !qrStale)) && (
                  <button
                    className="icon-button bg-[var(--bg-surface)]"
                    title="3D print view"
                    onClick={() => setPrintMode(true)}
                  >
                    3D
                  </button>
                )}
                {currentJob?.status === "succeeded" && (
                  <button
                    data-testid="job-zip"
                    className="btn-secondary bg-[var(--bg-surface)]"
                    disabled={jobHasStaleOutputs}
                    title={
                      jobHasStaleOutputs
                        ? "Generate current results before downloading this job."
                        : `Download all ${currentJob.outputs.length} outputs from this job`
                    }
                    onClick={() => saveBlob(`/download-all/${currentJob.id}`)}
                  >
                    <Download size={16} /> ZIP · {currentJob.outputs.length}
                  </button>
                )}
              </div>
            </div>
            {message && (
              <div className="notice" role="status">
                {message}
                {isResults && (
                  <button
                    className="ml-3 underline"
                    onClick={() => setStatusRetry((value) => value + 1)}
                  >
                    Retry status
                  </button>
                )}
              </div>
            )}
            {savedPollingError && isResults && (
              <div className="notice" role="status">
                Status checks stopped: {savedPollingError}
                <button
                  className="ml-3 underline"
                  disabled={busy}
                  onClick={() => setStatusRetry((value) => value + 1)}
                >
                  Retry status
                </button>
              </div>
            )}
            {currentJob && (
              <div className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-[var(--fg-secondary)]">
                  <span>
                    Status:{" "}
                    <b className="capitalize text-[var(--fg-primary)]">{currentJob.status}</b>
                    {currentJob.status === "failed" && currentJob.error
                      ? ` · ${currentJob.error}`
                      : ""}
                  </span>
                  {currentJob.status === "succeeded" && (
                    <span>
                      {currentJob.outputs.length} output{currentJob.outputs.length === 1 ? "" : "s"}{" "}
                      ·{" "}
                      <a className="underline" href={currentJob.results_page_url}>
                        Open saved results
                      </a>
                    </span>
                  )}
                </div>
                {(currentJob.status === "queued" || currentJob.status === "running") && (
                  <div
                    className="h-1.5 overflow-hidden rounded-full bg-[var(--bg-subtle)]"
                    aria-label="Processing in progress"
                  >
                    <div className="h-full w-1/3 animate-pulse rounded-full bg-[var(--accent-brand)]" />
                  </div>
                )}
              </div>
            )}
            {tool === "palette" && (selectedArtifact?.job.palette?.length ?? 0) > 0 && !isStale && (
              <div className="card">
                <div className="mb-4 flex items-center justify-between">
                  <h2 className="font-semibold">Extracted colors</h2>
                  <button
                    className="btn-secondary"
                    onClick={() =>
                      navigator.clipboard.writeText(
                        selectedArtifact!.job.palette!.map((c) => c.hex).join("\n"),
                      )
                    }
                  >
                    Copy HEX list
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {selectedArtifact!.job.palette!.map((color) => (
                    <div
                      key={color.hex}
                      className="overflow-hidden rounded-xl border border-[var(--border-subtle)]"
                    >
                      <div className="h-16" style={{ background: color.hex }} />
                      <button
                        className="flex w-full justify-between p-2 text-xs"
                        onClick={() => navigator.clipboard.writeText(color.hex)}
                      >
                        <code>{color.hex}</code>
                        <span>{(color.frequency * 100).toFixed(1)}%</span>
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {tool === "qrcode" && qrResult && (
              <div className="card">
                <h2 className="mb-3 font-semibold">QR result</h2>
                <div className="flex flex-wrap items-center gap-3">
                  <img
                    alt="QR result download preview"
                    src={qrResult.image_data_url}
                    className="h-40 w-40 rounded-lg border border-[var(--border-subtle)] bg-white p-2"
                  />
                  <div className="space-y-2 text-sm">
                    <p>{qrResult.notice || "Generated with backend contrast selection."}</p>
                    {qrResult.warning && <p className="text-amber-600">{qrResult.warning}</p>}
                    <p>Contrast ratio: {qrResult.contrast_ratio}</p>
                    <button
                      data-testid="qr-download"
                      className="btn-primary"
                      disabled={qrDirty || qrStale}
                      onClick={() => saveBlob(qrResult.image_data_url, qrResult.filename)}
                    >
                      <Download size={16} /> Download QR
                    </button>
                  </div>
                </div>
              </div>
            )}
            {printMode && (
              <div className="fixed inset-0 z-50 bg-black/80 p-4">
                <button
                  className="absolute right-5 top-5 z-10 rounded-full bg-white p-3 text-black"
                  onClick={() => setPrintMode(false)}
                >
                  <X />
                </button>
                <ThreeToolInspector
                  mode="print"
                  sourceCanvas={printCanvas}
                  renderVersion={0}
                  palette={[]}
                  pixelCloud={[]}
                  isDark={dark}
                />
              </div>
            )}
          </section>
          <aside className="space-y-4">
            {isResults && savedJob && (
              <div className="card">
                <h2 className="mb-3 font-semibold">Job outputs</h2>
                <div className="space-y-2">
                  {savedJob.outputs.map((output, i) => (
                    <button
                      key={output.output_filename}
                      onClick={() => setSavedIndex(i)}
                      className={`block w-full truncate rounded-lg p-2 text-left text-sm ${i === savedIndex ? "bg-[var(--bg-subtle)] font-semibold" : ""}`}
                    >
                      {output.input_filename}
                    </button>
                  ))}
                </div>
                <div className="mt-4 flex justify-between">
                  <button
                    className="icon-button"
                    onClick={() => setSavedIndex((i) => Math.max(0, i - 1))}
                  >
                    <ArrowLeft size={17} />
                  </button>
                  <span className="self-center text-xs">
                    {savedJob.outputs.length ? savedIndex + 1 : 0} / {savedJob.outputs.length}
                  </span>
                  <button
                    className="icon-button"
                    onClick={() =>
                      setSavedIndex((i) => Math.min(savedJob.outputs.length - 1, i + 1))
                    }
                  >
                    <ArrowRight size={17} />
                  </button>
                </div>
                {savedJob.status === "succeeded" && (
                  <button
                    className="btn-secondary mt-3 w-full"
                    onClick={() =>
                      saveBlob(
                        `/download/${savedJob.id}/${savedJob.outputs[savedIndex]?.output_filename}`,
                      )
                    }
                  >
                    <Download size={16} /> Download image
                  </button>
                )}
              </div>
            )}
            {!isResults && tool === "metadata" && (
              <div className="card space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="font-semibold">Metadata details</h2>
                  <button
                    data-testid="metadata-reset"
                    className="text-sm text-[var(--accent-brand)]"
                    disabled={!selectedSource}
                    onClick={resetMetadata}
                  >
                    Reset
                  </button>
                </div>
                {selectedSource ? (
                  <>
                    <label className="field-label">
                      Photo title
                      <input
                        data-testid="metadata-title"
                        className="field"
                        value={selectedSource.metadataDraft.photoName}
                        onChange={(e) => updateDraft("photoName", e.target.value)}
                      />
                    </label>
                    <label className="field-label">
                      Location
                      <input
                        className="field"
                        placeholder="Address or place name"
                        value={selectedSource.metadataDraft.address}
                        onChange={(e) => updateDraft("address", e.target.value)}
                      />
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <label className="field-label">
                        Latitude
                        <input
                          data-testid="latitude"
                          className="field"
                          value={selectedSource.metadataDraft.latitude}
                          onChange={(e) => updateDraft("latitude", e.target.value)}
                          placeholder="Optional"
                        />
                      </label>
                      <label className="field-label">
                        Longitude
                        <input
                          data-testid="longitude"
                          className="field"
                          value={selectedSource.metadataDraft.longitude}
                          onChange={(e) => updateDraft("longitude", e.target.value)}
                          placeholder="Optional"
                        />
                      </label>
                    </div>
                    <label className="field-label">
                      Print ratio
                      <RatioSelect
                        value={selectedSource.metadataDraft.aspectRatio}
                        onChange={(value) => updateDraft("aspectRatio", value)}
                      />
                    </label>
                    <GenerateActions
                      busy={busy}
                      disabled={!sources.length}
                      one={() => void generateMetadata(false)}
                      all={() => void generateMetadata(true)}
                    />
                  </>
                ) : (
                  <p className="text-sm text-[var(--fg-secondary)]">
                    Add an image to edit metadata settings.
                  </p>
                )}
              </div>
            )}
            {!isResults && tool === "border" && (
              <div className="card space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="font-semibold">White border</h2>
                  <button
                    className="text-sm text-[var(--accent-brand)]"
                    onClick={() => {
                      setBorderSize(10);
                      setBorderRatio("4:5");
                    }}
                  >
                    Reset
                  </button>
                </div>
                <label className="field-label">
                  Border size <span>{borderSize}%</span>
                  <input
                    type="range"
                    min="0"
                    max="50"
                    value={borderSize}
                    onChange={(e) => setBorderSize(Number(e.target.value))}
                  />
                </label>
                <label className="field-label">
                  Aspect ratio
                  <RatioSelect value={borderRatio} onChange={setBorderRatio} />
                </label>
                <GenerateActions
                  busy={busy}
                  disabled={!sources.length}
                  one={() => void generateBorder(false)}
                  all={() => void generateBorder(true)}
                />
              </div>
            )}
            {!isResults && tool === "palette" && (
              <div className="card space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="font-semibold">Palette extraction</h2>
                  <button
                    className="text-sm text-[var(--accent-brand)]"
                    onClick={() => setPaletteCount(7)}
                  >
                    Reset
                  </button>
                </div>
                <label className="field-label">
                  Number of colors: {paletteCount}
                  <input
                    type="range"
                    min="1"
                    max="32"
                    value={paletteCount}
                    onChange={(e) => setPaletteCount(Number(e.target.value))}
                  />
                </label>
                <button
                  disabled={!selectedSource || busy}
                  onClick={() => void generatePalette()}
                  className="btn-primary w-full"
                >
                  <WandIcon busy={busy} /> Generate palette
                </button>
                {selectedArtifact && (
                  <button
                    className="btn-secondary w-full"
                    disabled={isStale || selectedArtifact.job.status !== "succeeded"}
                    onClick={() =>
                      saveBlob(
                        `/download/${selectedArtifact.job.id}/${selectedArtifact.job.outputs[selectedArtifact.index].output_filename}`,
                      )
                    }
                  >
                    <Download size={16} /> Download palette PNG
                  </button>
                )}
              </div>
            )}
            {!isResults && tool === "qrcode" && (
              <div className="card space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="font-semibold">QR code</h2>
                  <button className="text-sm text-[var(--accent-brand)]" onClick={resetQr}>
                    Reset
                  </button>
                </div>
                <label className="field-label">
                  Destination URL
                  <input
                    data-testid="qr-url"
                    className="field"
                    type="url"
                    placeholder="https://example.com"
                    value={qrUrl}
                    onChange={(e) => setQrUrl(e.target.value)}
                  />
                </label>
                <label className="field-label">
                  Reference image
                  <select
                    className="field"
                    value={qrUseReference ? qrReferenceId : ""}
                    onChange={(e) => {
                      setQrReferenceId(e.target.value);
                      setQrUseReference(!!e.target.value);
                    }}
                  >
                    <option value="">No reference (automatic colors)</option>
                    {sources.map((source) => (
                      <option key={source.id} value={source.id}>
                        {source.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field-label">
                  Format
                  <select
                    data-testid="qr-format"
                    className="field"
                    value={qrFormat}
                    onChange={(e) => {
                      const value = e.target.value as "PNG" | "JPEG";
                      setQrFormat(value);
                      if (value === "JPEG") setQrTransparent(false);
                    }}
                  >
                    <option>PNG</option>
                    <option>JPEG</option>
                  </select>
                </label>
                {qrFormat === "PNG" && (
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      data-testid="qr-transparent"
                      type="checkbox"
                      checked={qrTransparent}
                      onChange={(e) => setQrTransparent(e.target.checked)}
                    />{" "}
                    Transparent background
                  </label>
                )}
                <button
                  data-testid="qr-generate"
                  className="btn-primary w-full"
                  disabled={busy || !qrUrl.trim()}
                  onClick={() => void generateQr(false)}
                >
                  <WandIcon busy={busy} /> Generate QR
                </button>
                {qrResult && (
                  <>
                    {qrStale && (
                      <p className="text-xs text-amber-600">
                        QR settings changed — Generate again to refresh the result.
                      </p>
                    )}
                    <div className="grid grid-cols-2 gap-2">
                      <label className="field-label">
                        Foreground
                        <input
                          data-testid="qr-foreground"
                          type="color"
                          className="field h-10 p-1"
                          value={qrColors.foreground}
                          disabled={qrStale || busy}
                          onChange={(e) => {
                            setQrColors({ ...qrColors, foreground: e.target.value });
                            setQrDirty(true);
                          }}
                        />
                      </label>
                      <label className="field-label">
                        Background
                        <input
                          data-testid="qr-background"
                          type="color"
                          className="field h-10 p-1"
                          value={qrColors.background}
                          disabled={qrStale || busy}
                          onChange={(e) => {
                            setQrColors({ ...qrColors, background: e.target.value });
                            setQrDirty(true);
                          }}
                        />
                      </label>
                    </div>
                    <button
                      data-testid="qr-apply-colors"
                      className="btn-primary w-full"
                      disabled={!qrDirty || busy || qrStale}
                      onClick={() => void generateQr(true)}
                    >
                      <Check size={16} /> Apply colors
                    </button>
                    <button
                      data-testid="qr-reset-colors"
                      className="btn-secondary w-full"
                      disabled={qrStale}
                      onClick={() => {
                        setQrColors(qrInitialColors);
                        setQrDirty(
                          !!qrResult &&
                            (qrResult.foreground !== qrInitialColors.foreground ||
                              qrResult.background !== qrInitialColors.background),
                        );
                      }}
                    >
                      Reset colors
                    </button>
                  </>
                )}
              </div>
            )}
            {selectedArtifact && ["metadata", "border"].includes(tool) && (
              <div className="card">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold">Generated result</span>
                  {isStale ? (
                    <span className="text-xs text-amber-600">
                      Settings changed — Generate to update
                    </span>
                  ) : (
                    <Check size={16} />
                  )}
                </div>
                <button
                  data-testid="generated-download"
                  className="btn-secondary mt-3 w-full"
                  disabled={isStale || selectedArtifact.job.status !== "succeeded"}
                  onClick={() =>
                    saveBlob(
                      `/download/${selectedArtifact.job.id}/${selectedArtifact.job.outputs[selectedArtifact.index]?.output_filename}`,
                    )
                  }
                >
                  <Download size={16} /> Download image
                </button>
              </div>
            )}
            {isStale && (
              <div className="notice">
                Settings changed — Generate to update. Previous preview is retained.
              </div>
            )}
          </aside>
        </main>
      )}
      {Object.entries(recoveryJobs).map(([jobId, recovery]) => (
        <div
          key={jobId}
          className="mx-auto flex max-w-[1500px] flex-wrap items-center justify-between gap-2 px-4 pb-2 text-sm text-[var(--fg-secondary)]"
        >
          <span className="notice flex-1">
            Status check stopped for {recovery.tool} job {jobId}.
          </span>
          <button className="btn-secondary" disabled={busy} onClick={() => void retryJob(jobId)}>
            Retry status
          </button>
        </div>
      ))}
      <footer className="mx-auto flex max-w-[1500px] items-center justify-between px-4 py-5 text-xs text-[var(--fg-muted)] md:px-8">
        <span>Image Processing Toolkit</span>
        <button className="flex items-center gap-1" onClick={() => navigateTool("home")}>
          <Home size={13} /> Home
        </button>
      </footer>
    </div>
  );
}
