import { createApp } from "./app.js";

const app = createApp();
const response = await app.request("/api/v1/openapi.json");

if (!response.ok) {
  throw new Error(`OpenAPI document returned ${response.status}`);
}

console.log(JSON.stringify(await response.json(), null, 2));
