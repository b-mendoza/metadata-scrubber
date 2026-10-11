import { Container, getContainer } from "@cloudflare/containers";

export class BackendContainer extends Container<Env> {
  defaultPort = 8080;
  envVars: Container<Env>["envVars"] = {
    R2_ACCOUNT_ID: this.env.R2_ACCOUNT_ID,
    R2_ACCESS_KEY_ID: this.env.R2_ACCESS_KEY_ID,
    R2_SECRET_ACCESS_KEY: this.env.R2_SECRET_ACCESS_KEY,
    R2_BUCKET: this.env.R2_BUCKET,
  };
}

export default {
  fetch(request: Request, env: Env): Promise<Response> {
    // shortcut: One instance makes the two-job PDF limit global; add instances when this capacity is too small.
    return getContainer(env.BACKEND_CONTAINER, "backend").fetch(request);
  },
};
