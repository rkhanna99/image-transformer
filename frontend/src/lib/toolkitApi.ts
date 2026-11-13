import type { BorderSubmission, MetadataBatchSubmission, MetadataSubmission, ProcessingJob, QrCodeResult } from '../types/toolkit';

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, init);
  const data: unknown = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = data && typeof data === 'object' && 'error' in data && typeof data.error === 'string'
      ? data.error
      : `Request failed (${response.status})`;
    throw new Error(message);
  }
  return data as T;
}

function multipartFile(file: File, field: string, payload: unknown): FormData {
  const form = new FormData();
  form.append(field, file);
  form.append('payload', JSON.stringify(payload));
  return form;
}

export function submitMetadataImage(file: File, payload: MetadataSubmission): Promise<ProcessingJob> {
  return requestJson('/process-image', { method: 'POST', body: multipartFile(file, 'image', payload) });
}

export function submitMetadataBatch(files: File[], payload: MetadataBatchSubmission): Promise<ProcessingJob> {
  const form = new FormData();
  files.forEach((file) => form.append('images', file));
  form.append('payload', JSON.stringify(payload));
  return requestJson('/process-images', { method: 'POST', body: form });
}

export function submitBorderBatch(files: File[], payload: BorderSubmission): Promise<ProcessingJob> {
  const form = new FormData();
  files.forEach((file) => form.append('images', file));
  form.append('payload', JSON.stringify(payload));
  return requestJson('/white-border', { method: 'POST', body: form });
}

export function submitPalette(file: File, colorCount: number, clientImageId: string): Promise<ProcessingJob> {
  const form = new FormData();
  form.append('image', file);
  form.append('num_colors', String(colorCount));
  form.append('clientImageId', clientImageId);
  return requestJson('/api/palette', { method: 'POST', body: form });
}

export function requestQrCode(form: FormData): Promise<QrCodeResult> {
  return requestJson('/api/qr-code', { method: 'POST', body: form });
}

export function getJob(jobId: string): Promise<ProcessingJob> {
  return requestJson(`/api/jobs/${encodeURIComponent(jobId)}`);
}

export function refreshJob(statusUrl: string, signal?: AbortSignal): Promise<ProcessingJob> {
  return requestJson(statusUrl, { signal });
}
