export const backendUrl = process.env["BACKEND_URL"];

const protocol = "https";
const region = "us";
const backendBaseUrl = process.env["BACKEND_URL"];
export const dynamicBackendUrl = `${protocol}://backend.example.com`;
export const dynamicHostNameUrl = `https://api-${region}.example.com/files`;
export const dynamicHostUrl = `${backendBaseUrl}/path`;
export const emptyAuthority = "http://";
