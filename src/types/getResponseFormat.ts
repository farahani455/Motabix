import { ResponseFormat } from "./response-format-type";

export function getResponseFormat(agent: string): ResponseFormat |undefined{
  // برای agent=Ask فقط توضیحات میخوایم
  if (agent === 'Ask') {
    return undefined;
  }else{
        return {
              type: "json_schema",
              json_schema: {
                name: "single_code_response",
                schema: {
                  type: "object",
                  properties: {
                    explanation:      { type: "string" },
                    code:             { type: "string" },
                    language:         { type: "string" },
                    suggestedFilename:{ type: "string" },
                    keyDecisions:     { type: "string" },
                  },
                  required: ["explanation", "code", "language", "suggestedFilename", "keyDecisions"],
                },
              },
            }
            ;
  }
}
