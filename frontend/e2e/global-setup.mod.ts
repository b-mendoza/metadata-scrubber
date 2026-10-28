const TIMEOUT_MS = 5000;

export default async function globalSetup() {
  const services = [
    // eslint-disable-next-line metadata-scrubber/no-hardcoded-backend-host -- Check the frontend port published by Docker Compose.
    ["frontend", "http://localhost:3000/"],
    // eslint-disable-next-line metadata-scrubber/no-hardcoded-backend-host -- Check the backend port published by Docker Compose.
    ["backend", "http://localhost:8080/api/health"],
  ] as const;

  await Promise.all(
    services.map(async ([service, url]) => {
      try {
        const response = await fetch(url, {
          signal: AbortSignal.timeout(TIMEOUT_MS),
        });
        if (!response.ok) {
          throw new Error(`HTTP ${String(response.status)}`);
        }
      } catch (error) {
        throw new Error(
          `The ${service} service is unavailable at ${url}. Start both real services with "docker compose up --build" from the repository root before running the end-to-end tests.`,
          { cause: error },
        );
      }
    }),
  );
}
