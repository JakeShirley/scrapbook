import {
  type AssetListResponse,
  type AssetResponse,
  type AuthSessionResponse,
  assetListResponseSchema,
  assetResponseSchema,
  authSessionResponseSchema,
  errorResponseSchema,
  type HealthResponse,
  healthResponseSchema,
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

const parseErrorPayload = (payload: unknown, status: number): ApiClientError => {
  const parsed = errorResponseSchema.safeParse(payload);

  if (!parsed.success) {
    return new ApiClientError("The API request failed", status, "request_failed");
  }

  return new ApiClientError(parsed.data.error.message, status, parsed.data.error.code);
};

const parseError = async (response: Response): Promise<ApiClientError> => {
  try {
    return parseErrorPayload(await response.json(), response.status);
  } catch {
    return new ApiClientError("The API request failed", response.status, "request_failed");
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

  listAssets: (): Promise<AssetListResponse> =>
    requestJson(baseUrl, assetListResponseSchema, "/api/v1/assets"),

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

  uploadAsset: (
    file: File,
    onProgress?: (progress: number | null) => void,
  ): Promise<AssetResponse> =>
    new Promise((resolve, reject) => {
      const request = new XMLHttpRequest();
      const form = new FormData();

      form.append("file", file);
      request.open("POST", buildUrl(baseUrl, "/api/v1/assets/uploads"));
      request.withCredentials = true;

      request.upload.onprogress = (event) => {
        onProgress?.(event.lengthComputable ? event.loaded / event.total : null);
      };
      request.onerror = () => {
        reject(new ApiClientError("The API request failed", 0, "network_error"));
      };
      request.onload = () => {
        if (request.status < 200 || request.status >= 300) {
          try {
            reject(parseErrorPayload(JSON.parse(request.responseText), request.status));
          } catch {
            reject(new ApiClientError("The API request failed", request.status, "request_failed"));
          }
          return;
        }

        try {
          onProgress?.(1);
          resolve(assetResponseSchema.parse(JSON.parse(request.responseText)));
        } catch (error) {
          reject(error);
        }
      };
      request.send(form);
    }),
});

export const apiClient = createApiClient();
