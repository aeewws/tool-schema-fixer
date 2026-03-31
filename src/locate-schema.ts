import { isJsonObject } from "./json.js";
import type { JsonValue, SchemaWrapperKind } from "./types.js";

export interface LocatedSchema {
  schema: JsonValue;
  path: Array<string | number>;
  wrapper: SchemaWrapperKind;
}

export function locateSchemaDocument(document: JsonValue): LocatedSchema {
  if (isJsonObject(document) && isJsonObject(document.function) && "parameters" in document.function) {
    return {
      schema: document.function.parameters,
      path: ["function", "parameters"],
      wrapper: "openai-function"
    };
  }

  if (isJsonObject(document) && "input_schema" in document) {
    return {
      schema: document.input_schema,
      path: ["input_schema"],
      wrapper: "anthropic-tool"
    };
  }

  if (isJsonObject(document) && "parameters" in document) {
    return {
      schema: document.parameters,
      path: ["parameters"],
      wrapper: "tool-parameters"
    };
  }

  return {
    schema: document,
    path: [],
    wrapper: "plain-schema"
  };
}
