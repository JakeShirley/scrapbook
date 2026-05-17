import {
  authSessionResponseSchema,
  errorResponseSchema,
  healthResponseSchema,
  type AuthSessionResponse,
  type HealthResponse,
  type LoginRequest,
  type RegisterRequest,
} from "@scrapbook/api-contract";

export class ApiClientError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
  ) {
    super(message);
    this.name = "ApiClientError";
  }
}

const defaultBaseUrl = import.meta.env.VITE_API_BASE_URL ?? "";

type ResponseSchema<Output> = {
  parse: (value: unknown) => Output;
};

const buildUrl = (baseUrl: string, path: string): string => `${baseUrl}${path}`;

const parseError = async (response: Response): Promise<ApiClientError> => {
  const fallback = new ApiClientError("The API request failed", response.status, "request_failed");

  try {
    const parsed = errorResponseSchema.safeParse(await response.json());

    if (!parsed.success) {
      return fallback;
    }

    return new ApiClientError(parsed.data.error.message, response.status, parsed.data.error.code);
  } catch {
    return fallback;
  }
};

const requestJson = async <Output>(
  baseUrl: string,
  schema: ResponseSchema<Output>,
  path: string,
  init: RequestInit = {},
): Promise<Output> => {
  const response = await fetch(buildUrl(baseUrl, path), {
    credentials: "include",
    ...init,
    headers: {
      ...(init.body ? { "content-type": "application/json" } : {}),
      ...init.headers,
    },
  });

  if (!response.ok) {
    throw await parseError(response);
  }

  return schema.parse(await response.json());
};

export type ApiClient = ReturnType<typeof createApiClient>;

export const createApiClient = (baseUrl = defaultBaseUrl) => ({
  getHealth: (): Promise<HealthResponse> =>
    requestJson(baseUrl, healthResponseSchema, "/api/v1/health"),

  getCurrentSession: (): Promise<AuthSessionResponse> =>
    requestJson(baseUrl, authSessionResponseSchema, "/api/v1/auth/session"),

  login: (input: LoginRequest): Promise<AuthSessionResponse> =>
    requestJson(baseUrl, authSessionResponseSchema, "/api/v1/auth/login", {
      body: JSON.stringify(input),
      method: "POST",
    }),

  logout: async (): Promise<void> => {
    const response = await fetch(buildUrl(baseUrl, "/api/v1/auth/logout"), {
      credentials: "include",
      method: "POST",
    });

    if (!response.ok) {
      throw await parseError(response);
    }
  },

  register: (input: RegisterRequest): Promise<AuthSessionResponse> =>
    requestJson(baseUrl, authSessionResponseSchema, "/api/v1/auth/register", {
      body: JSON.stringify(input),
      method: "POST",
    }),
});

export const apiClient = createApiClient();
