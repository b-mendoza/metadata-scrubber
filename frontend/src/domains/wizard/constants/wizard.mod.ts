import type { FileRoutesByPath } from "@tanstack/react-router";
import type * as z from "zod";

const BYTES_PER_KB = 1_024; // 1KB = 1024 bytes
const KB_PER_MB = 1_024; // 1MB = 1024KB

export const MAX_FILE_SIZE_MB = 10; // 10MB

export const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * KB_PER_MB * BYTES_PER_KB; // 10,485,760 bytes = 10MB * 1024KB * 1024 bytes

/** Signed URL expiration in seconds (30 minutes) */
export const SIGNED_URL_EXPIRATION_TIME = 1_800;

/** Signed URL expiration in milliseconds (30 minutes) */
export const SIGNED_URL_EXPIRATION_MILLIS =
  // oxlint-disable-next-line no-magic-numbers -- 1_000 is the standard seconds-to-milliseconds conversion, so extracting another constant adds noise
  SIGNED_URL_EXPIRATION_TIME * 1_000;

export const UPLOADABLE_MIME_TYPES = {
  JPEG: "image/jpeg",
  PDF: "application/pdf",
  PNG: "image/png",
  WEBP: "image/webp",
} satisfies Record<string, z.util.MimeTypes>;

export type UploadableMimeType =
  (typeof UPLOADABLE_MIME_TYPES)[keyof typeof UPLOADABLE_MIME_TYPES];

/** Number of files the wizard expects users to upload */
export const WIZARD_UPLOAD_FILE_COUNT = 3;

const UPLOAD_STEP_PATH: FileRoutesByPath["/wizard/upload"]["fullPath"] =
  "/wizard/upload";

const CATEGORIZATION_STEP_PATH: FileRoutesByPath["/wizard/categorization"]["fullPath"] =
  "/wizard/categorization";

const ANALYSIS_STEP_PATH: FileRoutesByPath["/wizard/analysis"]["fullPath"] =
  "/wizard/analysis";

/** Union type of all wizard step paths */
export type WizardStepPath =
  | typeof UPLOAD_STEP_PATH
  | typeof CATEGORIZATION_STEP_PATH
  | typeof ANALYSIS_STEP_PATH;

export interface WizardStep {
  label: string;
  path: WizardStepPath;
}

/** Upload step configuration */
const UPLOAD_STEP = {
  label: "Upload",
  path: UPLOAD_STEP_PATH,
} satisfies WizardStep;

/** Categorization step configuration */
const CATEGORIZATION_STEP = {
  label: "Categorize",
  path: CATEGORIZATION_STEP_PATH,
} satisfies WizardStep;

/** Analysis step configuration */
const ANALYSIS_STEP = {
  label: "Analyze",
  path: ANALYSIS_STEP_PATH,
} satisfies WizardStep;

export const WIZARD_STEPS: WizardStep[] = [
  UPLOAD_STEP,
  CATEGORIZATION_STEP,
  ANALYSIS_STEP,
];
