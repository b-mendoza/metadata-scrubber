const path = "metadata";
const protocol = "https";
const protocolWithColon = "https:";
const assertedProtocol = "https" as const;

export const backendUrl = "https://backend.example.com";
export const templateBackendUrl = `http://template.example.com`;
export const rawTemplateBackendUrl = String.raw`http://localhost:8787/\unicode`;
export const paymentServiceUrl = "https://payments.example.com";
export const backendPathUrl = `http://localhost:8787/${path}`;
export const mixedCaseServiceUrl = "HTTP://service.example/path";
export const interpolatedProtocolBackendUrl = `${protocol}://backend.example.com`;
export const directProtocolBackendUrl = `${"http"}://backend.example.com`;
export const assertedProtocolBackendUrl = `${assertedProtocol}://backend.example.com`;
export const colonProtocolBackendUrl = `${protocolWithColon}//backend.example.com/api`;
