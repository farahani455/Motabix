export type JsonSchema = {
  type: "object";
  properties: Record<string, unknown>;
  required?: string[];
};

export type ResponseFormat = {
  type: "json_schema";
  json_schema: {
    name: string;
    schema: JsonSchema;
  };
};