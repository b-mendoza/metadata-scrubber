export function scrubFile(options: {
  path: string;
  start: number;
  suffix: string;
}) {
  return `${options.path}:${String(options.start)}${options.suffix}`;
}

export const createSlice = function (options: {
  source: string;
  start: number;
}) {
  return options.source.slice(options.start);
};

export const formatSegment = ({
  path,
  start,
}: {
  path: string;
  start: number;
}) => `${path}:${String(start)}`;
