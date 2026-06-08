export function parseAIResponse(raw: string): any {
  // First attempt: direct parse
  try {
    return JSON.parse(raw.trim());
  } catch {
    // Second attempt: extract JSON from markdown or surrounding text
    try {
      const codeBlockMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (codeBlockMatch) {
        return JSON.parse(codeBlockMatch[1].trim());
      }

      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
    } catch {
      throw new Error(`Failed to parse AI response: ${raw.slice(0, 100)}...`);
    }

    throw new Error(`No valid JSON found in AI response: ${raw.slice(0, 100)}...`);
  }
}
