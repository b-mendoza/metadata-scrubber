import * as z from "zod";

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

  return z
    .string({
      error: `The URL value must be a string that contains an absolute URL with a protocol that matches ${protocol}. Provide the URL as a string with the required protocol and a valid host.`,
    })
    .trim()
    .refine(
      (value) => {
        protocolPattern.lastIndex = 0;

        return isURLWithProtocol(value, protocolPattern);
      },
      {
        error: `The URL value must be an absolute URL with a protocol that matches ${protocol}. Provide an explicit matching protocol and a valid host.`,
      },
    );
};
