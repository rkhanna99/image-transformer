export type ToolId = 'home' | 'metadata' | 'border' | 'palette' | 'qrcode';

export type AspectRatioOption = 'DEFAULT' | '1:1' | '4:5' | '3:2' | '16:9' | '2:3';

export interface RGBColor {
  r: number;
  g: number;
  b: number;
}

export interface ExtractedColor {
  hex: string;
  rgb: RGBColor;
  hsl: { h: number; s: number; l: number };
  percentage: number;
  name: string;
}

export type MetadataStyle = 'original' | 'card' | 'overlay' | 'film';

export interface MetadataRenderOptions {
  overlayStyle: MetadataStyle;
  themeTone: 'linen-light' | 'slate-dark';
  showGpsCoordinates: boolean;
  showColorStrip: boolean;
}

export interface ImageMetadataFields {
  photoName: string;
  address: string;
  latitude: string;
  longitude: string;
  aspectRatio: AspectRatioOption;
  cameraModel: string;
  lens: string;
  focalLength: string;
  aperture: string;
  shutterSpeed: string;
  iso: string;
  captureDate: string;
  overlayStyle: MetadataStyle;
  showColorStrip: boolean;
  showGpsCoordinates: boolean;
  themeTone: 'linen-light' | 'slate-dark';
}

export interface BorderConfig {
  thicknessPercent: number;
  aspectRatio: AspectRatioOption;
  borderColor: string;
  borderPreset: 'pure-white' | 'warm-linen' | 'alabaster' | 'deep-slate' | 'auto-tint';
  innerKeyline: boolean;
  dropShadow: boolean;
  cornerRadius: number;
  applyToAll: boolean;
}

export interface PaletteConfig {
  kColors: number;
  sortBy: 'dominance' | 'luminance' | 'hue';
  exportLayout: 'tiled-grid' | 'photo-composite' | 'specimen-deck';
  showHexLabels: boolean;
  showPercentages: boolean;
  tileGap: number;
}

export interface QRConfig {
  url: string;
  useReferenceImage: boolean;
  foregroundColor: string;
  eyeColor: string;
  backgroundColor: string;
  moduleStyle: 'square' | 'rounded' | 'dots';
  quietZone: number;
  errorCorrection: 'L' | 'M' | 'Q' | 'H';
  includeCaption: boolean;
  captionText: string;
  includePaletteFooter: boolean;
}

export interface StudioImage {
  id: string;
  name: string;
  src: string;
  width: number;
  height: number;
  fileSizeLabel: string;
  isSample?: boolean;
  metadata: ImageMetadataFields;
  extractedPalette?: ExtractedColor[];
}

/** Source files remain browser-owned until a user explicitly starts processing. */
export interface MetadataDraft extends MetadataRenderOptions {
  address: string;
  latitude: string;
  longitude: string;
  photoName: string;
  /** Default, a print preset, or a custom W:H string. */
  aspectRatio: string;
}

export interface WorkspaceImage {
  id: string;
  file: File;
  previewUrl: string;
  name: string;
  fileSizeBytes: number;
  width: number | null;
  height: number | null;
  metadataDraft: MetadataDraft;
}

export type JobStatus = 'queued' | 'running' | 'succeeded' | 'failed';

export interface JobOutput {
  input_filename: string;
  output_filename: string;
  preview_filename: string;
  client_image_id?: string;
  metadata_options?: MetadataRenderOptions;
}

export interface PaletteSwatch {
  hex: string;
  /** Fraction of sampled visible pixels represented by this cluster. */
  frequency: number;
}

export interface ProcessingJob {
  id: string;
  type: 'metadata' | 'border' | 'palette';
  source: string;
  status: JobStatus;
  total_items: number;
  created_at: string;
  updated_at: string;
  outputs: JobOutput[];
  error: string | null;
  preview_urls: string[];
  image_urls: string[];
  download_filenames: string[];
  results_page_url: string;
  status_url: string;
  palette?: PaletteSwatch[];
}

export interface QrCodeResult {
  image_data_url: string;
  mime_type: string;
  filename: string;
  width: number;
  height: number;
  url: string;
  foreground: string;
  background: string;
  palette: string[];
  color_source: string;
  notice: string | null;
  transparent_background: boolean;
  contrast_ratio: number | null;
  warning: string | null;
}

export interface MetadataSubmission extends MetadataDraft {
  clientImageId: string;
  aspectRatio: string;
  customAspectRatio: string | null;
}

export interface MetadataBatchSubmission {
  images: MetadataSubmission[];
}

export interface BorderSubmission {
  clientImageIds: string[];
  borderSize: number;
  /** The API expects an actual ratio string, including custom ratios. */
  aspectRatio: string;
}
