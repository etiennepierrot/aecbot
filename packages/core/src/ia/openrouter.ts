import { z } from "zod";
import type { ModeleIA, RequeteObjet } from "../recherche/modele-ia";

export const URL_OPENROUTER = "https://openrouter.ai/api/v1/chat/completions";
const MAX_JETONS_REPONSE = 1000;
const PAUSE_AVANT_NOUVEL_ESSAI_MS = 300;

const estTemporaire = (status: number) => status === 429 || status >= 500;

export interface OptionsOpenRouter {
  cleApi: string;
  /** Identifiant OpenRouter du modèle, par exemple « anthropic/claude-haiku-5.5 ». */
  modele: string;
  delaiMaxMs?: number;
  url?: string;
  fetch?: typeof fetch;
}

/** Adaptateur `ModeleIA` vers OpenRouter, passerelle unique vers de nombreux fournisseurs. */
export function creerModeleOpenRouter(options: OptionsOpenRouter): ModeleIA {
  const { cleApi, modele, delaiMaxMs = 15_000, url = URL_OPENROUTER, fetch: requeter = fetch } = options;

  return {
    async genererObjet({ instructions, contexte, entree, schema }: RequeteObjet) {
      const { $schema, ...schemaJson } = z.toJSONSchema(schema);
      const signal = AbortSignal.timeout(delaiMaxMs);
      const envoyer = () => requeter(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${cleApi}`,
          "Content-Type": "application/json",
          "X-Title": "AECBot",
        },
        body: JSON.stringify({
          // Seuls les paramètres gérés par le modèle sont acceptés (require_parameters) : pas de `temperature`.
          model: modele,
          // Sans plafond, OpenRouter réserve le maximum du modèle sur le crédit avant l'appel.
          max_tokens: MAX_JETONS_REPONSE,
          messages: [
            { role: "system", content: instructions },
            {
              role: "user",
              content: [
                // OpenRouter traduit ce marqueur pour chaque fournisseur qui gère la mise en cache.
                ...(contexte ? [{ type: "text", text: contexte, cache_control: { type: "ephemeral" } }] : []),
                { type: "text", text: entree },
              ],
            },
          ],
          response_format: {
            type: "json_schema",
            json_schema: { name: "reponse", strict: true, schema: schemaJson },
          },
          provider: { require_parameters: true },
        }),
        signal,
      });

      let reponse = await envoyer();
      if (estTemporaire(reponse.status)) {
        await new Promise((r) => setTimeout(r, PAUSE_AVANT_NOUVEL_ESSAI_MS));
        reponse = await envoyer();
      }
      if (!reponse.ok) {
        throw new Error(`OpenRouter a répondu ${reponse.status} : ${(await reponse.text()).slice(0, 300)}`);
      }
      const donnees = (await reponse.json()) as {
        error?: { message?: string };
        choices?: { message?: { content?: unknown } }[];
      };
      if (donnees.error) throw new Error(`OpenRouter : ${donnees.error.message ?? "erreur inconnue"}`);
      const contenu = donnees.choices?.[0]?.message?.content;
      if (typeof contenu !== "string") throw new Error("OpenRouter : réponse sans contenu");
      return JSON.parse(contenu);
    },
  };
}
