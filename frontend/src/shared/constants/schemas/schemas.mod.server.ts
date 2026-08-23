import { Schema } from "effect";

interface CreateURLSchemaParameters {
  /** @default /^https$/ */
  protocol?: RegExp;
}

const httpProtocol = /^https?$/;
const explicitHttpURL = /^https?:\/\//i;
const protocolSuffix = /:$/;
const secureHttpProtocol = /^https$/;

const isURLWithProtocol = (value: string, protocolPattern: RegExp) => {
  if (
    protocolPattern.source === httpProtocol.source &&
    !explicitHttpURL.test(value)
  ) {
    return false;
  }

  if (!URL.canParse(value)) {
    return false;
  }

  const urlProtocol = new URL(value).protocol.replace(protocolSuffix, "");

  return protocolPattern.test(urlProtocol);
};

export const createURLSchema = ({
  protocol = secureHttpProtocol,
}: CreateURLSchemaParameters = {}) => {
  const protocolPattern = new RegExp(protocol.source, protocol.flags);

  return Schema.Trim.check(
    Schema.makeFilter(
      (value) => {
        protocolPattern.lastIndex = 0;

        return isURLWithProtocol(value, protocolPattern);
      },
      {
        expected: `a URL with a protocol matching ${protocol}`,
      },
    ),
  );
};
