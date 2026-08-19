export const backendUrl = process.env["BACKEND_URL"];

const region = "us";
const staticProtocol = "https";
const backendBaseUrl = process.env["BACKEND_URL"];
export const createDynamicProtocolUrl = (protocol: string) =>
  `${protocol}://backend.example.com`;
export const dynamicHostNameUrl = `https://api-${region}.example.com/files`;
export const interpolatedProtocolDynamicHostNameUrl = `${staticProtocol}://api-${region}.example.com/files`;
export const dynamicHostUrl = `${backendBaseUrl}/path`;
export const emptyAuthority = "http://";
