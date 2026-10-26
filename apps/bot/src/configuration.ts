export interface Configuration {
  jetonTelegram: string;
  cleOpenRouter: string;
  modele: string;
  dossierCorpus: string;
  questionsParHeure: number;
}

const OBLIGATOIRES = {
  jetonTelegram: "TELEGRAM_BOT_TOKEN",
  cleOpenRouter: "OPENROUTER_API_KEY",
  modele: "OPENROUTER_MODEL",
  dossierCorpus: "AECBOT_CORPUS",
} as const;

export function lireConfiguration(env: Record<string, string | undefined>): Configuration {
  const manquantes = Object.values(OBLIGATOIRES).filter((nom) => !env[nom]);
  if (manquantes.length > 0) {
    throw new Error(`Variables d'environnement manquantes : ${manquantes.join(", ")}`);
  }

  const questionsParHeure = Number(env.AECBOT_QUESTIONS_PAR_HEURE ?? 20);
  if (!Number.isInteger(questionsParHeure) || questionsParHeure < 1) {
    throw new Error("AECBOT_QUESTIONS_PAR_HEURE doit être un entier positif");
  }

  return {
    jetonTelegram: env[OBLIGATOIRES.jetonTelegram]!,
    cleOpenRouter: env[OBLIGATOIRES.cleOpenRouter]!,
    modele: env[OBLIGATOIRES.modele]!,
    dossierCorpus: env[OBLIGATOIRES.dossierCorpus]!,
    questionsParHeure,
  };
}
