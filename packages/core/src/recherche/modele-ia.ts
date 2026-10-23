import type { z } from "zod";

export interface RequeteObjet {
  instructions: string;
  entree: string;
  schema: z.ZodType;
}

/**
 * Port vers un fournisseur d'IA, quel qu'il soit. Un adaptateur renvoie l'objet JSON brut produit
 * par le modèle : la validation contre `schema` est faite par l'appelant, pas par l'adaptateur.
 */
export interface ModeleIA {
  genererObjet(requete: RequeteObjet): Promise<unknown>;
}
