import { OpenAPIHono } from "@hono/zod-openapi";
import { healthResponseSchema, healthRoute, type ErrorResponse } from "@scrapbook/api-contract";

type ApiBindings = {
  Variables: {
    requestId: string;
  };
};

const packageVersion = "0.0.0-development";

export const createApp = () => {
  const app = new OpenAPIHono<ApiBindings>();

  app.use("*", async (context, next) => {
    const requestId = context.req.header("x-request-id") ?? crypto.randomUUID();

    context.set("requestId", requestId);
    await next();
    context.header("x-request-id", requestId);
  });

  app.openapi(healthRoute, (context) => {
    const body = healthResponseSchema.parse({
      status: "ok",
      service: "scrapbook-api",
      version: packageVersion,
      timestamp: new Date().toISOString(),
    });

    return context.json(body, 200);
  });

  app.doc("/api/v1/openapi.json", {
    openapi: "3.1.0",
    info: {
      title: "Scrapbook API",
      version: packageVersion,
    },
  });

  app.notFound((context) => {
    const body: ErrorResponse = {
      error: {
        code: "not_found",
        message: "Route not found",
        requestId: context.get("requestId"),
      },
    };

    return context.json(body, 404);
  });

  app.onError((error, context) => {
    console.error(error);

    const body: ErrorResponse = {
      error: {
        code: "internal_error",
        message: "Unexpected server error",
        requestId: context.get("requestId"),
      },
    };

    return context.json(body, 500);
  });

  return app;
};
