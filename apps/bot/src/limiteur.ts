/**
 * Limite le nombre de questions par utilisateur sur une fenêtre glissante, pour borner le coût de
 * l'IA. Tout reste en mémoire : rien n'est conservé au redémarrage.
 */
export class Limiteur {
  private readonly historique = new Map<number, number[]>();

  constructor(
    private readonly maximum: number,
    private readonly fenetreMs: number,
    private readonly maintenant: () => number = Date.now,
  ) {}

  autoriser(utilisateur: number): boolean {
    const instant = this.maintenant();
    const recents = (this.historique.get(utilisateur) ?? []).filter((t) => instant - t < this.fenetreMs);
    if (recents.length >= this.maximum) {
      this.historique.set(utilisateur, recents);
      return false;
    }
    recents.push(instant);
    this.historique.set(utilisateur, recents);
    return true;
  }
}
