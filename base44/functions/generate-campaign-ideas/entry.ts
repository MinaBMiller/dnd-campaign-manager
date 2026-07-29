import { createClientFromRequest } from "npm:@base44/sdk";
import { skipAi } from "../../shared/mock-ai.ts";

/** Lightweight brainstorm helper for the "get ideas from AI" campaign-creation path:
 * a single InvokeLLM call (no tools, no entities created) that returns a handful of
 * premise suggestions for the DM to pick from or use as inspiration for their own. */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const { theme_prompt } = await req.json();

    if (skipAi()) {
      return Response.json({
        ideas: [
          { name: "[MOCK] The Sunken Vault", description: "A test premise standing in for a real AI-generated one." },
          { name: "[MOCK] Ashes of the Old Guard", description: "A test premise standing in for a real AI-generated one." },
        ],
      });
    }

    const response = await base44.integrations.Core.InvokeLLM({
      prompt:
        "Suggest 4 distinct campaign premises for a lightweight, custom-rules tabletop " +
        "campaign (not full D&D 5e — simple HP/AC/stats, basic combat, so keep premises " +
        "grounded in adventure/mystery/combat hooks rather than rules-heavy concepts).\n\n" +
        `DM's theme/preference (may be vague or empty — invent freely if so): ${theme_prompt || "(none given, surprise me)"}\n\n` +
        "Each should be a short, evocative one-line pitch, distinct in tone/setting from the others.",
      response_json_schema: {
        type: "object",
        properties: {
          ideas: {
            type: "array",
            items: {
              type: "object",
              properties: {
                name: { type: "string" },
                description: { type: "string" },
              },
            },
          },
        },
      },
    });

    return Response.json({ ideas: (response as any).ideas ?? [] });
  } catch (error) {
    const status = (error as any).status ?? 500;
    return Response.json({ error: (error as Error).message }, { status });
  }
});
