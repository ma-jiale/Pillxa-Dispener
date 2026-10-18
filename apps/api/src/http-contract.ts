import type { FastifyInstance } from "fastify";
import contract from "../../../packages/contracts/generated/openapi.json" with { type: "json" };
// One public contract supplies request validation and both clients' transport types.
export function registerContract(app: FastifyInstance) {
  const rewrite = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(rewrite);
    if (value && typeof value === "object")
      return Object.fromEntries(
        Object.entries(value).map(([key, v]) => [
          key,
          key === "$ref" && typeof v === "string"
            ? v.replace("#/components/schemas/", "pillxa#/definitions/")
            : rewrite(v),
        ]),
      );
    return value;
  };
  app.addSchema({
    $id: "pillxa",
    definitions: rewrite(contract.components.schemas),
  });
  app.addHook("onRoute", (route) => {
    const path = route.url.replace(/:([^/]+)/g, "{$1}");
    const method = String(route.method).toLowerCase();
    const operation = (contract.paths as Record<string, any>)[path]?.[method];
    const body = operation?.requestBody?.content?.["application/json"]?.schema;
    if (body)
      route.schema = {
        ...route.schema,
        body: rewrite(body) as Record<string, unknown>,
      };
    const queryParameters =
      operation?.parameters
        ?.map((p: any) =>
          p.$ref
            ? (contract.components.parameters as Record<string, unknown>)[
                p.$ref.split("/").at(-1)
              ]
            : p,
        )
        .filter((p: any) => p?.in === "query") ?? [];
    if (queryParameters.length)
      route.schema = {
        ...route.schema,
        querystring: {
          type: "object",
          additionalProperties: false,
          properties: Object.fromEntries(
            queryParameters.map((p: any) => [p.name, rewrite(p.schema)]),
          ),
          required: queryParameters
            .filter((p: any) => p.required)
            .map((p: any) => p.name),
        },
      };
  });
}
