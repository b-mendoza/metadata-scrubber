interface NamedOptions {
  readonly path: string;
  readonly start: number;
}

export const formatPath = (
  path: string,
  start: number,
  options: { suffix: string; separator: string },
) => `${path}${options.separator}${String(start)}${options.suffix}`;

export const readNamedOptions = (options: NamedOptions) =>
  `${options.path}:${String(options.start)}`;

export const readOptionalOptions = (options: {
  path?: string;
  start?: number;
}) => `${options.path ?? ""}:${String(options.start ?? 0)}`;

export function FileCard({ path, size }: { path: string; size: number }) {
  return `${path}:${String(size)}`;
}

export const Button = function (props: { label: string; disabled: boolean }) {
  return props.disabled ? "" : props.label;
};

export const NamedCard = function renderNamedCard(props: {
  title: string;
  description: string;
}) {
  return `${props.title}:${props.description}`;
};

export const Badge = (props: { label: string; tone: string }) =>
  `${props.tone}:${props.label}`;

export default function DefaultPanel(props: {
  title: string;
  description: string;
}) {
  return `${props.title}:${props.description}`;
}

export const readMostlyOptionalOptions = (options: {
  path: string;
  start?: number;
  suffix?: string;
}) => `${options.path}:${String(options.start ?? 0)}${options.suffix ?? ""}`;
