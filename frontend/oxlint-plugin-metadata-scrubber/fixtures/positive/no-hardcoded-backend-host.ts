const region = "us";
const staticProtocol = "https";
const backendBaseUrl = process.env["BACKEND_URL"];
export const createAssertedDynamicProtocolUrl = (protocol: string) =>
  `${protocol as string}://backend.example.com`;
export const dynamicHostNameUrl = `https://api-${region}.example.com/files`;
export const interpolatedProtocolDynamicHostNameUrl = `${staticProtocol}://api-${region}.example.com/files`;
export const dynamicHostUrl = `${backendBaseUrl}/path`;
export const emptyAuthority = "http://";
