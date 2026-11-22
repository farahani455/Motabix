import { ResponseFormat } from "./response-format-type";
import { isAskMode } from "../utils/isAskMode";

export function getResponseFormat(agent: string): ResponseFormat |undefined{
  // Ask: plain chat, no JSON schema / tools
  if (isAskMode(agent)) {
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
