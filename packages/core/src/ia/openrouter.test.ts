import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { creerModeleOpenRouter, URL_OPENROUTER } from "./openrouter";

const schema = z.object({ ids: z.array(z.string()).max(10) });

function fauxFetch(reponse: Response | (() => Promise<Response>)) {
  return vi.fn<typeof fetch>(async () => (typeof reponse === "function" ? reponse() : reponse));
}

const reponseJson = (corps: unknown, status = 200) =>
  new Response(JSON.stringify(corps), { status, headers: { "Content-Type": "application/json" } });

const succes = (contenu: string) => reponseJson({ choices: [{ message: { content: contenu } }] });

describe("creerModeleOpenRouter", () => {
  it("envoie une requête de sortie structurée, avec le contexte en tête et marqué pour le cache", async () => {
    const fetch = fauxFetch(succes('{"ids":["a"]}'));
    const ia = creerModeleOpenRouter({ cleApi: "cle-test", modele: "fournisseur/modele", fetch });

    await ia.genererObjet({ instructions: "consigne", contexte: "catalogue", entree: "question", schema });

    const [url, init] = fetch.mock.calls[0]!;
    expect(url).toBe(URL_OPENROUTER);
    expect(init?.method).toBe("POST");
    expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer cle-test");
    const corps = JSON.parse(String(init?.body));
    expect(corps).toMatchObject({
      model: "fournisseur/modele",
      provider: { require_parameters: true },
      messages: [
        { role: "system", content: "consigne" },
        {
          role: "user",
          content: [
            { type: "text", text: "catalogue", cache_control: { type: "ephemeral" } },
            { type: "text", text: "question" },
          ],
        },
      ],
      response_format: { type: "json_schema", json_schema: { name: "reponse", strict: true } },
    });
    expect(corps.response_format.json_schema.schema).toMatchObject({
      type: "object",
      required: ["ids"],
      additionalProperties: false,
    });
    expect(corps.response_format.json_schema.schema).not.toHaveProperty("$schema");
    expect(Object.keys(corps).sort()).toEqual(["max_tokens", "messages", "model", "provider", "response_format"]);
    expect(corps.max_tokens).toBeLessThanOrEqual(1000);
  });

  it("renvoie l'objet JSON produit par le modèle", async () => {
    const ia = creerModeleOpenRouter({ cleApi: "k", modele: "m", fetch: fauxFetch(succes('{"ids":["a","b"]}')) });

    expect(await ia.genererObjet({ instructions: "", entree: "q", schema })).toEqual({ ids: ["a", "b"] });
  });

  it("n'envoie que la question quand il n'y a pas de contexte", async () => {
    const fetch = fauxFetch(succes("{}"));
    const ia = creerModeleOpenRouter({ cleApi: "k", modele: "m", fetch });

    await ia.genererObjet({ instructions: "", entree: "question", schema });

    const corps = JSON.parse(String(fetch.mock.calls[0]![1]?.body));
    expect(corps.messages[1].content).toEqual([{ type: "text", text: "question" }]);
  });

  it("échoue clairement sur une erreur HTTP", async () => {
    const fetch = fauxFetch(new Response("crédit insuffisant", { status: 402 }));
    const ia = creerModeleOpenRouter({ cleApi: "k", modele: "m", fetch });

    await expect(ia.genererObjet({ instructions: "", entree: "q", schema })).rejects.toThrow(
      "OpenRouter a répondu 402 : crédit insuffisant",
    );
  });

  it("réessaie une fois après une erreur temporaire (429, 5xx)", async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(new Response("réessayez", { status: 429 }))
      .mockResolvedValueOnce(succes('{"ids":["a"]}'));
    const ia = creerModeleOpenRouter({ cleApi: "k", modele: "m", fetch });

    expect(await ia.genererObjet({ instructions: "", entree: "q", schema })).toEqual({ ids: ["a"] });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("abandonne après un second échec temporaire, et ne réessaie pas une erreur définitive", async () => {
    const temporaire = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(new Response("", { status: 503 }))
      .mockResolvedValueOnce(new Response("toujours indisponible", { status: 503 }));
    const definitive = vi.fn<typeof globalThis.fetch>().mockResolvedValueOnce(new Response("mauvaise clé", { status: 401 }));

    await expect(
      creerModeleOpenRouter({ cleApi: "k", modele: "m", fetch: temporaire }).genererObjet({ instructions: "", entree: "q", schema }),
    ).rejects.toThrow("503");
    await expect(
      creerModeleOpenRouter({ cleApi: "k", modele: "m", fetch: definitive }).genererObjet({ instructions: "", entree: "q", schema }),
    ).rejects.toThrow("401");
    expect(temporaire).toHaveBeenCalledTimes(2);
    expect(definitive).toHaveBeenCalledTimes(1);
  });

  it("échoue sur une erreur signalée dans le corps de la réponse", async () => {
    const fetch = fauxFetch(reponseJson({ error: { message: "modèle inconnu" } }));
    const ia = creerModeleOpenRouter({ cleApi: "k", modele: "m", fetch });

    await expect(ia.genererObjet({ instructions: "", entree: "q", schema })).rejects.toThrow("modèle inconnu");
  });

  it("échoue sur une réponse sans contenu ou qui n'est pas du JSON", async () => {
    const vide = creerModeleOpenRouter({ cleApi: "k", modele: "m", fetch: fauxFetch(reponseJson({ choices: [] })) });
    const texte = creerModeleOpenRouter({ cleApi: "k", modele: "m", fetch: fauxFetch(succes("Voici les ids : a")) });

    await expect(vide.genererObjet({ instructions: "", entree: "q", schema })).rejects.toThrow("sans contenu");
    await expect(texte.genererObjet({ instructions: "", entree: "q", schema })).rejects.toThrow();
  });

  it("abandonne après le délai maximal", async () => {
    const sansReponse = vi.fn<typeof fetch>(
      (_url, init) =>
        new Promise((_resoudre, rejeter) => {
          init?.signal?.addEventListener("abort", () => rejeter(init.signal?.reason));
        }),
    );
    const ia = creerModeleOpenRouter({ cleApi: "k", modele: "m", fetch: sansReponse, delaiMaxMs: 20 });

    await expect(ia.genererObjet({ instructions: "", entree: "q", schema })).rejects.toThrow();
  });
});
